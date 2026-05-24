import pytest
from typing import List, Dict, Any


class TestTimelineEvent:
    def test_default_event(self):
        from aion.workspace.timeline import TimelineEvent
        event = TimelineEvent()
        assert event.id == ""
        assert event.event_type == ""
        assert event.title == ""
        assert event.category == "orchestration"
        assert event.created_at != ""

    def test_event_with_values(self):
        from aion.workspace.timeline import TimelineEvent
        event = TimelineEvent(
            id="evt1",
            event_type="goal_detected",
            title="Goal detected: monetizar",
            category="orchestration",
            metadata={"goal": "monetizar"},
        )
        assert event.id == "evt1"
        assert event.title == "Goal detected: monetizar"


class TestEventBus:
    def test_emit_and_get_recent(self):
        from aion.workspace.event_bus import EventBus
        bus = EventBus()
        bus.emit("goal_detected", {"goal": "test"})
        bus.emit("reflection_generated", {})
        recent = bus.get_recent()
        assert len(recent) == 2
        assert recent[0].type == "goal_detected"
        assert recent[1].type == "reflection_generated"

    def test_emit_assigns_id_and_timestamp(self):
        from aion.workspace.event_bus import EventBus
        bus = EventBus()
        event = bus.emit("test_event", {"data": "val"})
        assert event.event_id != ""
        assert event.timestamp != ""

    def test_get_by_type(self):
        from aion.workspace.event_bus import EventBus
        bus = EventBus()
        bus.emit("goal_detected", {"g": 1})
        bus.emit("reflection_generated", {})
        bus.emit("goal_detected", {"g": 2})
        goals = bus.get_by_type("goal_detected")
        assert len(goals) == 2

    def test_max_events(self):
        from aion.workspace.event_bus import EventBus
        bus = EventBus(max_events=10)
        for i in range(15):
            bus.emit(f"event_{i}", {})
        assert len(bus.get_recent()) == 10

    def test_subscribe_and_notify(self):
        from aion.workspace.event_bus import EventBus
        bus = EventBus()
        received = []
        def listener(event):
            received.append(event.type)
        bus.subscribe("goal_detected", listener)
        bus.emit("goal_detected", {})
        bus.emit("reflection_generated", {})
        assert received == ["goal_detected"]

    def test_unsubscribe(self):
        from aion.workspace.event_bus import EventBus
        bus = EventBus()
        received = []
        def listener(event):
            received.append(event.type)
        bus.subscribe("goal_detected", listener)
        bus.unsubscribe("goal_detected", listener)
        bus.emit("goal_detected", {})
        assert received == []

    def test_clear(self):
        from aion.workspace.event_bus import EventBus
        bus = EventBus()
        bus.emit("goal_detected", {})
        bus.clear()
        assert len(bus.get_recent()) == 0

    def test_emit_invalid_type_still_works(self):
        from aion.workspace.event_bus import EventBus
        bus = EventBus()
        event = bus.emit("custom_type", {"any": "data"})
        assert event.type == "custom_type"

    def test_singleton(self):
        from aion.workspace.event_bus import get_event_bus, EventBus
        b1 = get_event_bus()
        b2 = get_event_bus()
        assert b1 is b2


class TestTimelineEngine:
    def test_add_event_assigns_id_and_category(self):
        from aion.workspace.timeline import TimelineEngine
        tl = TimelineEngine()
        event = tl.add_event("goal_detected", {"goal": "monetizar"})
        assert event.id != ""
        assert event.category == "orchestration"
        assert "Goal detected" in event.title

    def test_get_events_returns_in_order(self):
        from aion.workspace.timeline import TimelineEngine
        tl = TimelineEngine()
        tl.add_event("goal_detected", {"goal": "g1"})
        tl.add_event("reflection_generated", {})
        events = tl.get_events()
        assert len(events) == 2
        assert events[0].event_type == "goal_detected"
        assert events[1].event_type == "reflection_generated"

    def test_get_events_filter_by_category(self):
        from aion.workspace.timeline import TimelineEngine
        tl = TimelineEngine()
        tl.add_event("goal_detected", {"goal": "g1"})
        tl.add_event("study_completed", {})
        tl.add_event("reflection_generated", {})
        exec_events = tl.get_events(category="orchestration")
        assert len(exec_events) == 1
        assert exec_events[0].event_type == "goal_detected"
        study_events = tl.get_events(category="study")
        assert len(study_events) == 1

    def test_get_events_limits(self):
        from aion.workspace.timeline import TimelineEngine
        tl = TimelineEngine()
        for i in range(10):
            tl.add_event("goal_detected", {"goal": f"g{i}"})
        events = tl.get_events(limit=3)
        assert len(events) == 3

    def test_get_by_id(self):
        from aion.workspace.timeline import TimelineEngine
        tl = TimelineEngine()
        event = tl.add_event("goal_detected", {"goal": "test"})
        found = tl.get_by_id(event.id)
        assert found is not None
        assert found.id == event.id

    def test_get_by_id_not_found(self):
        from aion.workspace.timeline import TimelineEngine
        tl = TimelineEngine()
        found = tl.get_by_id("nonexistent")
        assert found is None

    def test_get_categories(self):
        from aion.workspace.timeline import TimelineEngine
        tl = TimelineEngine()
        cats = tl.get_categories()
        assert "execution" in cats
        assert "reflection" in cats
        assert "orchestration" in cats

    def test_clear(self):
        from aion.workspace.timeline import TimelineEngine
        tl = TimelineEngine()
        tl.add_event("goal_detected", {})
        tl.clear()
        assert len(tl.get_events()) == 0

    def test_get_recent_summary(self):
        from aion.workspace.timeline import TimelineEngine
        tl = TimelineEngine()
        tl.add_event("goal_detected", {"goal": "monetizar"})
        tl.add_event("reflection_generated", {})
        summary = tl.get_recent_summary(limit=10)
        assert len(summary) == 2
        assert summary[0]["title"] != ""
        assert summary[0]["category"] == "orchestration"

    def test_unknown_event_type_falls_back(self):
        from aion.workspace.timeline import TimelineEngine
        tl = TimelineEngine()
        event = tl.add_event("unknown_type", {"some": "data"})
        assert event.category == "orchestration"
        assert event.title == "unknown_type"

    def test_singleton(self):
        from aion.workspace.timeline import get_timeline, TimelineEngine
        t1 = get_timeline()
        t2 = get_timeline()
        assert t1 is t2


class TestSafety:
    def test_event_bus_never_executes(self):
        from aion.workspace.event_bus import EventBus
        bus = EventBus()
        assert not hasattr(bus, "execute")
        assert not hasattr(bus, "shell")

    def test_timeline_never_executes(self):
        from aion.workspace.timeline import TimelineEngine
        tl = TimelineEngine()
        assert not hasattr(tl, "execute")
        assert not hasattr(tl, "run")
