import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Case, FinancialRecord, CaseStrategy, CaseHistoryLog, CaseComment } from '../../types';
import {
  getStrategyByCaseId, saveStrategy, updateCaseGeneralInfo,
  getCaseHistory, getCaseComments, addCaseComment,
  generateStrategyRecommendation,
  type SimilarCaseRecord, type StrategyRecommendationRecord,
} from '../../services/case';
import {
  Target, Edit3, Save, FileText, History, Activity,
  User, Sparkles, BookOpen, Quote, Loader2, X, MessageSquare, PlusCircle,
  Paperclip, AtSign, Bold, Italic, List, Send, Lock, Globe, Printer,
  Wand2, ChevronRight, ShieldAlert, Lightbulb, CheckCircle2,
  Eye, Calendar, Building2, Scale, Gavel, Tag, Hash, ExternalLink,
  ChevronDown, ChevronUp, Bookmark,
} from 'lucide-react';
import Button from '../../components/ui/Button';
import CaseBriefingModal from '../reporting/CaseBriefingModal';

interface CaseOverviewProps {
  caseData: Case;
  finance?: FinancialRecord;
}

// ── WP-AI-04: 类案详情弹窗 ───────────────────────────────────────────────────

interface SimilarCaseDetailModalProps {
  caseItem: SimilarCaseRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onCite: (c: SimilarCaseRecord) => void;
}

const FIELD_LABEL_MAP: Record<string, string> = {
  summary: '文书摘要',
  basic_fact: '基本事实',
  focus_dispute: '争议焦点',
  court_believes: '本院认为',
  referee_result: '裁判结果',
  alleged: '诉称',
  argue: '辩称',
  court_found: '本院查明',
  txt: '全文',
};

// ── 可折叠字段面板 ─────────────────────────────────────────────────────────

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title, icon, children, defaultOpen = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-100 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50/50 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase">
          {icon}
          {title}
        </div>
        {isOpen ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
      </button>
      {isOpen && (
        <div className="px-3 py-2.5 text-[11px] text-slate-700 leading-relaxed bg-white">
          {children}
        </div>
      )}
    </div>
  );
};

const SimilarCaseDetailModal: React.FC<SimilarCaseDetailModalProps> = ({
  caseItem,
  isOpen,
  onClose,
  onCite,
}) => {
  if (!isOpen || !caseItem) return null;

  const simPct = Math.round(caseItem.similarity * 100);

  // 构建可展示的详情字段列表（有内容才展示）
  const detailSections: { key: string; title: string; icon: React.ReactNode; content: string | null | undefined }[] = [
    { key: 'litigationParticipant', title: '诉讼参与人', icon: <User className="w-3 h-3" />, content: caseItem.litigationParticipant },
    { key: 'summary', title: '案件摘要', icon: <FileText className="w-3 h-3" />, content: caseItem.summary },
    { key: 'basicFact', title: '基本事实', icon: <Bookmark className="w-3 h-3" />, content: caseItem.basicFact },
    { key: 'focusDispute', title: '争议焦点', icon: <Target className="w-3 h-3" />, content: caseItem.focusDispute },
    { key: 'alleged', title: '原告诉称', icon: <Scale className="w-3 h-3" />, content: caseItem.alleged },
    { key: 'argue', title: '被告辩称', icon: <ShieldAlert className="w-3 h-3" />, content: caseItem.argue },
    { key: 'courtFound', title: '本院查明', icon: <Eye className="w-3 h-3" />, content: caseItem.courtFound },
    { key: 'courtBelieves', title: '本院认为', icon: <Lightbulb className="w-3 h-3" />, content: caseItem.courtBelieves },
    { key: 'refereeBasis', title: '裁判依据', icon: <Gavel className="w-3 h-3" />, content: caseItem.refereeBasis },
    { key: 'keywords', title: '关键词', icon: <Hash className="w-3 h-3" />, content: caseItem.keywords },
  ];

  const hasDetailSections = detailSections.some(s => s.content);

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-start sticky top-0 z-10">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <Scale className="w-4 h-4 text-brand-600 shrink-0" />
              <h3 className="font-bold text-slate-800 text-base leading-tight" title={caseItem.caseName}>
                {caseItem.caseName || '未命名文书'}
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {caseItem.caseNo && (
                <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">
                  {caseItem.caseNo}
                </span>
              )}
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200 font-bold">
                {simPct}% 相似
              </span>
              {caseItem.documentType && (
                <span className="text-[11px] px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">
                  {caseItem.documentType}
                </span>
              )}
              {caseItem.courtLevel && (
                <span className="text-[11px] px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-100">
                  {caseItem.courtLevel}
                </span>
              )}
              <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-500">
                {caseItem.sourceScope === 'EXTERNAL' ? '外部判例' : '内部案件'}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600 transition-colors shrink-0 ml-3"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Meta Info Grid */}
          <div className="grid grid-cols-2 gap-3">
            {caseItem.courtName && (
              <div className="flex items-start gap-2">
                <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-[10px] text-slate-400 uppercase">审理法院</div>
                  <div className="text-xs text-slate-700 font-medium">{caseItem.courtName}</div>
                </div>
              </div>
            )}
            {caseItem.province && (
              <div className="flex items-start gap-2">
                <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-[10px] text-slate-400 uppercase">省份</div>
                  <div className="text-xs text-slate-700 font-medium">{caseItem.province}</div>
                </div>
              </div>
            )}
            {caseItem.refereeDate && (
              <div className="flex items-start gap-2">
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-[10px] text-slate-400 uppercase">裁判日期</div>
                  <div className="text-xs text-slate-700 font-medium">{caseItem.refereeDate}</div>
                </div>
              </div>
            )}
            {caseItem.causeOfAction && (
              <div className="flex items-start gap-2">
                <Tag className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-[10px] text-slate-400 uppercase">案由</div>
                  <div className="text-xs text-slate-700 font-medium">{caseItem.causeOfAction}</div>
                </div>
              </div>
            )}
            {caseItem.trialProcedure && (
              <div className="flex items-start gap-2">
                <Gavel className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-[10px] text-slate-400 uppercase">审判程序</div>
                  <div className="text-xs text-slate-700 font-medium">{caseItem.trialProcedure}</div>
                </div>
              </div>
            )}
            {caseItem.keywords && (
              <div className="flex items-start gap-2">
                <Hash className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-[10px] text-slate-400 uppercase">关键词</div>
                  <div className="text-xs text-slate-700 font-medium">{caseItem.keywords.slice(0, 40)}{caseItem.keywords.length > 40 ? '...' : ''}</div>
                </div>
              </div>
            )}
          </div>

          {/* Referee Result */}
          {caseItem.refereeResult && (
            <div className="bg-emerald-50/60 border border-emerald-100 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-[11px] font-bold text-emerald-700 uppercase">裁判结果</span>
              </div>
              <p className="text-xs text-emerald-800 leading-relaxed">{caseItem.refereeResult}</p>
            </div>
          )}

          {/* Detail Sections - Collapsible */}
          {hasDetailSections && (
            <div>
              <div className="text-[11px] font-bold text-slate-500 uppercase mb-2 flex items-center gap-1">
                <BookOpen className="w-3 h-3" /> 文书详情
                <span className="text-[10px] text-slate-400 font-normal normal-case">（点击展开查看）</span>
              </div>
              <div className="space-y-2">
                {detailSections.map((section) => {
                  if (!section.content) return null;
                  return (
                    <CollapsibleSection key={section.key} title={section.title} icon={section.icon}>
                      <p className="whitespace-pre-wrap">{section.content}</p>
                    </CollapsibleSection>
                  );
                })}
              </div>
            </div>
          )}

          {/* Match Reason */}
          {caseItem.matchedFields && caseItem.matchedFields.length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-slate-500 uppercase mb-1.5 flex items-center gap-1">
                <Hash className="w-3 h-3" /> 匹配命中字段
              </div>
              <div className="flex flex-wrap gap-1.5">
                {caseItem.matchedFields.map((field, i) => (
                  <span
                    key={i}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-100"
                  >
                    {FIELD_LABEL_MAP[field] || field}
                  </span>
                ))}
              </div>
              {caseItem.matchReason && (
                <p className="text-[11px] text-slate-500 mt-1.5 bg-slate-50 rounded px-2 py-1.5 border border-slate-100">
                  {caseItem.matchReason}
                </p>
              )}
            </div>
          )}

          {/* Snippets */}
          {caseItem.snippets && caseItem.snippets.length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-slate-500 uppercase mb-1.5 flex items-center gap-1">
                <FileText className="w-3 h-3" /> 相关片段
              </div>
              <div className="space-y-2">
                {caseItem.snippets.map((snippet, i) => (
                  <div
                    key={i}
                    className="text-[11px] text-slate-600 bg-slate-50 rounded px-3 py-2 border border-slate-100 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: snippet }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2 sticky bottom-0">
          <Button variant="ghost" size="sm" onClick={onClose}>
            关闭
          </Button>
          <Button size="sm" onClick={() => { onCite(caseItem); onClose(); }}>
            <Quote className="w-3 h-3 mr-1" /> 引用到策略
          </Button>
        </div>
      </div>
    </div>
  );
};

const toPercent = (value: number): number => {
  const normalized = Number.isFinite(value) ? value : 0;
  const percent = normalized > 1 ? normalized : normalized * 100;
  return Math.max(0, Math.min(100, Math.round(percent)));
};

const getSimilarityTone = (percent: number): string => {
  if (percent >= 85) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (percent >= 65) return 'bg-brand-50 text-brand-700 border-brand-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
};

const getSourceScopeLabel = (scope?: SimilarCaseRecord['sourceScope']): string => {
  if (scope === 'INTERNAL') return '内部案件';
  if (scope === 'ALL') return '混合来源';
  return '外部判例';
};

const getSimilarCaseTitle = (caseItem: SimilarCaseRecord): string => {
  const title = caseItem.caseName?.trim();
  if (title) return title;
  return caseItem.caseNo || '未命名判例';
};

const getSimilarCaseOutcome = (caseItem: SimilarCaseRecord): string | null =>
  caseItem.refereeResult || caseItem.outcomeName || caseItem.outcome || null;

interface SimilarCaseCardProps {
  caseItem: SimilarCaseRecord;
  compact?: boolean;
  onCiteCase: (c: SimilarCaseRecord) => void;
  onOpenCaseDetail: (c: SimilarCaseRecord) => void;
}

const SimilarCaseCard: React.FC<SimilarCaseCardProps> = ({
  caseItem,
  compact = false,
  onCiteCase,
  onOpenCaseDetail,
}) => {
  const title = getSimilarCaseTitle(caseItem);
  const similarityPercent = toPercent(caseItem.similarity);
  const outcome = getSimilarCaseOutcome(caseItem);
  const summary = caseItem.summary || caseItem.focusDispute || caseItem.matchReason;

  const handleKeyboardOpen = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpenCaseDetail(caseItem);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenCaseDetail(caseItem)}
      onKeyDown={handleKeyboardOpen}
      className={`group cursor-pointer rounded-lg border bg-white transition-all outline-none focus:ring-2 focus:ring-brand-200 ${
        compact
          ? 'border-slate-200 p-3 hover:border-brand-300 hover:bg-brand-50/20'
          : 'border-slate-200 p-3.5 shadow-sm hover:border-brand-300 hover:shadow-md'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${getSimilarityTone(similarityPercent)}`}>
              {similarityPercent}% 相似
            </span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">
              {getSourceScopeLabel(caseItem.sourceScope)}
            </span>
            {caseItem.documentType && (
              <span className="rounded border border-amber-100 bg-amber-50 px-1.5 py-0.5 text-[9px] text-amber-700">
                {caseItem.documentType}
              </span>
            )}
            {caseItem.trialProcedure && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">
                {caseItem.trialProcedure}
              </span>
            )}
          </div>
          <p
            className={`${compact ? 'text-xs' : 'text-sm'} line-clamp-2 font-bold leading-snug text-slate-800`}
            title={title}
          >
            {title}
          </p>
        </div>
        <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300 transition-colors group-hover:text-brand-500" />
      </div>

      <div className={`mt-2 grid gap-x-3 gap-y-1 text-[10px] text-slate-500 ${compact ? 'grid-cols-1' : 'sm:grid-cols-2'}`}>
        {caseItem.caseNo && (
          <span className="flex min-w-0 items-center gap-1">
            <Hash className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{caseItem.caseNo}</span>
          </span>
        )}
        {caseItem.courtName && (
          <span className="flex min-w-0 items-center gap-1">
            <Building2 className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{caseItem.courtName}{caseItem.courtLevel ? `（${caseItem.courtLevel}）` : ''}</span>
          </span>
        )}
        {caseItem.refereeDate && (
          <span className="flex min-w-0 items-center gap-1">
            <Calendar className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{caseItem.refereeDate}</span>
          </span>
        )}
        {caseItem.causeOfAction && (
          <span className="flex min-w-0 items-center gap-1">
            <Tag className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{caseItem.causeOfAction}</span>
          </span>
        )}
      </div>

      {outcome && (
        <p className="mt-2 line-clamp-2 rounded border border-emerald-100 bg-emerald-50/60 px-2 py-1 text-[10px] leading-relaxed text-emerald-700">
          裁判结果：{outcome}
        </p>
      )}
      {summary && (
        <p className="mt-2 line-clamp-2 rounded border border-slate-100 bg-slate-50 px-2 py-1 text-[10px] leading-relaxed text-slate-600">
          {summary}
        </p>
      )}

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onOpenCaseDetail(caseItem); }}
          className="flex flex-1 items-center justify-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-600 transition-colors hover:border-brand-300 hover:text-brand-700"
        >
          <Eye className="h-2.5 w-2.5" /> 详情
        </button>
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onCiteCase(caseItem); }}
          className="flex flex-1 items-center justify-center gap-1 rounded bg-brand-50 px-2 py-1 text-[10px] font-medium text-brand-700 transition-colors hover:bg-brand-100"
        >
          <Quote className="h-2.5 w-2.5" /> 引用
        </button>
      </div>
    </div>
  );
};

// ── WP-AI-02: 策略建议面板子组件 ──────────────────────────────────────────────

interface RecommendationPanelProps {
  recommendation: StrategyRecommendationRecord;
  onAdopt: () => void;
  onDismiss: () => void;
  onCiteCase: (c: SimilarCaseRecord) => void;
  onOpenCaseDetail: (c: SimilarCaseRecord) => void;
}

const RecommendationPanel: React.FC<RecommendationPanelProps> = ({
  recommendation,
  onAdopt,
  onDismiss,
  onCiteCase,
  onOpenCaseDetail,
}) => {
  const { materialCompleteness, isStub } = recommendation;
  const confidencePercent = toPercent(recommendation.confidence);
  const levelColor = {
    LOW: 'bg-amber-100 text-amber-700 border-amber-200',
    MEDIUM: 'bg-blue-100 text-blue-700 border-blue-200',
    HIGH: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  }[materialCompleteness.level];

  return (
    <div className="overflow-hidden rounded-lg border border-brand-200 bg-white shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Panel Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-100 bg-brand-50/70 px-5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-brand-600" />
          <h4 className="text-sm font-bold text-brand-800">AI 策略建议</h4>
          {isStub && (
            <span className="rounded border border-amber-200 bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
              降级建议
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="rounded-full border border-brand-200 bg-white px-2 py-0.5 text-[10px] font-bold text-brand-700">
            置信度 {confidencePercent}%
          </span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${levelColor}`}>
            材料完备度 {materialCompleteness.score}%
          </span>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded p-1 text-brand-400 transition-colors hover:bg-brand-100 hover:text-brand-600"
            title="关闭建议面板"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-3">
          <h5 className="mb-1.5 flex items-center gap-1 text-xs font-bold uppercase text-slate-500">
            <FileText className="h-3 w-3" /> 案件摘要
          </h5>
          <p className="text-sm leading-relaxed text-slate-700">
            {recommendation.caseAutoSummary}
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            {recommendation.pendingMaterialTasks.length > 0 && (
              <div className="rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2.5">
                <h5 className="mb-1.5 flex items-center gap-1 text-xs font-bold uppercase text-amber-700">
                  <Lightbulb className="h-3 w-3" /> 待补材料任务
                </h5>
                <ul className="space-y-1">
                  {recommendation.pendingMaterialTasks.map((task, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-amber-800">
                      <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                      {task}
                    </li>
                  ))}
                </ul>
              </div>
            )}

        {/* Strategy Points */}
        {recommendation.strategyPoints.length > 0 && (
          <div>
            <h5 className="text-xs font-bold text-slate-500 uppercase mb-1.5 flex items-center gap-1">
              <Target className="w-3 h-3" /> 策略要点
            </h5>
            <ul className="space-y-1.5">
              {recommendation.strategyPoints.map((point, i) => (
                <li key={i} className="text-xs text-slate-700 flex items-start gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-brand-500 shrink-0 mt-0.5" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Action Recommendations */}
        {recommendation.actionRecommendations.length > 0 && (
          <div>
            <h5 className="text-xs font-bold text-slate-500 uppercase mb-1.5 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> 行动建议
            </h5>
            <ul className="space-y-1.5">
              {recommendation.actionRecommendations.map((action, i) => (
                <li key={i} className="text-xs text-slate-700 flex items-start gap-1.5">
                  <ChevronRight className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                  {action}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Evidence Reinforcement */}
        {recommendation.evidenceReinforcement.length > 0 && (
          <div>
            <h5 className="text-xs font-bold text-slate-500 uppercase mb-1.5 flex items-center gap-1">
              <BookOpen className="w-3 h-3" /> 证据补强
            </h5>
            <ul className="space-y-1">
              {recommendation.evidenceReinforcement.map((item, i) => (
                <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Risk Warnings */}
        {recommendation.riskWarnings.length > 0 && (
          <div className="bg-red-50/50 border border-red-100 rounded-md p-3">
            <h5 className="text-xs font-bold text-red-700 uppercase mb-1.5 flex items-center gap-1">
              <ShieldAlert className="w-3 h-3" /> 风险提示
            </h5>
            <ul className="space-y-1">
              {recommendation.riskWarnings.map((warn, i) => (
                <li key={i} className="text-xs text-red-600 flex items-start gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-red-400 mt-1.5 shrink-0" />
                  {warn}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Recommended Strategy Text Preview */}
        <div>
          <h5 className="text-xs font-bold text-slate-500 uppercase mb-1.5">推荐策略正文草稿</h5>
          <div className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2.5 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto custom-scrollbar">
            {recommendation.recommendedStrategyText}
          </div>
        </div>
          </div>

          <div className="self-start overflow-hidden rounded-lg border border-brand-100 bg-brand-50/40">
            <div className="flex items-center justify-between border-b border-brand-100 bg-brand-100/50 px-3 py-2">
              <h5 className="flex items-center gap-1 text-xs font-bold text-brand-800">
                <BookOpen className="h-3 w-3" /> 参考判例
              </h5>
              <span className="text-[10px] text-brand-600">
                {recommendation.similarCases.length} 条
              </span>
            </div>
            <div className="max-h-[560px] space-y-2 overflow-y-auto p-3 custom-scrollbar">
              {recommendation.similarCases.length > 0 ? (
                recommendation.similarCases.map((c, idx) => (
                  <SimilarCaseCard
                    key={c.caseId || `${c.caseName}-${idx}`}
                    caseItem={c}
                    compact
                    onCiteCase={onCiteCase}
                    onOpenCaseDetail={onOpenCaseDetail}
                  />
                ))
              ) : (
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-4 text-center text-xs text-slate-400">
                  暂无高相似外部判例，策略建议基于案件现有字段生成。
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            暂不采纳
          </Button>
          <Button size="sm" onClick={onAdopt}>
            <CheckCircle2 className="w-3 h-3 mr-1" /> 采纳到策略草稿
          </Button>
        </div>
      </div>
    </div>
  );
};

// ── CaseOverview 主组件 ──────────────────────────────────────────────────────

const CaseOverview: React.FC<CaseOverviewProps> = ({ caseData: initialCaseData, finance }) => {
  const [caseData, setCaseData] = useState(initialCaseData);
  const [strategy, setStrategy] = useState<CaseStrategy | null>(null);

  // Strategy Edit State
  const [isEditingStrategy, setIsEditingStrategy] = useState(false);
  const [strategyForm, setStrategyForm] = useState<Partial<CaseStrategy>>({});

  // AI Recommendations State (WP-AI-02)
  const [recommendation, setRecommendation] = useState<StrategyRecommendationRecord | null>(null);
  type RecommendationStatus = 'idle' | 'loading' | 'success' | 'error';
  const [recommendationStatus, setRecommendationStatus] = useState<RecommendationStatus>('idle');
  const [recommendationError, setRecommendationError] = useState<string | null>(null);

  // Case Info Edit State
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [infoForm, setInfoForm] = useState<Partial<Case>>({});

  // Activity Stream State
  const [activityTab, setActivityTab] = useState<'ALL' | 'COMMENTS' | 'HISTORY'>('ALL');
  const [historyLogs, setHistoryLogs] = useState<CaseHistoryLog[]>([]);
  const [comments, setComments] = useState<CaseComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [isSendingComment, setIsSendingComment] = useState(false);

  const [loadingStrat, setLoadingStrat] = useState(true);

  // Report Modal State
  const [showBriefing, setShowBriefing] = useState(false);

  // WP-AI-04: 类案详情弹窗状态
  const [selectedSimilarCase, setSelectedSimilarCase] = useState<SimilarCaseRecord | null>(null);

  useEffect(() => {
    setCaseData(initialCaseData);
  }, [initialCaseData]);

  useEffect(() => {
    // Parallel Load
    Promise.all([
      getStrategyByCaseId(caseData.id),
      getCaseHistory(caseData.id),
      getCaseComments(caseData.id),
    ]).then(([strat, logs, comms]) => {
      setStrategy(strat);
      if (strat) setStrategyForm(strat);
      setHistoryLogs(logs);
      setComments(comms);
      setLoadingStrat(false);
      setLoadingActivity(false);
    });
  }, [caseData.id]);

  // WP-AI-02: Generate strategy recommendation
  const handleGenerateRecommendation = async () => {
    setRecommendationStatus('loading');
    setRecommendationError(null);
    try {
      const result = await generateStrategyRecommendation({
        caseId: caseData.id,
        sourceScope: 'EXTERNAL',
        topK: 5,
      });
      setRecommendation(result);
      setRecommendationStatus('success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '生成策略建议失败';
      setRecommendationError(msg);
      setRecommendationStatus('error');
    }
  };

  // WP-AI-02: Adopt recommendation into strategy draft
  const handleAdoptRecommendation = () => {
    if (!recommendation) return;
    setStrategyForm(prev => ({
      ...prev,
      analysis: recommendation.recommendedStrategyText,
      direction: prev.direction || '积极应诉',
      winProbability: prev.winProbability ?? 50,
    }));
    setRecommendation(null);
    setRecommendationStatus('idle');
    setIsEditingStrategy(true);
  };

  // WP-AI-02: Dismiss recommendation panel
  const handleDismissRecommendation = () => {
    setRecommendation(null);
    setRecommendationStatus('idle');
    setRecommendationError(null);
  };

  const handleOpenEditInfo = () => {
    setInfoForm({
      title: caseData.title,
      description: caseData.description || '',
      riskLevel: caseData.riskLevel,
      stage: caseData.stage,
      businessLine: caseData.businessLine,
      tags: caseData.tags,
    });
    setIsEditingInfo(true);
  };

  const handleSaveInfo = async () => {
    try {
      await updateCaseGeneralInfo(caseData.id, infoForm);
      setCaseData(prev => ({ ...prev, ...infoForm }));
      setIsEditingInfo(false);
    } catch {
      // apiClient 标准拦截器已 toast.error()
    }
  };

  const handleSaveStrategy = async () => {
    if (!strategyForm.direction || !strategyForm.analysis) return;
    try {
      const saved = await saveStrategy({
        caseId: caseData.id,
        direction: strategyForm.direction as string,
        winProbability: strategyForm.winProbability || 50,
        analysis: strategyForm.analysis as string,
      });
      setStrategy(saved);
      setIsEditingStrategy(false);
    } catch {
      // apiClient 标准拦截器已 toast.error()
    }
  };

  const handleSendComment = async () => {
    if (!newComment.trim()) return;
    setIsSendingComment(true);
    try {
      const added = await addCaseComment({
        caseId: caseData.id,
        content: newComment,
        isInternal: true,
      });
      setComments(prev => [added, ...prev]);
      setNewComment('');
    } catch {
      // apiClient 标准拦截器已 toast.error()
    } finally {
      setIsSendingComment(false);
    }
  };

  const handleCiteCase = (simCase: SimilarCaseRecord) => {
    const parts: string[] = ['\n—— 参考案例 ——'];
    parts.push(`文书：${simCase.caseName}`);
    if (simCase.caseNo) parts.push(`案号：${simCase.caseNo}`);
    if (simCase.courtName) parts.push(`法院：${simCase.courtName}`);
    if (simCase.causeOfAction) parts.push(`案由：${simCase.causeOfAction}`);
    if (simCase.refereeDate) parts.push(`裁判日期：${simCase.refereeDate}`);
    parts.push(`相似度：${Math.round(simCase.similarity * 100)}%`);
    if (simCase.refereeResult) {
      parts.push(`裁判结果：${simCase.refereeResult}`);
    }
    // 引用更丰富的判例信息到策略正文
    if (simCase.summary) {
      parts.push(`案件摘要：${simCase.summary.slice(0, 200)}${simCase.summary.length > 200 ? '...' : ''}`);
    }
    if (simCase.focusDispute) {
      parts.push(`争议焦点：${simCase.focusDispute.slice(0, 150)}${simCase.focusDispute.length > 150 ? '...' : ''}`);
    }
    if (simCase.courtBelieves) {
      parts.push(`法院观点：${simCase.courtBelieves.slice(0, 150)}${simCase.courtBelieves.length > 150 ? '...' : ''}`);
    }
    if (simCase.refereeBasis) {
      parts.push(`裁判依据：${simCase.refereeBasis.slice(0, 150)}${simCase.refereeBasis.length > 150 ? '...' : ''}`);
    }
    parts.push('');
    const citation = parts.join('\n');
    setStrategyForm(prev => ({
      ...prev,
      analysis: (prev.analysis || '') + citation,
    }));
    // 如不在编辑模式，自动进入编辑模式让用户看到引用内容
    if (!isEditingStrategy) {
      setIsEditingStrategy(true);
    }
    toast.success(`已引用「${simCase.caseName.slice(0, 30)}${simCase.caseName.length > 30 ? '...' : ''}」到策略草稿`);
  };

  const handleOpenSimilarCaseDetail = (simCase: SimilarCaseRecord) => {
    setSelectedSimilarCase(simCase);
  };

  const getStrategyColor = (dir: string) => {
    if (dir === '积极应诉') return 'bg-blue-100 text-blue-700 border-blue-200';
    if (dir === '寻求和解') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (dir === '提起反诉') return 'bg-red-100 text-red-700 border-red-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  // Merge & Sort Activity
  const combinedActivity = React.useMemo(() => {
    const logs = historyLogs.map(l => ({ ...l, type: 'LOG' }));
    const comms = comments.map(c => ({ ...c, type: 'COMMENT' }));
    // Sort desc by time
    return [...logs, ...comms].sort((a: any, b: any) => {
      const timeA = a.timestamp || a.createdAt;
      const timeB = b.timestamp || b.createdAt;
      return timeB.localeCompare(timeA);
    });
  }, [historyLogs, comments]);

  const getAvatarColor = (name: string) => {
    const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-amber-500', 'bg-rose-500'];
    const index = name.length % colors.length;
    return colors[index];
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">

      {/* Briefing Modal */}
      <CaseBriefingModal
        isOpen={showBriefing}
        onClose={() => setShowBriefing(false)}
        caseData={caseData}
        strategy={strategy}
        finance={finance}
        latestHistory={historyLogs.length > 0 ? historyLogs[historyLogs.length - 1] : undefined}
      />

      {/* 1. Description Section */}
      <div className="group relative">
        <div className="flex justify-between items-start mb-3">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-slate-500" /> 案情简述与诉求 (Description)
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => setShowBriefing(true)}
              className="flex items-center gap-1 px-3 py-1 text-xs bg-white border border-slate-200 rounded-md text-slate-600 hover:text-brand-600 hover:border-brand-300 transition-colors shadow-sm"
            >
              <Printer className="w-3 h-3" /> 生成签报 (Briefing)
            </button>
            <button
              onClick={handleOpenEditInfo}
              className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-brand-600 transition-colors"
            >
              <Edit3 className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="bg-slate-50 p-6 rounded-lg border border-slate-100 text-sm text-slate-700 leading-relaxed font-serif">
          {caseData.description
            ? caseData.description.split('\n').map((line, i) => <p key={i} className="mb-2 last:mb-0">{line}</p>)
            : <span className="text-slate-400 italic">暂无案情描述，请点击右上角编辑按钮补充。</span>}
        </div>
      </div>

      <hr className="border-slate-100" />

      {/* 2. Strategy Sandbox (WP-AI-02) */}
      <div>
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Target className="w-5 h-5 text-brand-600" /> 策略预演沙盘 (Strategy)
          </h3>
          {!isEditingStrategy && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleGenerateRecommendation}
                isLoading={recommendationStatus === 'loading'}
                disabled={recommendationStatus === 'loading'}
              >
                <Wand2 className="w-3 h-3 mr-1" /> 生成应对策略建议
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setIsEditingStrategy(true)}>
                <Edit3 className="w-3 h-3 mr-1" /> 手工修订
              </Button>
            </div>
          )}
        </div>

        {loadingStrat ? (
          <div className="py-4 text-slate-400 text-sm">加载策略数据...</div>
        ) : (
          <div className="space-y-4">
            {/* Current Strategy Card (always show if exists) */}
            {strategy && !isEditingStrategy && (
              <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm animate-in fade-in duration-200">
                <div className="flex items-center justify-between mb-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getStrategyColor(strategy.direction)}`}>
                    {strategy.direction}
                  </span>
                  <span className="text-xs text-slate-400">更新于: {strategy.updatedAt}</span>
                </div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="text-xs font-bold text-slate-500 uppercase">胜诉率预估</div>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden max-w-xs">
                    <div
                      className={`h-full ${strategy.winProbability > 50 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                      style={{ width: `${strategy.winProbability}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-slate-700">{strategy.winProbability}%</span>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{strategy.analysis}</p>
              </div>
            )}

            {/* Empty State (no strategy, not editing, idle) */}
            {!strategy && !isEditingStrategy && recommendationStatus === 'idle' && (
              <div className="text-center py-8 text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                <Wand2 className="w-8 h-8 mx-auto mb-3 text-slate-300" />
                <p className="mb-2">暂无策略记录</p>
                <p className="text-xs text-slate-400 mb-4">
                  点击"生成应对策略建议"，系统将自动汇聚案件上下文并输出可采纳草稿
                </p>
                <Button size="sm" onClick={handleGenerateRecommendation}>
                  <Sparkles className="w-3 h-3 mr-1" /> 生成应对策略建议
                </Button>
              </div>
            )}

            {/* Loading State */}
            {recommendationStatus === 'loading' && (
              <div className="bg-brand-50/50 border border-brand-100 rounded-lg p-6 text-center animate-in fade-in">
                <Loader2 className="w-6 h-6 animate-spin text-brand-600 mx-auto mb-3" />
                <p className="text-sm text-brand-800 font-medium">正在汇聚案件信息、卷宗摘要和类案参考...</p>
                <p className="text-xs text-brand-600 mt-1">请稍候，系统正在生成策略建议</p>
              </div>
            )}

            {/* Error State */}
            {recommendationStatus === 'error' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-5 animate-in fade-in">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldAlert className="w-4 h-4 text-red-600" />
                  <span className="text-sm font-bold text-red-800">生成失败</span>
                </div>
                <p className="text-xs text-red-600 mb-3">{recommendationError || '未知错误，请稍后重试'}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={handleGenerateRecommendation}>
                    重试生成
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleDismissRecommendation}>
                    关闭
                  </Button>
                </div>
              </div>
            )}

            {/* Recommendation Panel */}
            {recommendation && recommendationStatus === 'success' && (
              <RecommendationPanel
                recommendation={recommendation}
                onAdopt={handleAdoptRecommendation}
                onDismiss={handleDismissRecommendation}
                onCiteCase={handleCiteCase}
                onOpenCaseDetail={handleOpenSimilarCaseDetail}
              />
            )}

            {/* Similar Case Detail Modal */}
            <SimilarCaseDetailModal
              caseItem={selectedSimilarCase}
              isOpen={!!selectedSimilarCase}
              onClose={() => setSelectedSimilarCase(null)}
              onCite={handleCiteCase}
            />

            {/* Strategy Edit Form */}
            {isEditingStrategy && (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] animate-in fade-in duration-200">
                <div className="flex-1 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">主导策略</label>
                      <select
                        className="w-full text-sm border border-slate-300 rounded px-2 py-2 outline-none focus:ring-2 focus:ring-brand-500"
                        value={strategyForm.direction}
                        onChange={e => setStrategyForm({ ...strategyForm, direction: e.target.value as CaseStrategy['direction'] })}
                      >
                        <option value="积极应诉">积极应诉</option>
                        <option value="寻求和解">寻求和解</option>
                        <option value="提起反诉">提起反诉</option>
                        <option value="管辖权异议">管辖权异议</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">预估胜诉率 ({strategyForm.winProbability}%)</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer mt-2"
                        value={strategyForm.winProbability}
                        onChange={e => setStrategyForm({ ...strategyForm, winProbability: parseInt(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">策略分析与依据</label>
                    <textarea
                      className="w-full text-sm border border-slate-300 rounded px-3 py-2 h-48 focus:ring-2 focus:ring-brand-500 outline-none leading-relaxed"
                      value={strategyForm.analysis}
                      onChange={e => setStrategyForm({ ...strategyForm, analysis: e.target.value })}
                      placeholder="请输入选择该策略的法律依据、事实依据及商业考量..."
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="ghost" size="sm" onClick={() => setIsEditingStrategy(false)}>
                      取消
                    </Button>
                    <Button size="sm" onClick={handleSaveStrategy}>
                      <Save className="w-3 h-3 mr-1" /> 保存策略
                    </Button>
                  </div>
                </div>

                {/* Inline Similar Cases Panel (edit mode) */}
                <div className="flex h-[420px] flex-col overflow-hidden rounded-lg border border-brand-100 bg-brand-50/50">
                  <div className="flex items-center justify-between border-b border-brand-100 bg-brand-100/50 px-3 py-2">
                    <h4 className="flex items-center gap-1 text-xs font-bold text-brand-800">
                      <BookOpen className="h-3 w-3" /> 参考类案
                    </h4>
                    <span className="text-[10px] text-brand-600">
                      {recommendation?.similarCases.length ?? 0} 条
                    </span>
                  </div>
                  <div className="flex-1 space-y-2 overflow-y-auto p-3 custom-scrollbar">
                    {recommendation?.similarCases.length ? (
                      recommendation.similarCases.map((c, idx) => (
                        <SimilarCaseCard
                          key={c.caseId || `${c.caseName}-${idx}`}
                          caseItem={c}
                          compact
                          onCiteCase={handleCiteCase}
                          onOpenCaseDetail={handleOpenSimilarCaseDetail}
                        />
                      ))
                    ) : (
                      <p className="py-4 text-center text-xs text-slate-400">暂无高相似度判例</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <hr className="border-slate-100" />

      {/* 3. Activity & Collaboration (Rich Comments) */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Activity className="w-5 h-5 text-slate-500" /> 协作动态 (Activity)
          </h3>

          <div className="flex bg-slate-100 p-1 rounded-lg">
            {[
              { id: 'ALL', label: '全部' },
              { id: 'COMMENTS', label: '仅评论' },
              { id: 'HISTORY', label: '历史记录' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActivityTab(tab.id as any)}
                className={`text-xs px-3 py-1 rounded-md transition-all font-medium ${
                  activityTab === tab.id ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          {/* Comment Input Box */}
          <div className="flex gap-3 items-start">
            <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center shrink-0 text-white font-bold text-xs">
              我
            </div>
            <div className="flex-1 border border-slate-200 rounded-xl bg-white focus-within:ring-2 focus-within:ring-brand-100 focus-within:border-brand-400 transition-all shadow-sm overflow-hidden">
              <textarea
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                placeholder="添加评论、@同事、粘贴截图..."
                className="w-full px-4 py-3 text-sm outline-none resize-none min-h-[80px]"
              />
              <div className="bg-slate-50 px-3 py-2 flex justify-between items-center border-t border-slate-100">
                <div className="flex gap-1">
                  <button className="p-1.5 text-slate-400 hover:bg-slate-200 rounded" title="Bold"><Bold className="w-4 h-4" /></button>
                  <button className="p-1.5 text-slate-400 hover:bg-slate-200 rounded" title="Italic"><Italic className="w-4 h-4" /></button>
                  <div className="w-px h-4 bg-slate-300 mx-1 self-center"></div>
                  <button className="p-1.5 text-slate-400 hover:bg-slate-200 rounded" title="Mention"><AtSign className="w-4 h-4" /></button>
                  <button className="p-1.5 text-slate-400 hover:bg-slate-200 rounded" title="Attach"><Paperclip className="w-4 h-4" /></button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 hidden sm:inline">Press ⌘+Enter to send</span>
                  <Button size="sm" onClick={handleSendComment} isLoading={isSendingComment} disabled={!newComment.trim()} className="h-8">
                    发送
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Activity List */}
          <div className="relative border-l-2 border-slate-200 ml-4 pl-6 space-y-6 pb-6">
            {loadingActivity ? <div className="text-sm text-slate-400">加载动态...</div> :
              combinedActivity.length === 0 ? <div className="text-sm text-slate-400 italic">暂无活动记录</div> :
                combinedActivity
                  .filter((item: any) => {
                    if (activityTab === 'COMMENTS') return item.type === 'COMMENT';
                    if (activityTab === 'HISTORY') return item.type === 'LOG';
                    return true;
                  })
                  .map((item: any) => {
                    const isComment = item.type === 'COMMENT';
                    return (
                      <div key={item.id} className="relative group animate-in fade-in slide-in-from-bottom-1">
                        {/* Timeline Dot */}
                        <div className={`absolute -left-[33px] top-0 w-6 h-6 rounded-full border-4 border-white flex items-center justify-center shadow-sm z-10 ${
                          isComment ? 'bg-brand-500 text-white' : 'bg-slate-200 text-slate-500'
                        }`}>
                          {isComment ? <MessageSquare className="w-3 h-3" /> : <History className="w-3 h-3" />}
                        </div>

                        {isComment ? (
                          /* Comment Card */
                          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm hover:border-brand-200 transition-colors">
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-2">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white font-bold ${getAvatarColor(item.userName)}`}>
                                  {item.userName.charAt(0)}
                                </div>
                                <span className="font-bold text-sm text-slate-800">{item.userName}</span>
                                <span className="text-xs text-slate-500 bg-slate-100 px-1.5 rounded">{item.userRole}</span>
                                {!item.isInternal && <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-1.5 rounded flex items-center gap-0.5"><Globe className="w-2.5 h-2.5" /> 外部</span>}
                              </div>
                              <span className="text-xs text-slate-400">{item.createdAt}</span>
                            </div>
                            <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap pl-8">
                              {item.content}
                            </div>
                            <div className="flex gap-3 mt-3 pt-2 border-t border-slate-50 pl-8">
                              <button className="text-xs text-slate-500 hover:text-brand-600 font-medium">回复</button>
                              <button className="text-xs text-slate-500 hover:text-brand-600">👍 点赞</button>
                            </div>
                          </div>
                        ) : (
                          /* System Log Item (Compact) */
                          <div className="py-0.5">
                            <div className="flex justify-between items-center text-xs mb-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-600">{item.operator}</span>
                                <span className="text-slate-500">{item.action}</span>
                              </div>
                              <span className="text-slate-400 font-mono">{item.timestamp}</span>
                            </div>
                            <p className="text-xs text-slate-500 bg-slate-50 px-2 py-1.5 rounded border border-slate-100 inline-block">
                              {item.details}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })
            }
          </div>
        </div>
      </div>

      {/* --- EDIT INFO MODAL --- */}
      {isEditingInfo && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-xl shadow-xl w-[600px] max-h-[90vh] overflow-y-auto">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">编辑案件档案</h3>
              <button onClick={() => setIsEditingInfo(false)}><X className="w-5 h-5 text-slate-400 hover:text-slate-600" /></button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">案件标题 <span className="text-slate-400 font-normal">（只读，通过立案流程修改）</span></label>
                <input
                  type="text"
                  disabled
                  className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-slate-50 text-slate-500 cursor-not-allowed"
                  value={infoForm.title}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">案情简述 (Case Brief)</label>
                <textarea
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm h-32 focus:ring-2 focus:ring-brand-500 outline-none"
                  value={infoForm.description}
                  onChange={e => setInfoForm({ ...infoForm, description: e.target.value })}
                  placeholder="请描述纠纷起因、对方诉求、争议焦点等..."
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setIsEditingInfo(false)}>取消</Button>
              <Button onClick={handleSaveInfo}>保存并记录日志</Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default CaseOverview;
