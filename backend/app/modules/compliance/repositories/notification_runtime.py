from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.compliance.domain.notification_store import (
    NotificationDeliveryEventRecord,
    NotificationMessageRecord,
    NotificationRecipientStateRecord,
    notification_store,
)
from app.modules.compliance.models import (
    NotificationDeliveryEventModel,
    NotificationMessageModel,
    NotificationRecipientStateModel,
)


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.isoformat()


def _dt(value: str | None) -> datetime | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed


def _now() -> datetime:
    return datetime.now(UTC)


class NotificationRuntimeRepository:
    """Bridge notification seed-store semantics to persisted runtime rows."""

    async def hydrate_notification_store(self, session: AsyncSession) -> None:
        message_rows = list(
            (
                await session.scalars(
                    select(NotificationMessageModel).where(
                        NotificationMessageModel.is_deleted.is_(False),
                    ),
                )
            ).all(),
        )
        if not message_rows:
            return

        state_rows = list(
            (
                await session.scalars(
                    select(NotificationRecipientStateModel).where(
                        NotificationRecipientStateModel.is_deleted.is_(False),
                    ),
                )
            ).all(),
        )
        event_rows = list(
            (
                await session.scalars(
                    select(NotificationDeliveryEventModel).where(
                        NotificationDeliveryEventModel.is_deleted.is_(False),
                    ),
                )
            ).all(),
        )

        notification_store.messages = {
            row.notification_id: NotificationMessageRecord(
                notification_id=row.notification_id,
                source_module=row.source_module,
                source_entity_type=row.source_entity_type,
                source_entity_id=row.source_entity_id,
                type=row.type,
                severity=row.severity,
                title=row.title,
                content=row.content,
                action_target=row.action_target,
                created_by=row.created_by_ref,
                created_at=_iso(row.notification_created_at) or "",
                expires_at=_iso(row.expires_at),
                metadata=row.extra_metadata,
            )
            for row in message_rows
        }
        notification_store.recipient_states = {
            (row.notification_id, row.recipient_user_id): NotificationRecipientStateRecord(
                notification_id=row.notification_id,
                recipient_user_id=row.recipient_user_id,
                recipient_org_id=row.recipient_org_id,
                read_state=row.read_state,
                read_at=_iso(row.read_at),
                archived_at=_iso(row.archived_at),
                created_at=_iso(row.created_at) or "",
                updated_at=_iso(row.updated_at) or "",
                version=row.version,
            )
            for row in state_rows
        }
        notification_store.delivery_events = {
            row.delivery_event_id: NotificationDeliveryEventRecord(
                delivery_event_id=row.delivery_event_id,
                notification_id=row.notification_id,
                recipient_user_id=row.recipient_user_id,
                channel=row.channel,
                delivery_status=row.delivery_status,
                attempted_at=_iso(row.attempted_at) or "",
                provider_message_id=row.provider_message_id,
                error_code=row.error_code,
                metadata=row.extra_metadata,
            )
            for row in event_rows
        }

    async def save_recipient_state(
        self,
        session: AsyncSession,
        state: NotificationRecipientStateRecord,
    ) -> None:
        now = _now()
        await session.merge(
            NotificationRecipientStateModel(
                created_at=_dt(state.created_at) or now,
                updated_at=_dt(state.updated_at) or now,
                is_deleted=False,
                recipient_state_id=state.recipient_state_id,
                notification_id=state.notification_id,
                recipient_user_id=state.recipient_user_id,
                recipient_org_id=state.recipient_org_id,
                read_state=state.read_state,
                read_at=_dt(state.read_at),
                archived_at=_dt(state.archived_at),
                version=state.version,
            ),
        )
        await session.flush()

    async def save_user_recipient_states(self, session: AsyncSession, user_id: str) -> None:
        states = notification_store.recipient_states.items()
        for (notification_id, recipient_user_id), state in states:
            if recipient_user_id == user_id and notification_id in notification_store.messages:
                await self.save_recipient_state(session, state)

    async def save_notification_bundle(
        self,
        session: AsyncSession,
        notification_ids: list[str],
    ) -> None:
        now = _now()
        for notification_id in notification_ids:
            message = notification_store.messages.get(notification_id)
            if not message:
                continue
            await session.merge(
                NotificationMessageModel(
                    created_at=_dt(message.created_at) or now,
                    updated_at=now,
                    is_deleted=False,
                    notification_id=message.notification_id,
                    source_module=message.source_module,
                    source_entity_type=message.source_entity_type,
                    source_entity_id=message.source_entity_id,
                    type=message.type,
                    severity=message.severity,
                    title=message.title,
                    content=message.content,
                    action_target=message.action_target,
                    created_by_ref=message.created_by,
                    notification_created_at=_dt(message.created_at) or now,
                    expires_at=_dt(message.expires_at),
                    extra_metadata=message.metadata,
                ),
            )
            for (state_notification_id, _), state in notification_store.recipient_states.items():
                if state_notification_id == notification_id:
                    await self.save_recipient_state(session, state)
            for event in notification_store.delivery_events.values():
                if event.notification_id != notification_id:
                    continue
                await session.merge(
                    NotificationDeliveryEventModel(
                        created_at=_dt(event.attempted_at) or now,
                        updated_at=now,
                        is_deleted=False,
                        delivery_event_id=event.delivery_event_id,
                        notification_id=event.notification_id,
                        recipient_user_id=event.recipient_user_id,
                        channel=event.channel,
                        delivery_status=event.delivery_status,
                        attempted_at=_dt(event.attempted_at) or now,
                        provider_message_id=event.provider_message_id,
                        error_code=event.error_code,
                        extra_metadata=event.metadata,
                    ),
                )
        await session.flush()


notification_runtime_repository = NotificationRuntimeRepository()
