"""案件当事人 (case_parties) Pydantic Schema.

字段严格对齐 docs/design/v1/db/06_case_parties.md 表设计,
Enum 字段 (party_type / identity_type) 使用 PartyType / IdentityType 自动校验.

支持场景:
- 详情页展开当事人列表 (PartyVO)
- 新增当事人 (PartyCreateRequest)
- 编辑当事人 (PartyUpdateRequest, 白名单 + PATCH 语义)
- 批量 upsert (BatchUpsertPartiesRequest, 2.S3 立案复用)
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.cases.enums.case_enums import IdentityType, PartyType


# =============================================================================
# 1. 基础 VO / DTO
# =============================================================================


class PartyBase(BaseModel):
    """当事人业务字段公共基类. 与 case_parties 列结构 1:1 对齐."""

    party_type: PartyType = Field(description="诉讼地位")
    is_our_side: bool = Field(False, description="是否为我方阵营")
    party_name: str = Field(description="当事人名称/姓名", min_length=1, max_length=255)
    identity_type: IdentityType = Field(description="主体类型")
    identity_number: str | None = Field(None, description="证件号码", max_length=128)
    legal_representative: str | None = Field(None, description="法定代表人/负责人", max_length=128)
    contact_number: str | None = Field(None, description="联系电话", max_length=64)
    service_address: str | None = Field(None, description="法律文书送达地址", max_length=512)
    claim_amount: Decimal | None = Field(None, description="针对该当事人的特定诉求金额")
    claim_details: str | None = Field(None, description="具体诉讼请求/答辩意见")
    agent_name: str | None = Field(None, description="委托代理人姓名", max_length=128)
    agent_law_firm: str | None = Field(None, description="代理人所在律所/机构", max_length=255)
    agent_contact: str | None = Field(None, description="代理人联系方式", max_length=64)
    sort_order: int = Field(0, description="排序号 (第一被告=0, 第二被告=1…)")
    extended_data: dict | None = Field(None, description="扩展字段 (性别/民族/户籍地等少见文书字段)")


class PartyVO(PartyBase):
    """当事人视图对象. 详情页返回用."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    case_id: str
    party_type_name: str | None = Field(None, description="party_type 中文标签")
    identity_type_name: str | None = Field(None, description="identity_type 中文标签")
    created_at: datetime | None = None
    updated_at: datetime | None = None


class PartyAddResponse(BaseModel):
    """`POST /cases/parties/add` 响应. 基于 PartyVO 扩展 warnings 字段,
    对应设计文档 §2.3 '自动触发一次内部冲突检查, 若命中高风险冲突, 在 warnings 字段回传供前端提示'."""

    party: "PartyVO"
    warnings: list["ConflictWarningVO"] = Field(
        default_factory=list,
        description="新增时的利益冲突预警 (仅提示, 不阻塞保存)",
    )


# =============================================================================
# 2. CRUD 请求
# =============================================================================


class PartyCreateRequest(PartyBase):
    """新增当事人. 需要提供 case_id (外部传入)."""

    case_id: str = Field(description="关联案件 ID", max_length=36)


class PartyUpdateRequest(BaseModel):
    """编辑当事人 (PATCH 语义). 仅允许白名单字段, 全部可选."""

    model_config = ConfigDict(extra="forbid")

    party_type: PartyType | None = None
    is_our_side: bool | None = None
    party_name: str | None = Field(None, min_length=1, max_length=255)
    identity_type: IdentityType | None = None
    identity_number: str | None = Field(None, max_length=128)
    legal_representative: str | None = Field(None, max_length=128)
    contact_number: str | None = Field(None, max_length=64)
    service_address: str | None = Field(None, max_length=512)
    claim_amount: Decimal | None = None
    claim_details: str | None = None
    agent_name: str | None = Field(None, max_length=128)
    agent_law_firm: str | None = Field(None, max_length=255)
    agent_contact: str | None = Field(None, max_length=64)
    sort_order: int | None = None
    extended_data: dict | None = None


class BatchUpsertPartiesRequest(BaseModel):
    """案件立案/当事人批量维护. ID 存在则更新, 否则新增; 未传入的既有记录保持不变."""

    case_id: str = Field(description="关联案件 ID", max_length=36)
    parties: list["BatchPartyItem"] = Field(
        description="当事人清单 (按 sort_order 预排序)", max_length=200
    )


class BatchPartyItem(PartyBase):
    """批量项. 带可选 id 表示更新现有记录; 无 id 表示新增."""

    id: str | None = Field(None, description="当事人 ID (更新时必填, 新增时留空)", max_length=36)


BatchUpsertPartiesRequest.model_rebuild()


# =============================================================================
# 3. 列表/查询响应
# =============================================================================


class PartiesListResponse(BaseModel):
    """案件详情 - 当事人列表响应 (按 sort_order 升序, 我方优先)."""

    case_id: str
    total: int
    parties: list[PartyVO] = Field(default_factory=list)
    # 便捷聚合, 供前端详情页头部快速渲染
    our_side_count: int = Field(description="我方阵营当事人数")
    opposing_count: int = Field(description="对方阵营当事人数")


# =============================================================================
# 4. 冲突检查 (决策 #1: 归属 2.S3, 与立案表单共用契约)
# =============================================================================


class ConflictCheckRequest(BaseModel):
    """利益冲突检索请求.

    用于立案 NewCaseForm 或当事人新增前的冲突排查.
    可任选字段组合, 至少需提供 party_name 或 identity_number 之一.
    """

    model_config = ConfigDict(extra="forbid")

    party_name: str | None = Field(
        None,
        description="当事人名称 (支持模糊匹配)",
        min_length=1,
        max_length=255,
    )
    identity_number: str | None = Field(
        None,
        description="证件号码/统一社会信用代码 (精确匹配)",
        min_length=1,
        max_length=128,
    )
    party_type: PartyType | None = Field(None, description="可选: 按诉讼地位过滤")
    exclude_case_id: str | None = Field(
        None,
        description="可选: 排除指定案件 (编辑现有当事人时避免命中自身)",
        max_length=36,
    )


class ConflictWarningVO(BaseModel):
    """冲突预警项. 对齐前端 NewCaseForm.ConflictWarningVO 字段."""

    type: str = Field(description="冲突类型: BLACKLIST | ONGOING | HISTORY")
    message: str = Field(description="面向用户的预警文案")
    party_name: str | None = Field(None, description="命中的当事人名称")
    related_case_id: str | None = Field(None, description="关联案件 ID")
    related_case_code: str | None = Field(None, description="关联案件编号")
    related_case_name: str | None = Field(None, description="关联案件名称")
    match_side: str | None = Field(
        None, description="对方/我方: OPPOSING | OUR_SIDE (用于 HISTORY 判定)"
    )


class ConflictCheckResponse(BaseModel):
    """冲突检索响应."""

    total: int = Field(description="命中总数")
    warnings: list[ConflictWarningVO] = Field(default_factory=list)


# 解决前向引用: PartyAddResponse 引用 ConflictWarningVO (定义在后面)
PartyAddResponse.model_rebuild()


# =============================================================================
# 5. BFF 请求包装 (用于 POST body 结构化)
# =============================================================================


class PartiesListBffRequest(BaseModel):
    """`POST /cases/parties/list` 请求."""

    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(description="案件 ID", max_length=36)


class PartyDetailBffRequest(BaseModel):
    """`POST /cases/parties/detail` 请求."""

    model_config = ConfigDict(extra="forbid")
    party_id: str = Field(description="当事人 ID", max_length=36)


class PartyUpdateBffRequest(BaseModel):
    """`POST /cases/parties/update` 请求 (party_id + patch 分离)."""

    model_config = ConfigDict(extra="forbid")
    party_id: str = Field(description="当事人 ID", max_length=36)
    patch: PartyUpdateRequest = Field(description="变更字段白名单, PATCH 语义")


class PartyRemoveBffRequest(BaseModel):
    """`POST /cases/parties/remove` 请求."""

    model_config = ConfigDict(extra="forbid")
    party_id: str = Field(description="当事人 ID", max_length=36)
    reason: str | None = Field(None, description="删除原因, 落审计日志 action_detail", max_length=200)


# =============================================================================
# 6. 审计日志查询 (PARTIES + MEMBERS, 决策 D6)
# =============================================================================


class AuditLogQueryRequest(BaseModel):
    """`POST /cases/audit-logs/query` 请求."""

    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(description="案件 ID", max_length=36)
    action_modules: list[str] | None = Field(
        None,
        description="过滤 action_module 列表 (PARTIES / MEMBERS / ...); 为空返回全部已集成模块",
    )
    pagination: "AuditLogPagination | None" = Field(None, description="分页; 默认 page=1 size=50")


class AuditLogPagination(BaseModel):
    page: int = Field(1, ge=1)
    size: int = Field(50, ge=1, le=200)


class AuditLogVO(BaseModel):
    """审计日志视图对象."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    case_id: str
    operator_id: str
    operator_name: str
    action_module: str
    action_type: str
    action_detail: str
    target_record_id: str | None = None
    before_data: dict | None = None
    after_data: dict | None = None
    created_at: datetime


class AuditLogQueryResponse(BaseModel):
    total: int
    page: int
    size: int
    items: list[AuditLogVO] = Field(default_factory=list)


AuditLogQueryRequest.model_rebuild()
