"""案件相关 Pydantic Schemas.

字段命名与 `docs/design/v1/db/04_cases.md` 严格对齐。
Enum 字段使用 `app.modules.cases.enums.case_enums` 内的 Python Enum, Pydantic v2 自动校验合法值。

用途:
- `CaseCreate`: 创建案件请求 (BFF `/cases/create` 复用; 由 `CaseService.create_case` 落库)
- `CaseResponse`: 案件完整响应 (含审计字段)
- `CaseBaseInfoUpdate`: 局部更新请求 (BFF `/cases/base-info/update`, 详见切片 2.S2.a)

历史说明: 2.S2.a 之前的 `CaseUpdate / CaseListResponse` 等 legacy DTO 已删除 (与旧 REST 路由一并淘汰)。
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import ConfigDict, Field

from ..enums.case_enums import (
    CaseStatus,
    OurRole,
    ProcedureType,
    RiskLevel,
    Sector,
)
from .common import AuditMixin, BaseSchema


class CaseBase(BaseSchema):
    """案件核心字段 (创建/响应共用的基础部分)。"""
    internal_case_no: str = Field(..., description="内部案号", max_length=64)
    external_case_no: Optional[str] = Field(None, description="外部案号", max_length=128)
    case_name: str = Field(..., description="案件名称", max_length=255)
    description: Optional[str] = Field(None, description="案情简述 (AI 向量化源字段)")

    # 字典字段
    case_type_code: str = Field(..., description="案件类型 (字典 CASE_TYPE)", max_length=64)
    case_cause: Optional[str] = Field(None, description="案由 (字典 CAUSE_OF_ACTION)", max_length=128)
    business_line: Optional[str] = Field(None, description="业务线 (字典 BUSINESS_LINE)", max_length=64)
    case_source: Optional[str] = Field(None, description="案件来源", max_length=64)

    # Enum 字段
    risk_level: Optional[RiskLevel] = Field(None, description="风险等级 Enum")
    sector: Optional[Sector] = Field(None, description="板块归属 Enum")
    our_role: Optional[OurRole] = Field(None, description="我方地位 Enum")
    procedure_type: Optional[ProcedureType] = Field(None, description="审理程序 Enum")

    # 合规标志
    is_investor_protection: bool = Field(default=False, description="是否涉投资者保护")
    is_major: bool = Field(default=False, description="是否重大案件")


class CaseCreate(CaseBase):
    """创建案件请求 (后续 2.S2.b 切片的 `/cases/create` 复用)。"""
    tenant_id: Optional[str] = Field(None, description="租户ID (由 Service 从 current_user 注入，请求可不传)", max_length=36)
    plaintiff_name: Optional[str] = Field(None, description="原告/申请人", max_length=255)
    defendant_name: Optional[str] = Field(None, description="被告/被申请人", max_length=255)
    target_amount: Optional[Decimal] = Field(None, description="标的额")
    provision_amount: Optional[Decimal] = Field(None, description="预计负债")
    target_subject: Optional[str] = Field(None, description="标的证券/项目", max_length=255)
    accepting_court: Optional[str] = Field(None, description="受理法院", max_length=128)
    presiding_judge: Optional[str] = Field(None, description="主审法官", max_length=64)
    judge_contact: Optional[str] = Field(None, description="法官电话", max_length=64)
    handling_lawyer_id: Optional[str] = Field(None, description="经办律师ID", max_length=36)
    is_main_case: bool = Field(default=False, description="是否为主案")
    main_case_id: Optional[str] = Field(None, description="主案ID", max_length=36)
    dispute_id: str = Field(..., description="纠纷ID (多审级共享)", max_length=36)
    previous_instance_id: Optional[str] = Field(None, description="前置程序案件ID", max_length=36)
    framework_contract_id: Optional[str] = Field(None, description="框架合同ID", max_length=36)
    current_stage_code: Optional[str] = Field(None, description="当前阶段 (字典 CASE_STAGE)", max_length=64)
    case_status: CaseStatus = Field(default=CaseStatus.PENDING, description="案件状态 Enum")
    latest_progress: Optional[str] = Field(None, description="最新进展")
    filing_date: Optional[date] = Field(None, description="立案日期")
    close_date: Optional[date] = Field(None, description="结案日期")
    archive_no: Optional[str] = Field(None, description="归档号", max_length=64)
    extended_data: Optional[dict[str, Any]] = Field(
        None,
        description="JSONB 扩展字段 (仅允许 regulatory/summary_detail/tags 三个一级键)",
    )


class CaseResponse(CaseBase, AuditMixin):
    """案件完整响应 (含审计字段)。"""
    id: str = Field(..., description="案件ID")
    tenant_id: str = Field(..., description="租户ID")
    plaintiff_name: Optional[str] = None
    defendant_name: Optional[str] = None
    target_amount: Optional[Decimal] = None
    provision_amount: Optional[Decimal] = None
    target_subject: Optional[str] = None
    accepting_court: Optional[str] = None
    presiding_judge: Optional[str] = None
    judge_contact: Optional[str] = None
    handling_lawyer_id: Optional[str] = None
    is_main_case: bool = False
    main_case_id: Optional[str] = None
    dispute_id: str
    previous_instance_id: Optional[str] = None
    framework_contract_id: Optional[str] = None
    current_stage_code: Optional[str] = None
    case_status: CaseStatus = CaseStatus.PENDING
    latest_progress: Optional[str] = None
    filing_date: Optional[date] = None
    close_date: Optional[date] = None
    archive_no: Optional[str] = None
    extended_data: Optional[dict[str, Any]] = None
    is_deleted: bool = False


class CaseBaseInfoPatch(BaseSchema):
    """案件基础字段 patch (可更新字段白名单).

    所有字段可选, 后端按 `exclude_unset=True` 只持久化非空字段。
    字段白名单与 `03_case_detail_sidebar_api_plan.md` §2.3 对齐:
      - description / risk_level / is_investor_protection / is_major / sector
      - business_line / presiding_judge / judge_contact / accepting_court
      - latest_progress
      - extended_data (仅 regulatory / summary_detail / tags 三键有效)

    不允许通过本端点修改: current_stage_code (走 /stage/change),
    case_status (由 /stage/change + /case/close 间接推导), tenant_id / dispute_id 等主键域字段。
    """
    model_config = ConfigDict(extra="forbid")

    description: Optional[str] = Field(None, description="案情简述")
    risk_level: Optional[RiskLevel] = None
    is_investor_protection: Optional[bool] = None
    is_major: Optional[bool] = None
    sector: Optional[Sector] = None
    business_line: Optional[str] = Field(None, max_length=64)
    presiding_judge: Optional[str] = Field(None, max_length=64)
    judge_contact: Optional[str] = Field(None, max_length=64)
    accepting_court: Optional[str] = Field(None, max_length=128)
    latest_progress: Optional[str] = None
    extended_data: Optional[dict[str, Any]] = Field(
        None,
        description="extended_data 子键覆盖 (整键替换); 禁止未登记的一级键",
    )


class CaseBaseInfoUpdate(BaseSchema):
    """BFF `/cases/base-info/update` 完整请求体.

    Body = { case_id, patch: CaseBaseInfoPatch }
    纯 POST 规范, case_id 走 body 不走 URL.
    """
    model_config = ConfigDict(extra="forbid")

    case_id: str = Field(..., description="目标案件 ID", max_length=36)
    patch: CaseBaseInfoPatch = Field(..., description="待更新的字段集合")
