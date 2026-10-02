"""AI 案件辅助能力 Schemas

集中承载案件 AI 上下文、策略建议、内部报告和结案文书草稿契约。
落点: backend/src/schemas/case_ai.py

参考:
  - docs/plan/2026Q2_AI_CASE_ASSISTANT_WP_AI_00_API_CONTRACT_DESIGN.md (v1.1)
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# 枚举类型
# ---------------------------------------------------------------------------

SourceScope = Literal["EXTERNAL", "INTERNAL", "ALL"]
AiRunMode = Literal["MOCK", "CONTEXT_ONLY", "EXTERNAL_SEARCH", "LLM"]
LegalDraftType = Literal["LEGAL_ADVICE", "FILING_REPORT", "PHASE_LEGAL_OPINION"]
ReportPeriodType = Literal["YEAR", "QUARTER", "MONTH", "RANGE"]
ParseScope = Literal["DOCUMENTS", "CASE", "ALL_PENDING"]
DocumentParseStatus = Literal["PENDING", "PENDING_OCR", "PARSED", "FAILED", "SKIPPED"]
InternalReportStorageMode = Literal["TRANSIENT", "REPORTING_TASK_DRAFT"]

# ---------------------------------------------------------------------------
# 通用 VO
# ---------------------------------------------------------------------------


class AiSourceRefVO(BaseModel):
    """AI 来源引用"""
    source_type: str = Field(..., description="来源类型: CASE / PARTY / DOCUMENT / STRATEGY / CLOSURE / FINANCE")
    source_id: str | None = Field(default=None, description="表记录 ID")
    source_name: str | None = Field(default=None, description="来源名称")
    field_path: str | None = Field(default=None, description="字段路径，如 cases.description")
    excerpt: str | None = Field(default=None, description="80 字以内摘录")
    confidence: float | None = Field(default=None, ge=0, le=1, description="置信度")


class MaterialCompletenessVO(BaseModel):
    """材料完备度"""
    score: int = Field(..., ge=0, le=100, description="完备度评分 0-100")
    level: Literal["LOW", "MEDIUM", "HIGH"] = Field(..., description="完备度等级")
    missing_items: list[str] = Field(default_factory=list, description="缺失项列表")


class AiCommonMetaMixin(BaseModel):
    """AI 生成类响应公共元数据 Mixin"""
    is_stub: bool = Field(default=True, description="是否 mock 或降级")
    run_mode: AiRunMode = Field(default="MOCK", description="运行模式")
    generated_at: datetime = Field(default_factory=datetime.utcnow, description="生成时间")
    confidence: float = Field(..., ge=0, le=1, description="置信度 0-1")
    source_refs: list[AiSourceRefVO] = Field(default_factory=list, description="来源引用")
    material_completeness: MaterialCompletenessVO = Field(..., description="材料完备度")
    pending_material_tasks: list[str] = Field(default_factory=list, description="待补材料任务")


# ---------------------------------------------------------------------------
# 上下文 VO
# ---------------------------------------------------------------------------


class ClaimDefenseVO(BaseModel):
    """主诉/被诉要点"""
    our_claim: str | None = Field(default=None, description="我方诉求")
    opponent_claim: str | None = Field(default=None, description="对方诉求")
    our_position: str | None = Field(default=None, description="我方抗辩立场")
    opponent_position: str | None = Field(default=None, description="对方抗辩立场")


class AmountSummaryVO(BaseModel):
    """金额摘要"""
    currency: str = Field(default="CNY", description="币种")
    target_amount: Decimal | None = Field(default=None, description="标的额")
    claim_amount: Decimal | None = Field(default=None, description="诉请金额")
    judgment_amount: Decimal | None = Field(default=None, description="判决金额")
    recovered_amount: Decimal | None = Field(default=None, description="已回收金额")
    provision_amount: Decimal | None = Field(default=None, description="预计负债")
    budget_amount: Decimal | None = Field(default=None, description="预算金额")
    paid_amount: Decimal | None = Field(default=None, description="已支出金额")
    pending_amount: Decimal | None = Field(default=None, description="待支出金额")
    finance_visible: bool = Field(default=False, description="财务数据是否可见")
    finance_hidden_reason: str | None = Field(default=None, description="财务数据隐藏原因")


class StrategySnapshotVO(BaseModel):
    """策略快照"""
    strategy_id: str | None = Field(default=None, description="策略 ID")
    strategy_text: str | None = Field(default=None, description="策略正文")
    win_rate: float | None = Field(default=None, ge=0, le=1, description="预估胜诉率")
    risk_level: str | None = Field(default=None, description="风险等级")
    updated_at: datetime | None = Field(default=None, description="最后更新时间")


class ClosureSnapshotVO(BaseModel):
    """结案快照"""
    closure_id: str | None = Field(default=None, description="结案记录 ID")
    closure_type: str | None = Field(default=None, description="结案类型")
    closure_date: date | None = Field(default=None, description="结案日期")
    review_summary: str | None = Field(default=None, description="复盘摘要")
    improvement_actions: list[str] = Field(default_factory=list, description="整改建议")


class DossierDocumentSummaryVO(BaseModel):
    """卷宗文档摘要"""
    document_id: str = Field(..., description="文档 ID")
    document_name: str = Field(..., description="文档名称")
    doc_category: str | None = Field(default=None, description="文档分类")
    parse_status: DocumentParseStatus = Field(default="PENDING", description="解析状态")
    ai_summary: str | None = Field(default=None, description="AI 摘要")
    extracted_facts: list[str] = Field(default_factory=list, description="抽取的关键事实")
    proof_purpose: str | None = Field(default=None, description="证明目的")


class DossierSummaryVO(BaseModel):
    """卷宗汇总"""
    total_documents: int = Field(default=0, ge=0, description="文档总数")
    parsed_count: int = Field(default=0, ge=0, description="已解析数")
    pending_count: int = Field(default=0, ge=0, description="待解析数")
    failed_count: int = Field(default=0, ge=0, description="解析失败数")
    key_materials: list[DossierDocumentSummaryVO] = Field(default_factory=list, description="关键材料列表")


# ---------------------------------------------------------------------------
# 类案检索 VO
# ---------------------------------------------------------------------------


class SimilarCaseItemVO(BaseModel):
    """相似案例条目"""
    display_id: str = Field(..., description="展示 ID")
    source_scope: SourceScope = Field(..., description="来源范围")
    source_index: str | None = Field(default=None, description="来源索引名，如 doc_document_ycc")
    external_doc_id: str | None = Field(default=None, description="外部文书 ID")
    internal_case_id: str | None = Field(default=None, description="内部案件 ID")
    title: str = Field(..., description="文书标题")
    case_no: str | None = Field(default=None, description="案号")
    court_name: str | None = Field(default=None, description="法院名称")
    court_level: str | None = Field(default=None, description="法院等级")
    province: str | None = Field(default=None, description="省份")
    cause_of_action: str | None = Field(default=None, description="案由")
    trial_procedure: str | None = Field(default=None, description="审判程序")
    document_type: str | None = Field(default=None, description="文书类型")
    referee_date: date | None = Field(default=None, description="裁判日期")
    referee_result: str | None = Field(default=None, description="裁判结果")
    referee_basis: str | None = Field(default=None, description="裁判依据（法条）")
    summary: str | None = Field(default=None, description="摘要")
    basic_fact: str | None = Field(default=None, description="基本事实")
    focus_dispute: str | None = Field(default=None, description="争议焦点")
    court_believes: str | None = Field(default=None, description="本院认为")
    court_found: str | None = Field(default=None, description="本院查明")
    alleged: str | None = Field(default=None, description="诉称")
    argue: str | None = Field(default=None, description="辩称")
    keywords: str | None = Field(default=None, description="关键词")
    litigation_participant: str | None = Field(default=None, description="诉讼参与人")
    similarity: float | None = Field(default=None, ge=0, le=1, description="相似度")
    score: float | None = Field(default=None, ge=0, description="ES 评分")
    matched_fields: list[str] = Field(default_factory=list, description="命中字段")
    match_reason: str = Field(default="", description="匹配理由")
    snippets: list[str] = Field(default_factory=list, description="匹配片段")


# ---------------------------------------------------------------------------
# 内部报告 VO
# ---------------------------------------------------------------------------


class InternalReportMetricsVO(BaseModel):
    """内部报告指标"""
    total_cases: int = Field(default=0, ge=0, description="案件总数")
    new_cases: int = Field(default=0, ge=0, description="新增案件数")
    closed_cases: int = Field(default=0, ge=0, description="已结案数")
    major_risk_cases: int = Field(default=0, ge=0, description="重大风险案件数")
    total_target_amount: Decimal | None = Field(default=None, description="标的总额")
    total_provision_amount: Decimal | None = Field(default=None, description="预计负债总额")


class InternalReportSectionVO(BaseModel):
    """内部报告章节"""
    section_key: str = Field(..., description="章节键")
    title: str = Field(..., description="章节标题")
    content: str = Field(..., description="章节内容")
    source_refs: list[AiSourceRefVO] = Field(default_factory=list, description="来源引用")


# ---------------------------------------------------------------------------
# 卷宗解析重试 VO
# ---------------------------------------------------------------------------


class DossierParseRetryItemVO(BaseModel):
    """卷宗解析重试单项结果"""
    document_id: str = Field(..., description="文档 ID")
    document_name: str = Field(..., description="文档名称")
    previous_status: DocumentParseStatus | None = Field(default=None, description="之前状态")
    accepted: bool = Field(..., description="是否接受重试")
    next_status: DocumentParseStatus = Field(..., description="下一个状态")
    skip_reason: str | None = Field(default=None, description="跳过原因")


# ---------------------------------------------------------------------------
# 请求 / 响应
# ---------------------------------------------------------------------------

# ---------- 6.1 构建案件 AI 上下文 ----------


class CaseAiContextBuildRequest(BaseModel):
    """构建案件 AI 上下文请求"""
    case_id: str = Field(..., description="案件 ID")
    include_documents: bool = Field(default=True, description="是否包含卷宗摘要")
    include_finance: bool = Field(default=True, description="是否包含财务摘要")
    force_rebuild: bool = Field(default=False, description="是否强制重建")


class CaseAiContextBuildResponse(AiCommonMetaMixin):
    """构建案件 AI 上下文响应"""
    case_id: str = Field(..., description="案件 ID")
    context_version: str = Field(default="1.0", description="上下文版本")
    case_summary: str = Field(..., description="案件自动摘要")
    cause_of_action: str | None = Field(default=None, description="案由")
    claim_and_defense: ClaimDefenseVO = Field(default_factory=ClaimDefenseVO, description="主诉/被诉要点")
    dispute_focus: list[str] = Field(default_factory=list, description="争议焦点")
    amount_summary: AmountSummaryVO = Field(default_factory=AmountSummaryVO, description="金额摘要")
    evidence_summary: list[str] = Field(default_factory=list, description="证据摘要")
    strategy_snapshot: StrategySnapshotVO | None = Field(default=None, description="策略快照")
    closure_snapshot: ClosureSnapshotVO | None = Field(default=None, description="结案快照")
    dossier_summary: DossierSummaryVO | None = Field(default=None, description="卷宗汇总")


# ---------- 6.2 外部优先类案检索 ----------


class SimilarCaseSearchRequest(BaseModel):
    """相似案例检索请求（WP-AI-00 主契约版本）"""
    case_id: str | None = Field(default=None, description="案件 ID（优先）")
    query: str | None = Field(default=None, description="查询文本（调试或独立检索用）")
    top_k: int = Field(default=5, ge=1, le=20, description="返回条数")
    source_scope: SourceScope = Field(default="EXTERNAL", description="来源范围")


class SimilarCaseSearchResponse(AiCommonMetaMixin):
    """相似案例检索响应"""
    query_text: str | None = Field(default=None, description="实际使用的查询文本")
    source_scope: SourceScope = Field(default="EXTERNAL", description="来源范围")
    items: list[SimilarCaseItemVO] = Field(default_factory=list, description="相似案例列表")
    total: int = Field(default=0, ge=0, description="总条数")
    warnings: list[str] = Field(default_factory=list, description="警告信息")


# ---------- 6.3 生成策略建议 ----------


class StrategyRecommendRequest(BaseModel):
    """策略建议请求"""
    case_id: str = Field(..., description="案件 ID")
    top_k: int = Field(default=5, ge=0, le=20, description="类案检索条数")
    source_scope: SourceScope = Field(default="EXTERNAL", description="类案来源范围")
    force_refresh: bool = Field(default=False, description="是否强制刷新")


class StrategyRecommendResponse(AiCommonMetaMixin):
    """策略建议响应"""
    case_id: str = Field(..., description="案件 ID")
    case_auto_summary: str = Field(default="", description="案件自动摘要")
    similar_cases: list[SimilarCaseItemVO] = Field(default_factory=list, description="参考类案")
    strategy_points: list[str] = Field(default_factory=list, description="策略要点")
    action_recommendations: list[str] = Field(default_factory=list, description="行动建议")
    evidence_reinforcement: list[str] = Field(default_factory=list, description="证据补强建议")
    risk_warnings: list[str] = Field(default_factory=list, description="风险提示")
    recommended_strategy_text: str = Field(default="", description="推荐策略正文草稿")


# ---------- 6.4 年度综合分析报告 ----------


class InternalReportGenerateRequest(BaseModel):
    """内部报告生成请求"""
    period_type: ReportPeriodType = Field(default="YEAR", description="周期类型")
    year: int | None = Field(default=None, description="年度")
    quarter: str | None = Field(default=None, description="季度")
    month: str | None = Field(default=None, description="月份")
    date_start: date | None = Field(default=None, description="起始日期")
    date_end: date | None = Field(default=None, description="结束日期")
    save_draft: bool = Field(default=True, description="是否保存为草稿")


class InternalReportGenerateResponse(AiCommonMetaMixin):
    """内部报告生成响应"""
    task_id: str | None = Field(default=None, description="报告任务 ID")
    storage_mode: InternalReportStorageMode = Field(default="TRANSIENT", description="存储模式")
    report_category: str | None = Field(default=None, description="报告分类")
    title: str = Field(..., description="报告标题")
    period_label: str = Field(..., description="周期标签")
    metrics: InternalReportMetricsVO = Field(default_factory=InternalReportMetricsVO, description="指标数据")
    sections: list[InternalReportSectionVO] = Field(default_factory=list, description="报告章节")
    content_data: str = Field(default="", description="完整内容数据（JSON 字符串或 Markdown）")


# ---------- 6.5 结案法律建议书/备案报告草稿 ----------


class ClosingLegalDraftGenerateRequest(BaseModel):
    """结案法律文书草稿生成请求"""
    case_id: str = Field(..., description="案件 ID")
    draft_type: LegalDraftType = Field(default="LEGAL_ADVICE", description="草稿类型")
    allow_phase_opinion: bool = Field(default=True, description="未结案时是否降级为阶段意见")


class ClosingLegalDraftGenerateResponse(AiCommonMetaMixin):
    """结案法律文书草稿生成响应"""
    case_id: str = Field(..., description="案件 ID")
    draft_type: LegalDraftType = Field(..., description="实际生成的草稿类型")
    title: str = Field(..., description="标题")
    content: str = Field(..., description="正文内容")
    document_category: str = Field(default="", description="文档分类")
    can_archive: bool = Field(default=False, description="是否可归档（需人工确认后才为 true）")
    recommended_folder_id: str | None = Field(default=None, description="推荐归档文件夹 ID")
    warnings: list[str] = Field(default_factory=list, description="警告信息")


# ---------- 6.6 卷宗解析重试 ----------


class DossierParseRetryRequest(BaseModel):
    """卷宗解析重试请求"""
    case_id: str = Field(..., description="案件 ID")
    document_ids: list[str] = Field(default_factory=list, description="指定文档 ID 列表")
    scope: ParseScope = Field(default="DOCUMENTS", description="重试范围")
    force: bool = Field(default=False, description="是否强制重试")


class DossierParseRetryResponse(AiCommonMetaMixin):
    """卷宗解析重试响应"""
    task_id: str | None = Field(default=None, description="任务 ID")
    accepted_count: int = Field(default=0, ge=0, description="接受重试数")
    skipped_count: int = Field(default=0, ge=0, description="跳过数")
    items: list[DossierParseRetryItemVO] = Field(default_factory=list, description="重试结果明细")
