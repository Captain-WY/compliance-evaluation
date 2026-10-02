
import React, { useEffect, useState } from 'react';
import { Case } from '../../types';
import {
  CLOSURE_TYPE_LABELS,
  getClosingInfo,
  submitClosing,
  validateArchiving,
  submitArchiving,
  registerZhongben,
  setupZhongbenReminder,
  type ClosingInfo,
  type ArchivingValidation,
  type ZhongbenPlan,
} from '../../services/case';
import Button from '../../components/ui/Button';
import {
  ShieldCheck, CheckCircle2, XCircle, Archive, FileText, Wallet,
  Save, AlertTriangle, ChevronDown, ChevronUp, Star, Lightbulb,
  Mail, Gavel, Receipt,
} from 'lucide-react';

interface CaseClosingProps {
  caseData: Case;
  onSuccess: () => void;
  onCancel: () => void;
}

const today = () => new Date().toISOString().split('T')[0];

const CaseClosing: React.FC<CaseClosingProps> = ({ caseData, onSuccess, onCancel }) => {
  // ── 结案登记 (Section 1) ───────────────────────────────────────
  const [closingInfo, setClosingInfo] = useState<ClosingInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(true);

  const [closureType, setClosureType] = useState('JUDGMENT_WON');
  const [closureDate, setClosureDate] = useState(today());
  const [reviewSummary, setReviewSummary] = useState('');
  const [requiresRemediation, setRequiresRemediation] = useState(false);
  const [remediationDept, setRemediationDept] = useState('');
  const [remediationDetail, setRemediationDetail] = useState('');
  const [sendEmail, setSendEmail] = useState(true); // R14: UI-only, no BFF
  const [checklistAllFees, setChecklistAllFees] = useState(false);
  const [checklistDocs, setChecklistDocs] = useState(false);
  const [checklistPreservations, setChecklistPreservations] = useState(false);
  const [closingSubmitting, setClosingSubmitting] = useState(false);

  // ── 归档校验 (Section 2) ──────────────────────────────────────
  const [validation, setValidation] = useState<ArchivingValidation | null>(null);
  const [validating, setValidating] = useState(false);
  const [archiveNo, setArchiveNo] = useState('');
  const [archiveNote, setArchiveNote] = useState('');
  const [archiveSubmitting, setArchiveSubmitting] = useState(false);
  const [archived, setArchived] = useState(false);

  // ── 终本登记 (Section 3) ──────────────────────────────────────
  const [showZhongben, setShowZhongben] = useState(false);
  const [zhongbenPlan, setZhongbenPlan] = useState<ZhongbenPlan | null>(null);
  const [zbDate, setZbDate] = useState(today());
  const [zbAmount, setZbAmount] = useState('');
  const [zbRulingNo, setZbRulingNo] = useState('');
  const [zbReason, setZbReason] = useState('');
  const [zbSubmitting, setZbSubmitting] = useState(false);
  const [reminderMonths, setReminderMonths] = useState('6');
  const [reminderAssignee, setReminderAssignee] = useState('');
  const [reminderNote, setReminderNote] = useState('');
  const [reminderSubmitting, setReminderSubmitting] = useState(false);
  const [reminderSuccess, setReminderSuccess] = useState<string | null>(null);

  // ── 律师评分 (D72 残留: UI保留, 无BFF) ───────────────────────
  const [rating, setRating] = useState(5);

  // ── 加载结案信息 ──────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setInfoLoading(true);
      try {
        const info = await getClosingInfo(caseData.id);
        setClosingInfo(info);
        setArchived(info.caseStatus === 'ARCHIVED');
        if (info.closure) {
          setClosureType(info.closure.closureType || 'JUDGMENT_WON');
          setClosureDate(info.closure.closureDate || today());
          setReviewSummary(info.closure.reviewSummary || '');
          setImprovementPlanToForm(info.closure.improvementPlan);
          const cd = info.closure.checklistData ?? {};
          setChecklistAllFees(cd.all_fees_paid ?? false);
          setChecklistDocs(cd.documents_archived ?? false);
          setChecklistPreservations(cd.preservations_released ?? false);
        }
      } catch {
        // apiClient 拦截器已 toast.error
      } finally {
        setInfoLoading(false);
      }
    };
    load();
  }, [caseData.id]);

  const setImprovementPlanToForm = (plan: string | null) => {
    if (!plan) return;
    const match = plan.match(/^\[整改部门: (.+?)\] (.+)$/s);
    if (match) {
      setRequiresRemediation(true);
      setRemediationDept(match[1]);
      setRemediationDetail(match[2]);
    } else {
      setRemediationDetail(plan);
    }
  };

  const buildImprovementPlan = (): string | null => {
    if (!requiresRemediation || !remediationDetail.trim()) return null;
    if (remediationDept.trim()) {
      return `[整改部门: ${remediationDept.trim()}] ${remediationDetail.trim()}`;
    }
    return remediationDetail.trim();
  };

  // ── 提交结案登记 ──────────────────────────────────────────────
  const handleSubmitClosing = async () => {
    if (!reviewSummary.trim()) return;
    setClosingSubmitting(true);
    try {
      await submitClosing({
        caseId: caseData.id,
        closureDate,
        closureType,
        reviewSummary: reviewSummary.trim(),
        improvementPlan: buildImprovementPlan(),
        checklistData: {
          all_fees_paid: checklistAllFees,
          documents_archived: checklistDocs,
          preservations_released: checklistPreservations,
        },
        status: 'DRAFT',
      });
      const info = await getClosingInfo(caseData.id);
      setClosingInfo(info);
      onSuccess();
    } catch {
      // apiClient 拦截器已 toast.error
    } finally {
      setClosingSubmitting(false);
    }
  };

  // ── 归档校验 ──────────────────────────────────────────────────
  const handleValidate = async () => {
    setValidating(true);
    try {
      const result = await validateArchiving(caseData.id);
      setValidation(result);
    } catch {
      // apiClient 拦截器已 toast.error
    } finally {
      setValidating(false);
    }
  };

  const handleSubmitArchive = async () => {
    if (!archiveNo.trim()) return;
    setArchiveSubmitting(true);
    try {
      await submitArchiving({
        caseId: caseData.id,
        archiveNo: archiveNo.trim(),
        archiveNote: archiveNote.trim() || null,
      });
      setArchived(true);
    } catch {
      // apiClient 拦截器已 toast.error
    } finally {
      setArchiveSubmitting(false);
    }
  };

  // ── 终本登记 ──────────────────────────────────────────────────
  const handleRegisterZhongben = async () => {
    if (!zbAmount.trim()) return;
    setZbSubmitting(true);
    try {
      const res = await registerZhongben({
        caseId: caseData.id,
        registerDate: zbDate,
        nonExecutedAmount: zbAmount,
        rulingNo: zbRulingNo.trim() || null,
        reason: zbReason.trim() || null,
      });
      setZhongbenPlan(res.zhongbenPlan);
    } catch {
      // apiClient 拦截器已 toast.error
    } finally {
      setZbSubmitting(false);
    }
  };

  const handleSetupReminder = async () => {
    if (!reminderAssignee.trim() || !reminderMonths) return;
    setReminderSubmitting(true);
    setReminderSuccess(null);
    try {
      const res = await setupZhongbenReminder({
        caseId: caseData.id,
        intervalMonths: Number(reminderMonths),
        assigneeId: reminderAssignee.trim(),
        note: reminderNote.trim() || null,
      });
      setReminderSuccess(`提醒已设置，首次触发日期：${res.nextTriggerDate || '—'}`);
      // 更新本地提醒计数（无读端点，追加一条占位记录）
      setZhongbenPlan(prev => prev ? {
        ...prev,
        reminders: [...prev.reminders, {
          reminderId: res.reminderId,
          intervalMonths: Number(reminderMonths),
          assigneeId: reminderAssignee.trim(),
          assigneeName: null,
          nextTriggerDate: res.nextTriggerDate || null,
          note: reminderNote.trim() || null,
        }],
      } : prev);
    } catch {
      // apiClient 拦截器已 toast.error
    } finally {
      setReminderSubmitting(false);
    }
  };

  if (infoLoading) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-8 text-center text-slate-400 text-sm">
        加载结案信息...
      </div>
    );
  }

  const isAlreadyRegistered = closingInfo?.registered ?? false;
  const closureStatus = closingInfo?.closure?.status ?? '';

  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
      {/* Header */}
      <div className="bg-slate-900 px-6 py-4 flex justify-between items-center text-white">
        <h2 className="text-lg font-bold">案件结案与归档</h2>
        <div className="flex items-center gap-3 text-xs">
          {closureStatus && (
            <span className={`px-2 py-0.5 rounded font-medium ${
              closureStatus === 'APPROVED' ? 'bg-emerald-600' :
              closureStatus === 'REVIEWING' ? 'bg-amber-500' : 'bg-slate-600'
            }`}>
              {closingInfo?.closure?.statusName ?? closureStatus}
            </span>
          )}
          {archived && <span className="px-2 py-0.5 rounded bg-purple-600 font-medium">已归档</span>}
        </div>
      </div>

      <div className="p-6 space-y-8">

        {/* ──────────────── Section 1: 结案登记 ──────────────── */}
        <section>
          <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4 text-base">
            <Gavel className="w-5 h-5 text-brand-600" />
            结案登记
            {isAlreadyRegistered && (
              <span className="ml-2 text-xs font-normal text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">已登记</span>
            )}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">结案方式</label>
              <select
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                value={closureType}
                onChange={e => setClosureType(e.target.value)}
                disabled={archived}
              >
                {Object.entries(CLOSURE_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">结案日期</label>
              <input
                type="date"
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                value={closureDate}
                onChange={e => setClosureDate(e.target.value)}
                disabled={archived}
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-bold text-slate-500 mb-1">结案总结 <span className="text-red-500">*</span></label>
            <textarea
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm h-24 focus:ring-2 focus:ring-brand-500 outline-none resize-none"
              placeholder="简要记录本案经过、核心启示..."
              value={reviewSummary}
              onChange={e => setReviewSummary(e.target.value)}
              disabled={archived}
            />
          </div>

          {/* 自查清单 */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4">
            <h4 className="text-xs font-bold text-slate-600 mb-3 flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-blue-500" /> 结案自查清单
            </h4>
            <div className="space-y-2">
              {[
                { id: 'fees', label: '律师费发票已全额回收并移交财务', checked: checklistAllFees, set: setChecklistAllFees },
                { id: 'docs', label: '判决书/调解书原件已入库归档', checked: checklistDocs, set: setChecklistDocs },
                { id: 'pres', label: '诉讼费退费已办理完毕（或不涉及）', checked: checklistPreservations, set: setChecklistPreservations },
              ].map(item => (
                <label key={item.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={e => item.set(e.target.checked)}
                    disabled={archived}
                    className="w-4 h-4 text-brand-600 rounded focus:ring-brand-500"
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </div>

          {/* 业务整改 */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4">
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <Lightbulb className="w-4 h-4 text-orange-500" /> 业务整改建议
              </h4>
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requiresRemediation}
                  onChange={e => setRequiresRemediation(e.target.checked)}
                  disabled={archived}
                  className="w-3.5 h-3.5 text-brand-600 rounded"
                />
                需要整改
              </label>
            </div>
            {requiresRemediation ? (
              <div className="space-y-2">
                <input
                  type="text"
                  className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:ring-1 focus:ring-brand-500 outline-none"
                  placeholder="责任部门（自由填写）"
                  value={remediationDept}
                  onChange={e => setRemediationDept(e.target.value)}
                  disabled={archived}
                />
                <textarea
                  className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm h-16 focus:ring-1 focus:ring-brand-500 outline-none resize-none"
                  placeholder="具体整改建议..."
                  value={remediationDetail}
                  onChange={e => setRemediationDetail(e.target.value)}
                  disabled={archived}
                />
                {/* R14: 邮件发送为 UI 保留项，暂无 BFF，不实际发送 */}
                <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer bg-slate-50 p-2 rounded">
                  <input
                    type="checkbox"
                    checked={sendEmail}
                    onChange={e => setSendEmail(e.target.checked)}
                    disabled={archived}
                    className="w-3.5 h-3.5"
                  />
                  <Mail className="w-3 h-3" />
                  同步发送整改通知（功能待接入，暂存档）
                </label>
              </div>
            ) : (
              <p className="text-xs text-slate-400">本案无业务整改事项</p>
            )}
          </div>

          {/* 律师评分 — D72 残留: UI 保留，无 BFF 对应端点 */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4">
            <h4 className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-1.5">
              <Star className="w-4 h-4 text-slate-400" /> 外部律师评分
              <span className="text-slate-400 font-normal">（评分记录待接入，暂不提交）</span>
            </h4>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(s => (
                <button key={s} onClick={() => !archived && setRating(s)} type="button">
                  <Star className={`w-5 h-5 transition-colors ${s <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
                </button>
              ))}
            </div>
          </div>

          {!archived && (
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button variant="outline" onClick={onCancel}>取消</Button>
              <Button
                onClick={handleSubmitClosing}
                isLoading={closingSubmitting}
                disabled={!reviewSummary.trim()}
              >
                <Save className="w-4 h-4 mr-1" />
                {isAlreadyRegistered ? '更新结案登记' : '提交结案登记'}
              </Button>
            </div>
          )}
        </section>

        {/* ──────────────── Section 2: 归档校验 ──────────────── */}
        <section className="border-t border-slate-200 pt-6">
          <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4 text-base">
            <ShieldCheck className="w-5 h-5 text-brand-600" />
            归档校验
            {archived && <span className="ml-2 text-xs font-normal text-purple-600 bg-purple-50 px-2 py-0.5 rounded">已归档</span>}
          </h3>

          {!validation && !archived && (
            <Button variant="outline" onClick={handleValidate} isLoading={validating}>
              运行 6 项归档规则检查
            </Button>
          )}

          {validation && (
            <div className="mb-4 space-y-2">
              <div className={`flex items-center gap-2 text-sm font-medium px-3 py-2 rounded ${
                validation.canArchive ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              }`}>
                {validation.canArchive
                  ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                  : <AlertTriangle className="w-4 h-4 shrink-0" />}
                {validation.passedCount}/{validation.totalCount} 项通过
                {validation.canArchive ? '，可提交归档' : '，请先解决未通过项'}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {validation.checks.map(c => (
                  <div key={c.ruleId} className={`flex items-start gap-2 p-3 rounded border text-xs ${
                    c.passed ? 'bg-white border-emerald-100' : 'bg-red-50 border-red-200'
                  }`}>
                    {c.passed
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      : <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />}
                    <div>
                      <p className="font-medium text-slate-700">{c.name}</p>
                      <p className="text-slate-500 mt-0.5">{c.message}</p>
                    </div>
                  </div>
                ))}
              </div>
              {!archived && (
                <Button variant="outline" onClick={handleValidate} isLoading={validating} className="mt-2">
                  重新检查
                </Button>
              )}
            </div>
          )}

          {validation?.canArchive && !archived && (
            <div className="mt-4 border-t border-slate-100 pt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">
                  归档号 <span className="text-red-500">*</span>
                  <span className="font-normal text-slate-400 ml-1">（租户内唯一）</span>
                </label>
                <div className="flex items-center gap-2">
                  <Archive className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    className="flex-1 border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                    placeholder="例如：2026-A-05"
                    value={archiveNo}
                    onChange={e => setArchiveNo(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">归档备注</label>
                <input
                  type="text"
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-brand-500 outline-none"
                  placeholder="可选备注..."
                  value={archiveNote}
                  onChange={e => setArchiveNote(e.target.value)}
                />
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={handleSubmitArchive}
                  isLoading={archiveSubmitting}
                  disabled={!archiveNo.trim()}
                >
                  <Archive className="w-4 h-4 mr-1" />
                  提交归档（触发只读锁）
                </Button>
              </div>
            </div>
          )}

          {archived && (
            <div className="flex items-center gap-2 text-sm text-purple-700 bg-purple-50 border border-purple-200 rounded-lg p-3">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              案件已归档，所有写操作已锁定。
            </div>
          )}
        </section>

        {/* ──────────────── Section 3: 终本登记 ──────────────── */}
        <section className="border-t border-slate-200 pt-6">
          <button
            type="button"
            className="w-full flex justify-between items-center text-left"
            onClick={() => setShowZhongben(v => !v)}
          >
            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
              <Wallet className="w-5 h-5 text-amber-600" />
              终本登记
              <span className="text-xs font-normal text-slate-400 ml-1">（执行终结案件适用）</span>
              {zhongbenPlan?.registered && (
                <span className="ml-2 text-xs font-normal text-amber-700 bg-amber-50 px-2 py-0.5 rounded">已登记</span>
              )}
            </h3>
            {showZhongben ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>

          {showZhongben && (
            <div className="mt-4 space-y-4">
              {zhongbenPlan?.registered ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                  <p className="font-medium mb-1">已完成终本登记</p>
                  <p>登记日期：{zhongbenPlan.registerDate ?? '—'}</p>
                  <p>未执行金额：{zhongbenPlan.nonExecutedAmount ?? '—'} {zhongbenPlan.currency ?? ''}</p>
                  {zhongbenPlan.rulingNo && <p>裁定书编号：{zhongbenPlan.rulingNo}</p>}
                  <p className="mt-1 text-xs text-amber-600">
                    已设定提醒：{zhongbenPlan.reminders.length} 条
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">终本日期</label>
                    <input type="date" className="w-full border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-brand-500"
                      value={zbDate} onChange={e => setZbDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">未执行金额（元）<span className="text-red-500">*</span></label>
                    <input type="number" min="0" className="w-full border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-brand-500"
                      placeholder="0.00" value={zbAmount} onChange={e => setZbAmount(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">裁定书编号</label>
                    <input type="text" className="w-full border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-brand-500"
                      placeholder="可选" value={zbRulingNo} onChange={e => setZbRulingNo(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">终本原因</label>
                    <input type="text" className="w-full border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-brand-500"
                      placeholder="可选" value={zbReason} onChange={e => setZbReason(e.target.value)} />
                  </div>
                </div>
              )}

              {!zhongbenPlan?.registered && (
                <div className="flex justify-end">
                  <Button onClick={handleRegisterZhongben} isLoading={zbSubmitting} disabled={!zbAmount.trim()}>
                    提交终本登记
                  </Button>
                </div>
              )}

              {/* 周期复查提醒 */}
              {zhongbenPlan?.registered && (
                <div className="border-t border-slate-100 pt-4">
                  <h4 className="text-xs font-bold text-slate-600 mb-3">设置周期复查提醒</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">复查周期（月）</label>
                      <input type="number" min="1" max="120" className="w-full border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-brand-500"
                        value={reminderMonths} onChange={e => setReminderMonths(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">负责人 ID <span className="text-red-500">*</span></label>
                      <input type="text" className="w-full border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-brand-500"
                        placeholder="sys_users.id" value={reminderAssignee} onChange={e => setReminderAssignee(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">备注</label>
                      <input type="text" className="w-full border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-brand-500"
                        placeholder="可选" value={reminderNote} onChange={e => setReminderNote(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    {reminderSuccess && (
                      <span className="text-xs text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> {reminderSuccess}
                      </span>
                    )}
                    <Button onClick={handleSetupReminder} isLoading={reminderSubmitting} disabled={!reminderAssignee.trim()} className="ml-auto">
                      <FileText className="w-4 h-4 mr-1" /> 设置提醒
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

      </div>
    </div>
  );
};

export default CaseClosing;
