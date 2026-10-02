"""合规中心 BFF Router (2.S13).

挂载路径: `/api/bff/v1/compliance` (见 main.py)

9 端点 (全部 POST, D2):
  1. POST /alerts/list          — 合规预警列表
  2. POST /alerts/handle        — 处理单条合规预警
  3. POST /governance/issues/list  — 数据质量问题列表
  4. POST /governance/scan         — 触发数据质量扫描
  5. POST /governance/issues/ignore — 忽略 WARNING 级问题
  6. POST /rules/list           — 合规规则列表
  7. POST /rules/save           — 新建/更新合规规则
  8. POST /rules/toggle         — 切换规则启停

对应设计文档:
  docs/design/v1/api/04_compliance_center/02_alerts_governance_api_plan.md v1.2
"""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ....core.database import get_db
from ....core.deps import get_current_user
from ....models.sys_users import SysUser
from ....schemas.common import StandardResponse
from ....schemas.compliance_s13 import (
    AlertHandleRequest,
    AlertHandleResponse,
    AlertListRequest,
    AlertListResponse,
    IssueIgnoreRequest,
    IssueIgnoreResponse,
    IssueListRequest,
    IssueListResponse,
    RuleListRequest,
    RuleListResponse,
    RuleSaveRequest,
    RuleSaveResponse,
    RuleToggleRequest,
    RuleToggleResponse,
    ScanRequest,
    ScanResponse,
)
from ....services import compliance_alert_service as alert_svc
from ....services import compliance_rule_service as rule_svc
from ....services import data_governance_service as gov_svc

router = APIRouter()


# ---------------------------------------------------------------------------
# 合规预警
# ---------------------------------------------------------------------------

@router.post(
    "/alerts/list",
    response_model=StandardResponse[AlertListResponse],
    summary="合规预警列表",
    description="分页获取合规风险预警。LEGAL_LAWYER 仅看自身案件。",
)
async def list_alerts(
    req: AlertListRequest,
    session: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> StandardResponse[AlertListResponse]:
    data = await alert_svc.list_alerts(
        session,
        tenant_id=str(current_user.tenant_id),
        user=current_user,
        req=req,
    )
    return StandardResponse(code=200, message="success", data=data)


@router.post(
    "/alerts/handle",
    response_model=StandardResponse[AlertHandleResponse],
    summary="处理合规预警",
    description="CONVERT_TO_TASK → status=REPORTED + 创建报送任务；DISMISS → status=EXEMPTED。",
)
async def handle_alert(
    req: AlertHandleRequest,
    session: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> StandardResponse[AlertHandleResponse]:
    data = await alert_svc.handle_alert(
        session,
        tenant_id=str(current_user.tenant_id),
        user=current_user,
        req=req,
    )
    return StandardResponse(code=200, message="success", data=data)


# ---------------------------------------------------------------------------
# 数据治理
# ---------------------------------------------------------------------------

@router.post(
    "/governance/issues/list",
    response_model=StandardResponse[IssueListResponse],
    summary="数据质量问题列表",
    description="分页获取数据质量异常记录，支持按 severity / issueType / status 过滤。",
)
async def list_issues(
    req: IssueListRequest,
    session: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> StandardResponse[IssueListResponse]:
    data = await gov_svc.list_issues(
        session,
        tenant_id=str(current_user.tenant_id),
        req=req,
    )
    return StandardResponse(code=200, message="success", data=data)


@router.post(
    "/governance/scan",
    response_model=StandardResponse[ScanResponse],
    summary="触发数据质量扫描",
    description="异步扫描指定或全量案件，D5 内置 4 条规则 (v1.2)。立即返回 QUEUED，后台执行。",
)
async def scan_governance(
    req: ScanRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> StandardResponse[ScanResponse]:
    data = await gov_svc.trigger_scan(
        session,
        tenant_id=str(current_user.tenant_id),
        user=current_user,
        req=req,
    )
    background_tasks.add_task(
        gov_svc.run_scan,
        tenant_id=str(current_user.tenant_id),
        user_id=str(current_user.id),
        req=req,
    )
    return StandardResponse(code=200, message="success", data=data)


@router.post(
    "/governance/issues/ignore",
    response_model=StandardResponse[IssueIgnoreResponse],
    summary="忽略数据质量问题",
    description="仅允许忽略 severity=WARNING 的问题；BLOCKER 级别返回 4200。",
)
async def ignore_issue(
    req: IssueIgnoreRequest,
    session: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> StandardResponse[IssueIgnoreResponse]:
    data = await gov_svc.ignore_issue(
        session,
        tenant_id=str(current_user.tenant_id),
        user=current_user,
        req=req,
    )
    return StandardResponse(code=200, message="success", data=data)


# ---------------------------------------------------------------------------
# 合规规则
# ---------------------------------------------------------------------------

@router.post(
    "/rules/list",
    response_model=StandardResponse[RuleListResponse],
    summary="合规规则列表",
    description="分页获取合规规则，支持按 ruleType / status 过滤。",
)
async def list_rules(
    req: RuleListRequest,
    session: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> StandardResponse[RuleListResponse]:
    data = await rule_svc.list_rules(
        session,
        tenant_id=str(current_user.tenant_id),
        req=req,
    )
    return StandardResponse(code=200, message="success", data=data)


@router.post(
    "/rules/save",
    response_model=StandardResponse[RuleSaveResponse],
    summary="新建/更新合规规则",
    description="upsert by ruleCode。D1=A: 规则逻辑仅存储，执行引擎推迟到 S15+。",
)
async def save_rule(
    req: RuleSaveRequest,
    session: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> StandardResponse[RuleSaveResponse]:
    data = await rule_svc.save_rule(
        session,
        tenant_id=str(current_user.tenant_id),
        user=current_user,
        req=req,
    )
    return StandardResponse(code=200, message="success", data=data)


@router.post(
    "/rules/toggle",
    response_model=StandardResponse[RuleToggleResponse],
    summary="切换规则启停",
    description="ACTIVE ↔ INACTIVE。DRAFT 状态返回 4201。",
)
async def toggle_rule(
    req: RuleToggleRequest,
    session: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> StandardResponse[RuleToggleResponse]:
    data = await rule_svc.toggle_rule(
        session,
        tenant_id=str(current_user.tenant_id),
        user=current_user,
        req=req,
    )
    return StandardResponse(code=200, message="success", data=data)
