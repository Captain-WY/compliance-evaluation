"""案件新建 + 辅助功能 Pydantic Schema (切片 2.S10).

字段严格对齐 docs/design/v1/api/02_case_center/11_case_creation_api_plan.md v1.0 (含 §10 PRE2 施工速查).

6 新写 BFF 端点 (自身 service):
    1. /cases/create                         — 创建正式案件 (7 步主事务)
    2. /cases/drafts/save                    — 保存草稿 (create or update)
    3. /cases/drafts/list                    — 列当前用户草稿 (D2=A owner 隔离)
    4. /cases/drafts/delete                  — 软删草稿
    5. /cases/from-clue/prepare              — 线索预填 (纯只读)
    6. /cases/memos/add                      — 添加备注

3 别名端点 (复用 S3/S4 DTO, 无自身 schema):
    7. /cases/activities/query               — 复用 S3 AuditLogQueryRequest/Response
    8. /cases/milestones/complete            — 复用 S4 NodeCompleteRequest/Response
    9. /cases/collaboration/create           — 复用 S4 TaskCreateRequest/Response

权限 (D4=A):
    - create / drafts/* / from-clue / memos/add: 登录用户
    - activities/query: 案件成员
    - milestones/collaboration: can_manage_process (复用 S4)
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.modules.cases.enums.case_enums import (
    CaseMemberRole,
    CaseSource,
    CurrencyCode,
    IdentityType,
    MemoVisibility,
    OurRole,
    PartyType,
    ProcedureType,
    RiskLevel,
    Sector,
)


# =============================================================================
# 1. /cases/create  (主事务 7 步)
# =============================================================================


class PartyItem(BaseModel):
    """create Request.parties[] 子项. 字段命名对齐 case_parties 模型列."""

    model_config = ConfigDict(extra="forbid")

    party_type: PartyType
    party_name: str = Field(..., min_length=1, max_length=255)
    is_our_side: bool = False
    identity_type: IdentityType
    identity_number: str | None = Field(None, max_length=128)
    legal_representative: str | None = Field(None, max_length=128)
    contact_number: str | None = Field(None, max_length=64)
    service_address: str | None = Field(None, max_length=512)
    claim_amount: Decimal | None = Field(None, ge=Decimal(0))
    claim_details: str | None = None


class MemberItem(BaseModel):
    """create Request.members[] 子项 (Q5 role_code Pydantic 校验)."""

    model_config = ConfigDict(extra="forbid")

    user_id: str = Field(..., max_length=36)
    role_code: CaseMemberRole  # Enum 强制校验


class BudgetInit(BaseModel):
    """create Request.budget 子对象 (PRE2 重构, 对齐 CaseBudget 单行模型)."""

    model_config = ConfigDict(extra="forbid")

    total_budget: Decimal = Field(..., ge=Decimal(0))
    currency: CurrencyCode = CurrencyCode.CNY
    notes: str | None = Field(None, max_length=1000)


class CaseCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # 基础必填
    case_name: str = Field(..., min_length=1, max_length=255)
    case_type_code: str = Field(..., max_length=64)

    # 基础可选
    case_source: CaseSource = CaseSource.MANUAL
    business_line: str | None = Field(None, max_length=64)
    case_cause: str | None = Field(None, max_length=128)
    risk_level: RiskLevel | None = None
    our_role: OurRole | None = None
    procedure_type: ProcedureType | None = None
    is_investor_protection: bool = False
    is_major: bool = False
    sector: Sector | None = None

    # 核心业务数据
    plaintiff_name: str | None = Field(None, max_length=255)
    defendant_name: str | None = Field(None, max_length=255)
    target_amount: Decimal | None = Field(None, ge=Decimal(0))
    provision_amount: Decimal | None = Field(None, ge=Decimal(0))
    target_subject: str | None = Field(None, max_length=255)

    # 法院人员
    accepting_court: str | None = Field(None, max_length=128)
    presiding_judge: str | None = Field(None, max_length=64)
    judge_contact: str | None = Field(None, max_length=64)
    handling_lawyer_id: str | None = Field(None, max_length=36)

    # 编号 (Q1/Q2 可选, 未传时后端生成)
    internal_case_no: str | None = Field(None, max_length=64)
    external_case_no: str | None = Field(None, max_length=128)
    dispute_id: str | None = Field(None, max_length=36)

    # 关键时间
    filing_date: date | None = None

    # 案情
    description: str | None = None

    # 关联
    source_clue_id: str | None = Field(None, max_length=36, description="若从线索转化则传")
    draft_id: str | None = Field(None, max_length=36, description="若从草稿恢复则传, 成功后软删草稿")

    # 批量附属
    parties: list[PartyItem] = Field(default_factory=list)
    members: list[MemberItem] = Field(default_factory=list)
    attachments: list[str] = Field(default_factory=list, description="case_documents.id 列表")
    budget: BudgetInit | None = None


class CaseCreateResponse(BaseModel):
    case_id: str
    internal_case_no: str
    case_status: str
    case_stage_code: str | None = None
    created_at: datetime
    warnings: list[str] = Field(default_factory=list)


# =============================================================================
# 2. /cases/drafts/save
# =============================================================================


class DraftSaveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    draft_id: str | None = Field(None, max_length=36, description="有则 update, 无则 create")
    draft_data: dict[str, Any] = Field(..., description="NewCaseForm 字段快照; Service 层校验 <=100KB")
    source_clue_id: str | None = Field(None, max_length=36)


class DraftSaveResponse(BaseModel):
    draft_id: str
    expires_at: datetime
    last_saved_at: datetime


# =============================================================================
# 3. /cases/drafts/list
# =============================================================================


class DraftListPagination(BaseModel):
    model_config = ConfigDict(extra="forbid")
    page: int = Field(1, ge=1)
    size: int = Field(20, ge=1, le=100)


class DraftsListRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pagination: DraftListPagination = Field(default_factory=DraftListPagination)


class DraftItemVO(BaseModel):
    draft_id: str
    case_name: str | None = None
    draft_data: dict[str, Any] | None = None
    source_clue_id: str | None = None
    source_clue_title: str | None = None
    last_saved_at: datetime
    expires_at: datetime


class DraftsListResponse(BaseModel):
    total: int
    page: int
    size: int
    items: list[DraftItemVO] = Field(default_factory=list)


# =============================================================================
# 4. /cases/drafts/delete
# =============================================================================


class DraftDeleteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    draft_id: str = Field(..., max_length=36)


class DraftDeleteResponse(BaseModel):
    draft_id: str
    deleted: bool


# =============================================================================
# 5. /cases/from-clue/prepare
# =============================================================================


class FromCluePrepareRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    clue_id: str = Field(..., max_length=36)


class PreparedDraftPayload(BaseModel):
    """预填给 NewCaseForm 的字段子集 (Q7 映射表)."""

    case_name: str
    case_type_code: str  # Q7 默认 CIVIL_LITIGATION
    business_line: str | None = None
    defendant_name: str | None = None
    target_amount: Decimal | None = None
    description: str | None = None
    case_source: CaseSource = CaseSource.CLUE_CONVERSION
    source_clue_id: str


class FromCluePrepareResponse(BaseModel):
    clue_id: str
    clue_title: str
    clue_status: str
    prepared_draft: PreparedDraftPayload
    warnings: list[str] = Field(default_factory=list)


# =============================================================================
# 6. /cases/memos/add
# =============================================================================


class MemoAddRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    case_id: str = Field(..., max_length=36)
    memo_type: str = Field(..., max_length=64)
    title: str | None = Field(None, max_length=255)
    content: str = Field(..., min_length=1)
    visibility: MemoVisibility = MemoVisibility.PUBLIC_TO_FOLLOWERS
    mentioned_users: list[str] = Field(default_factory=list)
    attachment_ids: list[str] = Field(default_factory=list)
    process_node_id: str | None = Field(None, max_length=36)
    is_pinned: bool = False


class MemoAddResponse(BaseModel):
    memo_id: str
    case_id: str
    created_at: datetime
