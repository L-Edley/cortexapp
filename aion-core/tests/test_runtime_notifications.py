import pytest


class TestNotification:
    def test_default(self):
        from aion.runtime.notifications import Notification
        n = Notification()
        assert n.type == "insight"
        assert not n.read
        assert n.title == ""

    def test_with_values(self):
        from aion.runtime.notifications import Notification
        n = Notification(id="n1", type="warning", title="CPU high")
        assert n.id == "n1"
        assert n.type == "warning"


class TestNotificationStore:
    def test_add(self):
        from aion.runtime.notifications import NotificationStore
        store = NotificationStore()
        n = store.add("insight", "New insight", "something interesting")
        assert n.id != ""
        assert n.type == "insight"
        assert not n.read

    def test_add_invalid_type_falls_back(self):
        from aion.runtime.notifications import NotificationStore
        store = NotificationStore()
        n = store.add("invalid_type", "test")
        assert n.type == "runtime"

    def test_list_all(self):
        from aion.runtime.notifications import NotificationStore
        store = NotificationStore()
        store.add("insight", "i1")
        store.add("warning", "w1")
        store.add("insight", "i2")
        notes = store.list_all()
        assert len(notes) == 3

    def test_list_unread_only(self):
        from aion.runtime.notifications import NotificationStore
        store = NotificationStore()
        store.add("insight", "i1")
        n2 = store.add("insight", "i2")
        store.mark_read(n2.id)
        unread = store.list_all(unread_only=True)
        assert len(unread) == 1

    def test_list_filter_by_type(self):
        from aion.runtime.notifications import NotificationStore
        store = NotificationStore()
        store.add("insight", "i1")
        store.add("warning", "w1")
        warnings = store.list_all(type_filter="warning")
        assert len(warnings) == 1
        assert warnings[0].type == "warning"

    def test_mark_read(self):
        from aion.runtime.notifications import NotificationStore
        store = NotificationStore()
        n = store.add("insight", "test")
        assert store.mark_read(n.id)
        assert store.list_all(unread_only=True) == []

    def test_mark_read_nonexistent(self):
        from aion.runtime.notifications import NotificationStore
        store = NotificationStore()
        assert not store.mark_read("nonexistent")

    def test_mark_all_read(self):
        from aion.runtime.notifications import NotificationStore
        store = NotificationStore()
        store.add("insight", "i1")
        store.add("warning", "w1")
        count = store.mark_all_read()
        assert count == 2
        assert store.count_unread() == 0

    def test_count_unread(self):
        from aion.runtime.notifications import NotificationStore
        store = NotificationStore()
        assert store.count_unread() == 0
        store.add("insight", "test")
        assert store.count_unread() == 1

    def test_max_notifications(self):
        from aion.runtime.notifications import NotificationStore
        store = NotificationStore(max_notifications=5)
        for i in range(10):
            store.add("insight", f"note_{i}")
        assert len(store.list_all()) == 5

    def test_clear(self):
        from aion.runtime.notifications import NotificationStore
        store = NotificationStore()
        store.add("insight", "test")
        store.clear()
        assert store.list_all() == []

    def test_get_types(self):
        from aion.runtime.notifications import NotificationStore
        store = NotificationStore()
        types = store.get_types()
        assert "insight" in types
        assert "warning" in types

    def test_singleton(self):
        from aion.runtime.notifications import get_notification_store, NotificationStore
        s1 = get_notification_store()
        s2 = get_notification_store()
        assert s1 is s2


class TestSafety:
    def test_no_execute(self):
        from aion.runtime.notifications import NotificationStore
        store = NotificationStore()
        assert not hasattr(store, "execute")
        assert not hasattr(store, "shell")
