"""Case audit log service.

2.S3 切片新增. 提供统一的审计日志写入与查询接口, 供:
- `case_parties_service` 写 PARTIES 模块的 CREATE/UPDATE/DELETE 变更
- `case_detail_ext_service.manage_members` 写 MEMBERS 模块的 CREATE/UPDATE/DELETE 变更
- BFF `audit-logs/query` 端点统一查询

设计要点:
1. 写入函数不自管事务 — 由调用方的 `async with session.begin():` 包裹,
   以保证"业务变更 + 审计日志"原子性 (参见 TROUBLESHOOTING §5.9)
2. before_data / after_data 仅保留**变更字段**, 由调用方传入差异子集
3. ip_address / user_agent 本切片统一留空, 等待后续横向基建切片下沉 `Depends(Request)`
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import ValidationException
from ..models.case_audit_logs import CaseAuditLog
from ..models.sys_users import SysUser


# 允许写入的 action_module 白名单 (避免拼写错误)
# 2.S3 初版: PARTIES / MEMBERS / CASES / STAGE / DOCUMENTS / FINANCE
# 2.S4-PRE (决策 D6) 扩展: PROCESS (流程节点) + TASK (协作任务)
# 2.S7-PRE (决策 D6) 扩展: COUNSELS (外聘律师 + 合同一并走此模块)
# 2.S8-PRE (决策 D6) 扩展: COMPLIANCE (合规检查清单 + 信披评估 + 合规物料)
# 2.S9-PRE (决策 D8) 扩展: CLOSURE (结案登记 + 归档 + 终本执行一并走此模块)
# 2.S12-PRE (决策 D8) 扩展: ASSET_PRESERVATION (资产保全台账)
# 2.S13-PRE 第二轮扩展: COMPLIANCE_ALERT / COMPLIANCE_RULE / DATA_QUALITY_ISSUE
#   (COMPLIANCE 保留给 S8 合规检查清单/信披评估, 三者为独立实体, 分开审计)
# 2.S15-PRE 扩展: CLUE (线索管理) / INBOX_EMAIL (智能收件箱处理)
ALLOWED_ACTION_MODULES = {
    "PARTIES", "MEMBERS", "CASES", "STAGE",
    "PROCESS", "TASK",
    "DOCUMENTS", "FINANCE",
    "COUNSELS",
    "COMPLIANCE",
    "CLOSURE",
    "ASSET_PRESERVATION",
    "COMPLIANCE_ALERT",       # 2.S13: 合规预警处理 (handle: REPORTED/EXEMPTED)
    "COMPLIANCE_RULE",        # 2.S13: 合规规则 CRUD (save/toggle)
    "DATA_QUALITY_ISSUE",     # 2.S13: 数据质量问题忽略操作
    "REPORTING_TASK",         # 2.S14: 合规报送任务 (create/submit/approve/snapshot)
    "CLUE",                   # 2.S15: 线索管理 (create/update/close/convert)
    "INBOX_EMAIL",            # 2.S15: 智能收件箱处理 (mark-read/convert/link/ignore)
}
ALLOWED_ACTION_TYPES = {"CREATE", "UPDATE", "DELETE", "UPLOAD", "DOWNLOAD", "EXPORT"}


async def write_audit_log(
    session: AsyncSession,
    *,
    tenant_id: str,
    case_id: str,
    operator: SysUser,
    action_module: str,
    action_type: str,
    action_detail: str,
    target_record_id: str | None = None,
    before_data: dict[str, Any] | None = None,
    after_data: dict[str, Any] | None = None,
) -> CaseAuditLog:
    """追加一条审计日志. 调用方必须在事务内使用.

    Raises:
        ValueError: action_module / action_type 不在白名单
    """
    if action_module not in ALLOWED_ACTION_MODULES:
        raise ValidationException(
            f"action_module={action_module!r} not in whitelist",
            details={"allowed": sorted(ALLOWED_ACTION_MODULES)},
        )
    if action_type not in ALLOWED_ACTION_TYPES:
        raise ValidationException(
            f"action_type={action_type!r} not in whitelist",
            details={"allowed": sorted(ALLOWED_ACTION_TYPES)},
        )

    # mock/test 场景 SysUser 可能缺 real_name 属性, 渐进回退
    operator_name = (
        getattr(operator, "real_name", None)
        or getattr(operator, "username", None)
        or str(getattr(operator, "id", "unknown"))
    )
    entry = CaseAuditLog(
        id=f"audit_{uuid.uuid4().hex[:12]}",
        tenant_id=tenant_id,
        case_id=case_id,
        operator_id=operator.id,
        operator_name=operator_name,
        action_module=action_module,
        action_type=action_type,
        action_detail=action_detail[:255],
        target_record_id=target_record_id,
        before_data=before_data,
        after_data=after_data,
        ip_address=None,
        user_agent=None,
        created_by=operator.id,
        updated_by=operator.id,
    )
    session.add(entry)
    await session.flush()
    return entry


def compute_field_diff(
    before: dict[str, Any] | None,
    after: dict[str, Any] | None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """计算 before / after 两个 dict 的变更差异子集.

    返回 (before_diff, after_diff), 仅包含值发生变化的字段.
    用于 UPDATE 动作时最小化 JSONB 存储体积.
    """
    before = before or {}
    after = after or {}
    keys = set(before.keys()) | set(after.keys())
    before_diff: dict[str, Any] = {}
    after_diff: dict[str, Any] = {}
    for k in keys:
        b = before.get(k)
        a = after.get(k)
        if b != a:
            before_diff[k] = b
            after_diff[k] = a
    return before_diff, after_diff


async def query_by_case(
    session: AsyncSession,
    *,
    tenant_id: str,
    case_id: str,
    action_modules: list[str] | None = None,
    page: int = 1,
    size: int = 50,
) -> tuple[int, list[CaseAuditLog]]:
    """按案件查询审计日志, 支持按 action_module 过滤, 分页.

    Returns:
        (total, rows) — total 是筛选后总数, rows 是当前页数据
    """
    page = max(1, page)
    size = max(1, min(200, size))

    base_filter = [
        CaseAuditLog.tenant_id == tenant_id,
        CaseAuditLog.case_id == case_id,
        CaseAuditLog.is_deleted.is_(False),
    ]
    if action_modules:
        base_filter.append(CaseAuditLog.action_module.in_(action_modules))

    total = (
        await session.execute(select(func.count(CaseAuditLog.id)).where(*base_filter))
    ).scalar() or 0

    stmt = (
        select(CaseAuditLog)
        .where(*base_filter)
        .order_by(CaseAuditLog.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    rows = (await session.execute(stmt)).scalars().all()
    return int(total), list(rows)
