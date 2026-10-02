from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.modules.compliance.core.errors import AppError, ForbiddenError
from app.modules.compliance.domain.auth_store import AuthUserRecord, SeedAuthStore
from app.modules.compliance.domain.seed_time import relative_datetime_iso

NOTIFICATION_TYPES = {"SYSTEM", "INSPECTION", "ASSESSMENT", "ISSUE", "WORKFLOW", "OTHER"}
NOTIFICATION_SOURCE_MODULES = NOTIFICATION_TYPES
NOTIFICATION_SEVERITIES = {"INFO", "WARNING", "URGENT"}
NOTIFICATION_READ_STATES = {"UNREAD", "READ", "ARCHIVED"}
NOTIFICATION_CHANNELS = {"IN_APP", "EKP", "EMAIL"}
NOTIFICATION_DELIVERY_STATUSES = {"PENDING", "SENT", "FAILED", "SUPPRESSED"}


@dataclass
class NotificationMessageRecord:
    notification_id: str
    source_module: str
    type: str
    severity: str
    title: str
    content: str
    created_by: str
    created_at: str
    source_entity_type: str | None = None
    source_entity_id: str | None = None
    action_target: dict[str, Any] = field(default_factory=dict)
    expires_at: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class NotificationRecipientStateRecord:
    notification_id: str
    recipient_user_id: str
    recipient_org_id: str | None
    read_state: str = "UNREAD"
    read_at: str | None = None
    archived_at: str | None = None
    created_at: str = field(default_factory=relative_datetime_iso)
    updated_at: str = field(default_factory=relative_datetime_iso)
    version: int = 1

    @property
    def recipient_state_id(self) -> str:
        return f"NRS-{self.notification_id}-{self.recipient_user_id}"


@dataclass
class NotificationDeliveryEventRecord:
    delivery_event_id: str
    notification_id: str
    recipient_user_id: str
    channel: str
    delivery_status: str
    attempted_at: str
    provider_message_id: str | None = None
    error_code: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


class SeedNotificationStore:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.messages: dict[str, NotificationMessageRecord] = {}
        self.recipient_states: dict[tuple[str, str], NotificationRecipientStateRecord] = {}
        self.delivery_events: dict[str, NotificationDeliveryEventRecord] = {}
        self._build_seed_notifications()

    def notification_page(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        type: str | None = None,
        is_read: bool | None = None,
        source_module: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        self._require_read(user, auth_store)
        self._validate_optional(type, NOTIFICATION_TYPES, "type")
        self._validate_optional(source_module, NOTIFICATION_SOURCE_MODULES, "sourceModule")
        rows = [
            self.notification_view(message, state)
            for message, state in self._own_message_states(user)
            if (type is None or message.type == type)
            and (source_module is None or message.source_module == source_module)
            and (is_read is None or (state.read_state == "READ") == is_read)
            and state.read_state != "ARCHIVED"
        ]
        rows.sort(key=lambda item: (item["createdAt"], item["notificationId"]), reverse=True)
        start = (page - 1) * page_size
        end = start + page_size
        return {
            "items": rows[start:end],
            "page": page,
            "pageSize": page_size,
            "total": len(rows),
        }

    def unread_count(self, *, user: AuthUserRecord, auth_store: SeedAuthStore) -> dict[str, Any]:
        self._require_read(user, auth_store)
        count = sum(
            1
            for _, state in self._own_message_states(user)
            if state.read_state == "UNREAD"
        )
        return {"unreadCount": count}

    def mark_read(
        self,
        *,
        notification_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        self._require_mark_read(user, auth_store)
        message = self.messages.get(notification_id)
        state = self.recipient_states.get((notification_id, user.user_id))
        if not message or not state:
            raise AppError(
                code="NOTIFICATION_NOT_FOUND",
                message="Notification not found",
                status_code=404,
            )
        if state.read_state == "ARCHIVED":
            raise AppError(
                code="NOTIFICATION_ARCHIVED",
                message="Notification is archived",
                status_code=409,
            )
        changed = False
        if state.read_state == "UNREAD":
            now = relative_datetime_iso()
            state.read_state = "READ"
            state.read_at = now
            state.updated_at = now
            state.version += 1
            changed = True
        return {
            **self.notification_view(message, state),
            "changed": changed,
        }

    def mark_all_read(self, *, user: AuthUserRecord, auth_store: SeedAuthStore) -> dict[str, Any]:
        self._require_mark_read(user, auth_store)
        affected = 0
        now = relative_datetime_iso()
        for _, state in self._own_message_states(user):
            if state.read_state != "UNREAD":
                continue
            state.read_state = "READ"
            state.read_at = now
            state.updated_at = now
            state.version += 1
            affected += 1
        return {"affectedCount": affected, "readAt": now if affected else None}

    def create_in_app_notification(
        self,
        *,
        notification_id: str,
        recipient_user_ids: list[str],
        auth_store: SeedAuthStore,
        source_module: str,
        type: str,
        severity: str,
        title: str,
        content: str,
        created_by: str = "SYSTEM-SEED",
        source_entity_type: str | None = None,
        source_entity_id: str | None = None,
        action_target: dict[str, Any] | None = None,
        read_by: set[str] | None = None,
        created_at: str | None = None,
    ) -> None:
        self._validate_required(source_module, NOTIFICATION_SOURCE_MODULES, "sourceModule")
        self._validate_required(type, NOTIFICATION_TYPES, "type")
        self._validate_required(severity, NOTIFICATION_SEVERITIES, "severity")
        timestamp = created_at or relative_datetime_iso()
        self.messages[notification_id] = NotificationMessageRecord(
            notification_id=notification_id,
            source_module=source_module,
            source_entity_type=source_entity_type,
            source_entity_id=source_entity_id,
            type=type,
            severity=severity,
            title=title,
            content=content,
            action_target=action_target or {},
            created_by=created_by,
            created_at=timestamp,
            metadata={"seed": True},
        )
        read_by = read_by or set()
        for recipient_user_id in recipient_user_ids:
            user = auth_store.users.get(recipient_user_id)
            if not user:
                continue
            read_state = "READ" if recipient_user_id in read_by else "UNREAD"
            read_at = timestamp if read_state == "READ" else None
            state = NotificationRecipientStateRecord(
                notification_id=notification_id,
                recipient_user_id=recipient_user_id,
                recipient_org_id=user.org_id,
                read_state=read_state,
                read_at=read_at,
                created_at=timestamp,
                updated_at=timestamp,
            )
            self.recipient_states[(notification_id, recipient_user_id)] = state
            delivery_event_id = f"NDE-{notification_id}-{recipient_user_id}-INAPP"
            self.delivery_events[delivery_event_id] = NotificationDeliveryEventRecord(
                delivery_event_id=delivery_event_id,
                notification_id=notification_id,
                recipient_user_id=recipient_user_id,
                channel="IN_APP",
                delivery_status="SENT",
                attempted_at=timestamp,
                metadata={"seed": True},
            )

    def notification_view(
        self,
        message: NotificationMessageRecord,
        state: NotificationRecipientStateRecord,
    ) -> dict[str, Any]:
        return {
            "notificationId": message.notification_id,
            "id": message.notification_id,
            "sourceModule": message.source_module,
            "sourceEntityType": message.source_entity_type,
            "sourceEntityId": message.source_entity_id,
            "type": message.type,
            "severity": message.severity,
            "title": message.title,
            "content": message.content,
            "actionTarget": message.action_target,
            "createdBy": message.created_by,
            "createdAt": message.created_at,
            "expiresAt": message.expires_at,
            "readState": state.read_state,
            "isRead": state.read_state == "READ",
            "readAt": state.read_at,
            "recipientUserId": state.recipient_user_id,
            "recipientOrgId": state.recipient_org_id,
            "version": state.version,
        }

    def _own_message_states(
        self,
        user: AuthUserRecord,
    ) -> list[tuple[NotificationMessageRecord, NotificationRecipientStateRecord]]:
        rows: list[tuple[NotificationMessageRecord, NotificationRecipientStateRecord]] = []
        for key, state in self.recipient_states.items():
            notification_id, recipient_user_id = key
            if recipient_user_id != user.user_id:
                continue
            message = self.messages.get(notification_id)
            if message:
                rows.append((message, state))
        return rows

    def _require_read(self, user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        if auth_store.has_permission(user, "PERM-P2-NOTIFICATION-READ-OWN"):
            return
        raise ForbiddenError()

    def _require_mark_read(self, user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        if auth_store.has_permission(user, "PERM-P2-NOTIFICATION-MARK-READ"):
            return
        raise ForbiddenError()

    def _build_seed_notifications(self) -> None:
        # Imported lazily by callers after auth_store.reset() has built users.
        from app.modules.compliance.domain.auth_store import auth_store

        self.create_in_app_notification(
            notification_id="NOTIF-HQ-SYSTEM-001",
            recipient_user_ids=["USER-HQ-COMP-001"],
            auth_store=auth_store,
            source_module="SYSTEM",
            type="SYSTEM",
            severity="INFO",
            title="P2 通知读回执已启用",
            content="系统通知中心已接入后端读回执，未读数与待办数保持独立。",
            created_at=relative_datetime_iso(hour=8, minute=30),
        )
        self.create_in_app_notification(
            notification_id="NOTIF-HQ-INSPECTION-001",
            recipient_user_ids=["USER-HQ-COMP-001"],
            auth_store=auth_store,
            source_module="INSPECTION",
            source_entity_type="UnifiedTask",
            source_entity_id="TASK-HQ-PLAN-REVIEW-001",
            type="INSPECTION",
            severity="WARNING",
            title="检查计划待复核提醒",
            content="反洗钱专项检查计划仍有总部复核待办，请从待办中心打开处理。",
            action_target={
                "kind": "route",
                "menuId": "hq-tasks",
                "appPath": "/hq/tasks",
                "publicPath": "/compliance/hq/tasks",
                "params": {"taskId": "TASK-HQ-PLAN-REVIEW-001"},
                "action": "TASK_FILTER_OR_SEARCH",
            },
            created_at=relative_datetime_iso(hour=8, minute=40),
        )
        self.create_in_app_notification(
            notification_id="NOTIF-HQ-ASSESSMENT-READ-001",
            recipient_user_ids=["USER-HQ-COMP-001"],
            auth_store=auth_store,
            source_module="ASSESSMENT",
            type="ASSESSMENT",
            severity="INFO",
            title="考核看板数据已刷新",
            content="P1 考核看板读模型已刷新，可进入治理驾驶舱查看。",
            read_by={"USER-HQ-COMP-001"},
            created_at=relative_datetime_iso(hour=8, minute=50),
        )
        self.create_in_app_notification(
            notification_id="NOTIF-BR-TASK-001",
            recipient_user_ids=["USER-BRANCH-COMP-001"],
            auth_store=auth_store,
            source_module="INSPECTION",
            source_entity_type="UnifiedTask",
            source_entity_id="TASK-BR-EVIDENCE-001",
            type="INSPECTION",
            severity="URGENT",
            title="材料报送待提交",
            content="您有一项检查材料报送任务尚未完成，请按截止日前提交真实文件。",
            action_target={
                "kind": "route",
                "menuId": "branch-tasks",
                "appPath": "/branch/tasks",
                "publicPath": "/compliance/branch/tasks",
                "params": {"taskId": "TASK-BR-EVIDENCE-001"},
                "action": "TASK_FILTER_OR_SEARCH",
            },
            created_at=relative_datetime_iso(hour=9, minute=0),
        )
        self.create_in_app_notification(
            notification_id="NOTIF-BR-READ-001",
            recipient_user_ids=["USER-BRANCH-COMP-001"],
            auth_store=auth_store,
            source_module="ISSUE",
            type="ISSUE",
            severity="INFO",
            title="整改反馈入口提示",
            content="整改反馈请通过分支问题台账进入，通知已读不会改变整改状态。",
            read_by={"USER-BRANCH-COMP-001"},
            created_at=relative_datetime_iso(hour=9, minute=10),
        )
        self.create_in_app_notification(
            notification_id="NOTIF-OTHER-BRANCH-001",
            recipient_user_ids=["USER-BRANCH-OPER-001"],
            auth_store=auth_store,
            source_module="SYSTEM",
            type="SYSTEM",
            severity="INFO",
            title="其他机构隔离通知",
            content="该通知用于证明跨机构/跨用户不可见。",
            created_at=relative_datetime_iso(hour=9, minute=20),
        )

    @staticmethod
    def _validate_required(value: str, allowed: set[str], field: str) -> None:
        if value not in allowed:
            raise AppError(
                code="VALIDATION_ERROR",
                message=f"{field} must use a canonical code",
                status_code=422,
                details={"field": field, "received": value, "allowedValues": sorted(allowed)},
            )

    @classmethod
    def _validate_optional(cls, value: str | None, allowed: set[str], field: str) -> None:
        if value is not None:
            cls._validate_required(value, allowed, field)


notification_store = SeedNotificationStore()
