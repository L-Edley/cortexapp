import uuid
import datetime
import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

logger = logging.getLogger("aion.runtime.goal_engine")


class GoalMilestone(BaseModel):
    id: str = ""
    title: str = ""
    completed: bool = False
    completed_at: Optional[str] = None


class LongTermGoal(BaseModel):
    id: str = ""
    title: str = ""
    objective: str = ""
    milestones: List[GoalMilestone] = Field(default_factory=list)
    progress: float = Field(default=0.0, ge=0.0, le=1.0)
    active: bool = True
    reflections: List[Dict[str, Any]] = Field(default_factory=list)
    created_at: str = Field(default_factory=lambda: datetime.datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.datetime.utcnow().isoformat())


class GoalEngine:
    def __init__(self):
        self._goals: Dict[str, LongTermGoal] = {}

    async def create_goal(self, app_id: str, title: str, objective: str, milestones: Optional[List[str]] = None) -> LongTermGoal:
        goal = LongTermGoal(
            id=str(uuid.uuid4()),
            title=title[:200],
            objective=objective[:1000],
            milestones=[
                GoalMilestone(id=str(uuid.uuid4()), title=m[:200])
                for m in (milestones or [])
            ],
        )
        self._goals[goal.id] = goal
        await self._persist(app_id, goal)
        logger.info("Goal created: %s — %s", goal.id[:12], title[:50])
        return goal

    async def update_progress(self, app_id: str, goal_id: str, progress: float) -> Optional[LongTermGoal]:
        goal = self._goals.get(goal_id)
        if not goal:
            return None
        goal.progress = max(0.0, min(1.0, progress))
        goal.updated_at = datetime.datetime.utcnow().isoformat()
        await self._persist(app_id, goal)
        return goal

    async def complete_milestone(self, app_id: str, goal_id: str, milestone_id: str) -> Optional[LongTermGoal]:
        goal = self._goals.get(goal_id)
        if not goal:
            return None
        for m in goal.milestones:
            if m.id == milestone_id:
                m.completed = True
                m.completed_at = datetime.datetime.utcnow().isoformat()
                break
        completed = sum(1 for m in goal.milestones if m.completed)
        total = len(goal.milestones)
        goal.progress = completed / total if total > 0 else 0.0
        goal.updated_at = datetime.datetime.utcnow().isoformat()
        await self._persist(app_id, goal)
        return goal

    async def add_reflection(self, app_id: str, goal_id: str, reflection: Dict[str, Any]) -> Optional[LongTermGoal]:
        goal = self._goals.get(goal_id)
        if not goal:
            return None
        goal.reflections.append(reflection)
        goal.updated_at = datetime.datetime.utcnow().isoformat()
        await self._persist(app_id, goal)
        return goal

    async def close_goal(self, app_id: str, goal_id: str) -> Optional[LongTermGoal]:
        goal = self._goals.get(goal_id)
        if not goal:
            return None
        goal.active = False
        goal.updated_at = datetime.datetime.utcnow().isoformat()
        await self._persist(app_id, goal)
        return goal

    def get_goal(self, goal_id: str) -> Optional[LongTermGoal]:
        return self._goals.get(goal_id)

    def list_goals(self, active_only: bool = True) -> List[LongTermGoal]:
        goals = list(self._goals.values())
        if active_only:
            goals = [g for g in goals if g.active]
        return sorted(goals, key=lambda g: g.created_at, reverse=True)

    async def _persist(self, app_id: str, goal: LongTermGoal) -> None:
        try:
            from aion.memory.sqlite_store import save_knowledge
            ms = sum(1 for m in goal.milestones if m.completed)
            mt = len(goal.milestones)
            content = (
                f"[LongTermGoal] {goal.title}\n"
                f"Progresso: {ms}/{mt} milestones ({goal.progress:.0%})\n"
                f"Objetivo: {goal.objective[:200]}"
            )
            tags = ["runtime", "goal", "active" if goal.active else "completed"]
            await save_knowledge(
                app_id=app_id,
                content=content,
                tags=tags,
                confidence=goal.progress,
                domain="runtime",
                niche="long_term_goals",
                topic=goal.title[:50],
                source_mode="runtime",
            )
        except Exception as e:
            logger.debug("Failed to persist goal: %s", e)


_goal_engine_instance: Optional[GoalEngine] = None


def get_goal_engine() -> GoalEngine:
    global _goal_engine_instance
    if _goal_engine_instance is None:
        _goal_engine_instance = GoalEngine()
    return _goal_engine_instance
