
import React, { useEffect, useState } from 'react';
import { Case } from '../../../types';
import {
  CounselItem,
  listCounsel,
  assignInternalCounsel,
  assignExternalCounsel,
  unassignCounsel,
} from '../../../services/case';
import {
  User, Star, CheckCircle, FileText, Plus, X, Briefcase,
  Shield, ShieldCheck, Building2, Phone, Mail, AlertCircle,
} from 'lucide-react';
import Button from '../../../components/ui/Button';

interface ExternalCounselTabProps {
  caseData: Case;
}

// ─── Counsel card (一行展示) ─────────────────────────────────────────────────

interface CounselCardProps {
  counsel: CounselItem;
  onUnassign: (c: CounselItem) => void;
}

const statusStyles: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  TERMINATED: 'bg-slate-100 text-slate-500 border-slate-200',
  COMPLETED: 'bg-blue-50 text-blue-700 border-blue-200',
};

const CounselCard: React.FC<CounselCardProps> = ({ counsel, onUnassign }) => (
  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
          {counsel.counselType === 'INTERNAL'
            ? <Shield className="w-5 h-5 text-slate-500" />
            : <Building2 className="w-5 h-5 text-slate-500" />}
        </div>
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-bold text-slate-900">{counsel.lawyerName}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${statusStyles[counsel.status] ?? ''}`}>
              {counsel.statusName}
            </span>
          </div>
          {counsel.lawFirmName && (
            <p className="text-xs text-slate-500 mb-1">{counsel.lawFirmName}</p>
          )}
          <div className="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
            <span className="bg-slate-100 px-1.5 py-0.5 rounded">{counsel.roleInCaseName}</span>
            <span className="bg-slate-100 px-1.5 py-0.5 rounded">{counsel.counselTypeName}</span>
            {counsel.contactPhone && (
              <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{counsel.contactPhone}</span>
            )}
            {counsel.contactEmail && (
              <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{counsel.contactEmail}</span>
            )}
          </div>
          {counsel.performanceRating != null && (
            <div className="flex items-center gap-1 mt-1.5 text-amber-500 text-xs">
              <Star className="w-3 h-3 fill-current" />
              <span className="font-medium">{counsel.performanceRating} / 5</span>
              {counsel.evaluationComment && (
                <span className="text-slate-400 ml-1">· {counsel.evaluationComment}</span>
              )}
            </div>
          )}
        </div>
      </div>
      {counsel.status === 'ACTIVE' && (
        <button
          onClick={() => onUnassign(counsel)}
          className="shrink-0 text-xs text-slate-500 border border-slate-200 hover:border-red-300 hover:text-red-600 px-3 py-1.5 rounded-lg transition-colors"
        >
          解聘并评价
        </button>
      )}
    </div>
  </div>
);

// ─── Unassign modal (inline) ─────────────────────────────────────────────────

interface UnassignFormProps {
  counsel: CounselItem;
  onConfirm: (form: { reason: string; rating: number; comment: string }) => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
}

const UnassignForm: React.FC<UnassignFormProps> = ({ counsel, onConfirm, onCancel, submitting }) => {
  const [reason, setReason] = useState('');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 animate-in slide-in-from-top-2">
      <h4 className="font-bold text-amber-900 mb-4 flex items-center gap-2">
        <Star className="w-4 h-4" /> 解聘并评价 · {counsel.lawyerName}
      </h4>
      <p className="text-xs text-amber-700 mb-4 bg-amber-100 rounded-lg p-2 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        提交后该律师代理关系将终止（状态变为"已解聘"）。评分将留存至律所档案供未来参考。
      </p>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">解聘原因（可选）</label>
          <input
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            placeholder="如：案件已结案、服务到期..."
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">综合评分（1–5 分，可选）</label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(s => (
              <button
                key={s}
                onClick={() => setRating(s)}
                className={`p-1.5 rounded-lg transition-all ${rating >= s ? 'text-amber-400 bg-amber-100' : 'text-slate-300 hover:text-slate-400'}`}
              >
                <Star className={`w-5 h-5 ${rating >= s ? 'fill-current' : ''}`} />
              </button>
            ))}
            {rating > 0 && (
              <button onClick={() => setRating(0)} className="text-xs text-slate-400 hover:text-slate-600 ml-1">清除</button>
            )}
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">评价内容（可选）</label>
          <textarea
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400 h-16 resize-none"
            placeholder="专业能力、响应速度、案件结果..."
            value={comment}
            onChange={e => setComment(e.target.value)}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>取消</Button>
        <Button
          size="sm"
          onClick={() => onConfirm({ reason, rating, comment })}
          disabled={submitting}
          className="bg-red-600 hover:bg-red-700 border-transparent text-white"
        >
          {submitting ? '提交中...' : '确认解聘'}
        </Button>
      </div>
    </div>
  );
};

// ─── Assign form ─────────────────────────────────────────────────────────────

interface AssignFormProps {
  caseId: string;
  mode: 'INTERNAL' | 'EXTERNAL';
  onSuccess: (item: CounselItem) => void;
  onCancel: () => void;
}

const AssignForm: React.FC<AssignFormProps> = ({ caseId, mode, onSuccess, onCancel }) => {
  const [userId, setUserId] = useState('');
  const [externalLawyerId, setExternalLawyerId] = useState('');
  const [roleInCase, setRoleInCase] = useState<'LEAD' | 'CO_COUNSEL'>('LEAD');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (mode === 'INTERNAL' && !userId.trim()) return;
    if (mode === 'EXTERNAL' && !externalLawyerId.trim()) return;
    setSubmitting(true);
    try {
      let created: CounselItem;
      if (mode === 'INTERNAL') {
        created = await assignInternalCounsel({
          caseId, userId: userId.trim(), roleInCase,
          contactPhone: contactPhone || undefined,
          contactEmail: contactEmail || undefined,
        });
      } else {
        created = await assignExternalCounsel({
          caseId, externalLawyerId: externalLawyerId.trim(), roleInCase,
          contactPhone: contactPhone || undefined,
          contactEmail: contactEmail || undefined,
        });
      }
      onSuccess(created);
    } catch {
      // apiClient interceptor already toast.error
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-slate-50 border border-indigo-100 rounded-xl p-5 animate-in slide-in-from-top-2">
      <h4 className="font-bold text-sm text-slate-700 mb-4">
        {mode === 'INTERNAL' ? '指派内部律师' : '指派外部律师'}
      </h4>
      <div className="grid grid-cols-2 gap-4 mb-4">
        {mode === 'INTERNAL' ? (
          <div className="col-span-2">
            <label className="block text-xs font-bold text-slate-500 mb-1">用户 ID（sys_users.id）</label>
            <input
              className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
              placeholder="粘贴系统用户 ID"
              value={userId}
              onChange={e => setUserId(e.target.value)}
            />
          </div>
        ) : (
          <div className="col-span-2">
            <label className="block text-xs font-bold text-slate-500 mb-1">外部律师 ID（external_lawyers.id）</label>
            <input
              className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
              placeholder="粘贴律师库中的律师 ID"
              value={externalLawyerId}
              onChange={e => setExternalLawyerId(e.target.value)}
            />
            <p className="text-[10px] text-slate-400 mt-1">律所 ID 将由系统从律师档案自动关联。律所搜索功能在「律所资源库」模块中提供。</p>
          </div>
        )}
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">代理角色</label>
          <select
            className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
            value={roleInCase}
            onChange={e => setRoleInCase(e.target.value as 'LEAD' | 'CO_COUNSEL')}
          >
            <option value="LEAD">主办代理人</option>
            <option value="CO_COUNSEL">协办代理人</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">联系电话（可选）</label>
          <input
            className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
            placeholder="手机或座机"
            value={contactPhone}
            onChange={e => setContactPhone(e.target.value)}
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-bold text-slate-500 mb-1">联系邮箱（可选）</label>
          <input
            type="email"
            className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
            placeholder="email@example.com"
            value={contactEmail}
            onChange={e => setContactEmail(e.target.value)}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>取消</Button>
        <Button size="sm" onClick={handleSubmit} disabled={submitting}>
          {submitting ? '提交中...' : '确认指派'}
        </Button>
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const ExternalCounselTab: React.FC<ExternalCounselTabProps> = ({ caseData }) => {
  const [internalCounsels, setInternalCounsels] = useState<CounselItem[]>([]);
  const [externalCounsels, setExternalCounsels] = useState<CounselItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [assignMode, setAssignMode] = useState<'NONE' | 'INTERNAL' | 'EXTERNAL'>('NONE');
  const [unassignTarget, setUnassignTarget] = useState<CounselItem | null>(null);
  const [unassignSubmitting, setUnassignSubmitting] = useState(false);

  useEffect(() => {
    load();
  }, [caseData.id]);

  const load = async () => {
    setLoading(true);
    try {
      const { internalCounsels: intList, externalCounsels: extList } = await listCounsel(caseData.id);
      setInternalCounsels(intList);
      setExternalCounsels(extList);
    } catch {
      // apiClient interceptor already toast.error
    } finally {
      setLoading(false);
    }
  };

  const handleAssignSuccess = (item: CounselItem) => {
    if (item.counselType === 'INTERNAL') {
      setInternalCounsels(prev => [...prev, item]);
    } else {
      setExternalCounsels(prev => [...prev, item]);
    }
    setAssignMode('NONE');
  };

  const handleUnassignConfirm = async (form: { reason: string; rating: number; comment: string }) => {
    if (!unassignTarget) return;
    setUnassignSubmitting(true);
    try {
      await unassignCounsel({
        counselId: unassignTarget.id,
        reason: form.reason || undefined,
        performanceRating: form.rating > 0 ? form.rating : undefined,
        evaluationComment: form.comment || undefined,
      });
      const patch = (prev: CounselItem[]) =>
        prev.map(c => c.id === unassignTarget.id
          ? { ...c, status: 'TERMINATED' as const, statusName: '已解聘', performanceRating: form.rating || undefined, evaluationComment: form.comment || undefined }
          : c
        );
      setInternalCounsels(patch);
      setExternalCounsels(patch);
      setUnassignTarget(null);
    } catch {
      // apiClient interceptor already toast.error
    } finally {
      setUnassignSubmitting(false);
    }
  };

  if (loading) return <div className="p-10 text-center text-slate-400 text-sm">加载中...</div>;

  const allActive = [...internalCounsels, ...externalCounsels].filter(c => c.status === 'ACTIVE');
  const allInactive = [...internalCounsels, ...externalCounsels].filter(c => c.status !== 'ACTIVE');

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── 操作栏 ── */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-brand-600" /> 案件代理律师
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">管理本案内部法务及外聘律师代理关系</p>
        </div>
        {assignMode === 'NONE' && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setAssignMode('INTERNAL')}>
              <Shield className="w-4 h-4 mr-1" /> 指派内部律师
            </Button>
            <Button size="sm" onClick={() => setAssignMode('EXTERNAL')}>
              <Plus className="w-4 h-4 mr-1" /> 指派外部律师
            </Button>
          </div>
        )}
      </div>

      {/* ── 指派表单 ── */}
      {assignMode !== 'NONE' && (
        <AssignForm
          caseId={caseData.id}
          mode={assignMode}
          onSuccess={handleAssignSuccess}
          onCancel={() => setAssignMode('NONE')}
        />
      )}

      {/* ── 解聘表单 ── */}
      {unassignTarget && (
        <UnassignForm
          counsel={unassignTarget}
          onConfirm={handleUnassignConfirm}
          onCancel={() => setUnassignTarget(null)}
          submitting={unassignSubmitting}
        />
      )}

      {/* ── 代理中 ── */}
      {allActive.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-slate-600 mb-3 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-500" /> 代理中 ({allActive.length})
          </h4>
          <div className="space-y-3">
            {allActive.map(c => (
              <CounselCard key={c.id} counsel={c} onUnassign={setUnassignTarget} />
            ))}
          </div>
        </div>
      )}

      {/* ── 空状态 ── */}
      {allActive.length === 0 && assignMode === 'NONE' && (
        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
            <Briefcase className="w-8 h-8" />
          </div>
          <h3 className="font-bold text-slate-700 mb-2">暂无代理律师</h3>
          <p className="text-sm text-slate-500 mb-6">点击右上角按钮指派内部法务人员或外聘律师事务所</p>
        </div>
      )}

      {/* ── 历史记录 ── */}
      {allInactive.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-slate-500 mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" /> 历史代理记录 ({allInactive.length})
          </h4>
          <div className="space-y-3 opacity-70">
            {allInactive.map(c => (
              <CounselCard key={c.id} counsel={c} onUnassign={() => {}} />
            ))}
          </div>
        </div>
      )}

    </div>
  );
};

export default ExternalCounselTab;
