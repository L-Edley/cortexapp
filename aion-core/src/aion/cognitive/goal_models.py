from __future__ import annotations
import datetime
from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class GoalType(str, Enum):
    business_growth = "business_growth"
    product_development = "product_development"
    project_planning = "project_planning"
    learning = "learning"
    research = "research"
    analysis = "analysis"
    automation = "automation"
    strategy = "strategy"
    troubleshooting = "troubleshooting"
    content_creation = "content_creation"
    personal_organization = "personal_organization"
    unknown = "unknown"


class ComplexityLevel(str, Enum):
    trivial = "trivial"
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class CapabilityMode(str, Enum):
    chat = "chat"
    study = "study"
    dev = "dev"
    teacher = "teacher"
    research = "research"
    sync = "sync"
    rebuild = "rebuild"
    rag = "rag"
    planner = "planner"
    reflection = "reflection"


class TaskStatus(str, Enum):
    pending = "pending"
    in_progress = "in_progress"
    completed = "completed"
    failed = "failed"
    blocked = "blocked"
    skipped = "skipped"


class GoalAnalysis(BaseModel):
    goal_type: GoalType = GoalType.unknown
    complexity: ComplexityLevel = ComplexityLevel.medium
    domains: List[str] = Field(default_factory=list)
    estimated_steps: int = Field(default=1, ge=1, le=50)
    raw_input: str = ""
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    requires_approval: bool = Field(default=True)


class DecomposedTask(BaseModel):
    id: str = ""
    title: str = ""
    description: str = ""
    domain: str = ""
    niche: str = ""
    estimated_effort: str = "medium"
    depends_on: List[str] = Field(default_factory=list)
    status: TaskStatus = TaskStatus.pending
    capability: CapabilityMode = CapabilityMode.chat
    execution_guidance: str = ""
    validation_criteria: List[str] = Field(default_factory=list)
    result_summary: str = ""
    error: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class ExecutionStep(BaseModel):
    step_number: int = Field(ge=1)
    mode: CapabilityMode = CapabilityMode.chat
    task_id: str = ""
    objective: str = ""
    prompt: str = ""
    requires_user_input: bool = Field(default=False)
    status: TaskStatus = TaskStatus.pending
    result: Optional[str] = None
    error: Optional[str] = None
    validation_criteria: List[str] = Field(default_factory=list)


class RecommendedCapability(BaseModel):
    mode: CapabilityMode
    reason: str = ""
    priority: int = Field(default=5, ge=1, le=10)


class GoalPlan(BaseModel):
    goal_id: str = ""
    app_id: str = ""
    user_id: str = ""
    created_at: str = Field(default_factory=lambda: datetime.datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.datetime.utcnow().isoformat())
    raw_input: str = ""
    analysis: GoalAnalysis = Field(default_factory=GoalAnalysis)
    tasks: List[DecomposedTask] = Field(default_factory=list)
    execution_plan: List[ExecutionStep] = Field(default_factory=list)
    recommended_capabilities: List[RecommendedCapability] = Field(default_factory=list)
    active: bool = True
    current_step: int = Field(default=0)
    total_steps: int = Field(default=0)
    completed_steps: int = Field(default=0)
    failed_steps: int = Field(default=0)
    status: str = Field(default="draft")


class Reflection(BaseModel):
    reflection_id: str = ""
    goal_id: str = ""
    app_id: str = ""
    step_number: int = Field(default=0)
    input_snapshot: str = ""
    output_snapshot: str = ""
    success: bool = Field(default=True)
    error_type: Optional[str] = None
    error_detail: Optional[str] = None
    improvement_suggestion: Optional[str] = None
    lesson_learned: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.datetime.utcnow().isoformat())
    niche: str = "general"
    domain: str = "general"


class LearnedStrategy(BaseModel):
    strategy_id: str = ""
    app_id: str = ""
    pattern: str = ""
    context: str = ""
    recommended_mode: CapabilityMode = CapabilityMode.chat
    success_rate: float = Field(default=0.0, ge=0.0, le=1.0)
    usage_count: int = Field(default=0)
    tags: List[str] = Field(default_factory=list)
    created_at: str = Field(default_factory=lambda: datetime.datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.datetime.utcnow().isoformat())


class GoalFilter(BaseModel):
    app_id: Optional[str] = None
    goal_type: Optional[GoalType] = None
    status: Optional[str] = None
    limit: int = Field(default=10, ge=1, le=100)
