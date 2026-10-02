"""案件备注 Service (切片 2.S10).

实现 1 方法 (模块级, 非 class):
    add_memo — 写 case_memos + 审计 CASES.CREATE

权限:
    案件成员即可 (_compute_permissions 任一读键 True); 不限 edit 权限 (memo 是协作, 非修改)

ARCHIVED 锁继承:
    perms 对 ARCHIVED 案件全 False (SYS_ADMIN 例外), 因此本方法在归档后自动拒.

说明:
    2.S10 重写, 覆盖旧 `CaseMemoService` 类 (引用不存在的 author_id 字段, 已死).
"""
from __future__ import annotations

import uuid

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException, NotFoundException
from ..models.case_documents import CaseDocument
from ..models.case_memos import CaseMemo
from ..models.cases import Case
from ..models.sys_users import SysUser
from ..schemas.case_creation import MemoAddRequest, MemoAddResponse
from .audit_log_service import write_audit_log
from .case_detail_ext_service import _compute_permissions


MEMO_CONTENT_MAX_BYTES = 50 * 1024  # 50 KB


async def _require_case_member(
    session: AsyncSession, tenant_id: str, case_id: str, user: SysUser
) -> Case:
    """读权限: 案件成员即可 (所有权限键任一 True)."""
    case = (
        await session.execute(
            select(Case).where(
                and_(
                    Case.id == case_id,
                    Case.tenant_id == tenant_id,
                    Case.is_deleted.is_(False),
                )
            )
        )
    ).scalar_one_or_none()
    if case is None:
        raise NotFoundException(resource="案件", resource_id=case_id)

    perms = await _compute_permissions(session, tenant_id, case_id, user.id, case=case)
    excluded = {
        "case_id", "user_role_in_case", "has_legal_admin",
        "has_sys_admin", "case_closed",
    }
    if not any(v for k, v in perms.model_dump().items() if k not in excluded):
        raise NotFoundException(resource="案件", resource_id=case_id)
    return case


async def add_memo(
    session: AsyncSession,
    tenant_id: str,
    payload: MemoAddRequest,
    user: SysUser,
) -> MemoAddResponse:
    content_bytes = len(payload.content.encode("utf-8"))
    if content_bytes > MEMO_CONTENT_MAX_BYTES:
        raise BusinessException(
            code=4001,
            message=f"备注内容 {content_bytes} 字节超过 {MEMO_CONTENT_MAX_BYTES} 字节限制",
        )

    async with session.begin():
        await _require_case_member(session, tenant_id, payload.case_id, user)

        if payload.attachment_ids:
            rows = (
                await session.execute(
                    select(CaseDocument.id, CaseDocument.case_id).where(
                        and_(
                            CaseDocument.id.in_(payload.attachment_ids),
                            CaseDocument.tenant_id == tenant_id,
                            CaseDocument.is_deleted.is_(False),
                        )
                    )
                )
            ).all()
            found_ids = {r[0] for r in rows}
            missing = set(payload.attachment_ids) - found_ids
            if missing:
                raise NotFoundException(
                    resource="案件文档",
                    resource_id=",".join(sorted(missing)),
                )
            bad_case = [r[0] for r in rows if r[1] != payload.case_id]
            if bad_case:
                raise BusinessException(
                    code=4003, message=f"附件 {bad_case} 不属于本案件"
                )

        memo_id = f"memo_{uuid.uuid4().hex[:12]}"
        memo = CaseMemo(
            id=memo_id,
            tenant_id=tenant_id,
            case_id=payload.case_id,
            process_node_id=payload.process_node_id,
            memo_type=payload.memo_type,
            title=payload.title,
            content=payload.content,
            mentioned_users=list(payload.mentioned_users or []),
            attachment_ids=list(payload.attachment_ids or []),
            visibility=payload.visibility.value,
            is_pinned=payload.is_pinned,
            created_by=user.id,
            updated_by=user.id,
        )
        session.add(memo)
        await session.flush()

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=payload.case_id,
            operator=user,
            action_module="CASES",
            action_type="CREATE",
            action_detail=(
                f"添加备注 {memo_id} 类型={payload.memo_type} "
                f"可见性={payload.visibility.value}"
            ),
            target_record_id=memo_id,
            after_data={
                "memo_type": payload.memo_type,
                "visibility": payload.visibility.value,
                "content_length": content_bytes,
                "attachment_count": len(payload.attachment_ids or []),
            },
        )

        created_at_val = memo.created_at

    return MemoAddResponse(
        memo_id=memo_id,
        case_id=payload.case_id,
        created_at=created_at_val,
    )
