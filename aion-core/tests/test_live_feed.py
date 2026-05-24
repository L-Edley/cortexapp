import pytest


class TestLiveFeed:
    def test_push_entry(self):
        from aion.workspace.live_feed import LiveFeed
        from aion.workspace.timeline import TimelineEvent
        feed = LiveFeed()
        event = TimelineEvent(id="evt1", event_type="goal_detected", title="Goal detected")
        entry = feed.push(event)
        assert entry.id == "evt1"
        assert entry.title == "Goal detected"
        assert entry.icon == "🎯"

    def test_get_entries_returns_in_order(self):
        from aion.workspace.live_feed import LiveFeed
        from aion.workspace.timeline import TimelineEvent
        feed = LiveFeed()
        e1 = TimelineEvent(id="e1", event_type="goal_detected", title="G1")
        e2 = TimelineEvent(id="e2", event_type="reflection_generated", title="R1")
        feed.push(e1)
        feed.push(e2)
        entries = feed.get_entries()
        assert len(entries) == 2
        assert entries[0].id == "e1"
        assert entries[1].id == "e2"

    def test_max_entries(self):
        from aion.workspace.live_feed import LiveFeed
        from aion.workspace.timeline import TimelineEvent
        feed = LiveFeed(max_entries=5)
        for i in range(10):
            event = TimelineEvent(id=f"e{i}", event_type="test", title=f"E{i}")
            feed.push(event)
        assert len(feed.get_entries()) == 5
        assert feed.get_entries()[0].id == "e5"

    def test_get_entries_limit(self):
        from aion.workspace.live_feed import LiveFeed
        from aion.workspace.timeline import TimelineEvent
        feed = LiveFeed()
        for i in range(20):
            event = TimelineEvent(id=f"e{i}", event_type="test", title=f"E{i}")
            feed.push(event)
        entries = feed.get_entries(limit=5)
        assert len(entries) == 5

    def test_unknown_event_type_uses_default_icon(self):
        from aion.workspace.live_feed import LiveFeed
        from aion.workspace.timeline import TimelineEvent
        feed = LiveFeed()
        event = TimelineEvent(id="e1", event_type="completely_unknown", title="Test")
        entry = feed.push(event)
        assert entry.icon == "•"

    def test_clear(self):
        from aion.workspace.live_feed import LiveFeed
        from aion.workspace.timeline import TimelineEvent
        feed = LiveFeed()
        feed.push(TimelineEvent(id="e1", event_type="test", title="T1"))
        feed.clear()
        assert len(feed.get_entries()) == 0

    def test_push_assigns_timestamp(self):
        from aion.workspace.live_feed import LiveFeed
        from aion.workspace.timeline import TimelineEvent
        feed = LiveFeed()
        event = TimelineEvent(id="e1", event_type="goal_detected", title="G1")
        entry = feed.push(event)
        assert entry.created_at != ""

    def test_icons_for_all_event_types(self):
        from aion.workspace.live_feed import LiveFeed, _ICON_MAP
        feed = LiveFeed()
        from aion.workspace.timeline import TimelineEvent

        for event_type, expected_icon in _ICON_MAP.items():
            event = TimelineEvent(id=f"e_{event_type}", event_type=event_type, title=event_type)
            entry = feed.push(event)
            assert entry.icon == expected_icon, f"Icon mismatch for {event_type}"

    def test_singleton(self):
        from aion.workspace.live_feed import get_live_feed, LiveFeed
        f1 = get_live_feed()
        f2 = get_live_feed()
        assert f1 is f2


class TestSafety:
    def test_live_feed_no_execute(self):
        from aion.workspace.live_feed import LiveFeed
        feed = LiveFeed()
        assert not hasattr(feed, "execute")
        assert not hasattr(feed, "shell")
        assert not hasattr(feed, "run")
