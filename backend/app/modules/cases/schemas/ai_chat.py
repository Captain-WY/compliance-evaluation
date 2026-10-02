"""法律大脑 (Legal Brain) AI BFF Schemas (2.S17).

D-AI 决策: 全部 Stub 占位，响应结构与真实版本完全一致.
真实 Qwen/BGE 接入留到项目最后阶段.

WP-AI-00 升级说明:
  - SimilarCaseSearchRequest/Response 兼容旧签名 (caseId/topK) 同时支持新契约 (case_id/top_k/source_scope).
  - 通过 Pydantic Field(alias=...) 实现双写兼容.
  - SimilarCaseSearchResponse 继承 AiCommonMetaMixin，确保契约一致性.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from .case_ai import AiCommonMetaMixin, MaterialCompletenessVO


# ---------------------------------------------------------------------------
# 会话管理
# ---------------------------------------------------------------------------

class AiSessionListRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    page: int = Field(default=1, alias="page")
    page_size: int = Field(default=20, alias="pageSize")


class AiSessionItem(BaseModel):
    session_id: str = Field(..., alias="sessionId")
    title: str
    created_at: str = Field(..., alias="createdAt")
    updated_at: str = Field(..., alias="updatedAt")


class AiSessionListResponse(BaseModel):
    total: int
    page: int
    page_size: int = Field(..., alias="pageSize")
    items: list[AiSessionItem]


class AiSessionDetailRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    session_id: str = Field(..., alias="sessionId")
    page: int = Field(default=1, alias="page")
    page_size: int = Field(default=50, alias="pageSize")


class AiMessageItem(BaseModel):
    message_id: str = Field(..., alias="messageId")
    role: str
    content: str
    created_at: str = Field(..., alias="createdAt")


class AiSessionDetailResponse(BaseModel):
    session_id: str = Field(..., alias="sessionId")
    title: str
    messages: list[AiMessageItem]
    total: int
    page: int
    page_size: int = Field(..., alias="pageSize")


class AiSessionCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    title: Optional[str] = Field(default=None, alias="title")


class AiSessionCreateResponse(BaseModel):
    session_id: str = Field(..., alias="sessionId")
    title: str
    created_at: str = Field(..., alias="createdAt")
    is_stub: bool = Field(default=True, alias="isStub")


class AiSessionDeleteRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    session_id: str = Field(..., alias="sessionId")


class AiSessionDeleteResponse(BaseModel):
    session_id: str = Field(..., alias="sessionId")
    deleted: bool


# ---------------------------------------------------------------------------
# AI 对话
# ---------------------------------------------------------------------------

class AiChatContext(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    case_id: Optional[str] = Field(default=None, alias="caseId")


class AiChatStreamRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    session_id: str = Field(..., alias="sessionId")
    message: str
    context: Optional[AiChatContext] = Field(default=None, alias="context")


class AiChatStreamResponse(BaseModel):
    message_id: str = Field(..., alias="messageId")
    session_id: str = Field(..., alias="sessionId")
    content: str
    is_stub: bool = Field(default=True, alias="isStub")
    created_at: str = Field(..., alias="createdAt")


# ---------------------------------------------------------------------------
# 相似案例推荐 (WP-AI-00 升级)
# ---------------------------------------------------------------------------

class SimilarCaseSearchRequest(BaseModel):
    """相似案例检索请求 (兼容层).

    旧调用: { query, caseId?, topK? } (camelCase, 前端直接传入)
    新调用: { query?, case_id?, top_k?, source_scope? } (snake_case, 经 apiClient 转换后)
    通过 populate_by_name=True + Field(alias=...) 双写兼容.

    query 为 Optional: case_id 模式会自动构建查询文本, 无需前端显式提供 query.
    """
    model_config = ConfigDict(populate_by_name=True)
    query: Optional[str] = Field(default=None, alias="query")
    case_id: Optional[str] = Field(default=None, alias="caseId")
    top_k: int = Field(default=5, ge=1, le=20, alias="topK")
    source_scope: str = Field(default="EXTERNAL", description="来源范围: EXTERNAL / INTERNAL / ALL")


class SimilarCaseItem(BaseModel):
    """相似案例条目 (兼容层).

    保留旧字段 (caseId/caseName/similarity/outcome/outcomeName/amount) 供前端已有组件消费.
    新增字段 (display_id/source_scope/...) 供 WP-AI-00 新契约消费.
    前端 Adapter 负责映射: caseId = internal_case_id ?? external_doc_id ?? display_id.
    """
    model_config = ConfigDict(populate_by_name=True)
    # 旧字段 (兼容前端已有 CaseOverview.tsx / LegalBrain.tsx)
    case_id: str = Field(..., alias="caseId")
    case_name: str = Field(..., alias="caseName")
    similarity: float
    outcome: Optional[str] = Field(default=None, alias="outcome")
    outcome_name: Optional[str] = Field(default=None, alias="outcomeName")
    amount: Optional[float] = Field(default=None, alias="amount")

    # 新字段 (WP-AI-00 扩展)
    display_id: str = Field(default="", alias="displayId")
    source_scope: str = Field(default="EXTERNAL", alias="sourceScope")
    source_index: Optional[str] = Field(default=None, alias="sourceIndex")
    external_doc_id: Optional[str] = Field(default=None, alias="externalDocId")
    internal_case_id: Optional[str] = Field(default=None, alias="internalCaseId")
    title: Optional[str] = Field(default=None, alias="title")
    case_no: Optional[str] = Field(default=None, alias="caseNo")
    court_name: Optional[str] = Field(default=None, alias="courtName")
    court_level: Optional[str] = Field(default=None, alias="courtLevel")
    province: Optional[str] = Field(default=None, alias="province")
    cause_of_action: Optional[str] = Field(default=None, alias="causeOfAction")
    trial_procedure: Optional[str] = Field(default=None, alias="trialProcedure")
    document_type: Optional[str] = Field(default=None, alias="documentType")
    referee_date: Optional[str] = Field(default=None, alias="refereeDate")
    referee_result: Optional[str] = Field(default=None, alias="refereeResult")
    referee_basis: Optional[str] = Field(default=None, alias="refereeBasis")
    summary: Optional[str] = Field(default=None, alias="summary")
    basic_fact: Optional[str] = Field(default=None, alias="basicFact")
    focus_dispute: Optional[str] = Field(default=None, alias="focusDispute")
    court_believes: Optional[str] = Field(default=None, alias="courtBelieves")
    court_found: Optional[str] = Field(default=None, alias="courtFound")
    alleged: Optional[str] = Field(default=None, alias="alleged")
    argue: Optional[str] = Field(default=None, alias="argue")
    keywords: Optional[str] = Field(default=None, alias="keywords")
    litigation_participant: Optional[str] = Field(default=None, alias="litigationParticipant")
    score: Optional[float] = Field(default=None, ge=0, alias="score")
    matched_fields: list[str] = Field(default_factory=list, alias="matchedFields")
    match_reason: str = Field(default="", alias="matchReason")
    snippets: list[str] = Field(default_factory=list, alias="snippets")


class SimilarCaseSearchResponse(AiCommonMetaMixin):
    """相似案例检索响应 (兼容层).

    继承 AiCommonMetaMixin 确保与 case_ai.py 主契约一致.
    覆盖父类字段以添加 camelCase alias，兼容旧前端调用.
    """
    model_config = ConfigDict(populate_by_name=True)

    # 覆盖父类公共元数据字段，添加 camelCase alias
    is_stub: bool = Field(default=True, alias="isStub")
    run_mode: str = Field(default="MOCK", alias="runMode")
    generated_at: datetime = Field(default_factory=datetime.utcnow, alias="generatedAt")
    confidence: float = Field(..., ge=0, le=1, alias="confidence")
    source_refs: list = Field(default_factory=list, alias="sourceRefs")
    material_completeness: MaterialCompletenessVO = Field(..., alias="materialCompleteness")
    pending_material_tasks: list[str] = Field(default_factory=list, alias="pendingMaterialTasks")

    # 兼容层特有字段
    items: list[SimilarCaseItem] = Field(default_factory=list, alias="items")
    query_text: Optional[str] = Field(default=None, alias="queryText")
    source_scope: str = Field(default="EXTERNAL", alias="sourceScope")
    total: int = Field(default=0, ge=0, alias="total")
    warnings: list[str] = Field(default_factory=list, alias="warnings")
