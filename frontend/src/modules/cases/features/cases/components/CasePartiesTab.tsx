import React, { useState, useEffect, useCallback } from 'react';
import { CaseParty, ConflictWarning } from '../../../types';
import { listParties, addParty, updateParty, removeParty } from '../../../services/case';
import Button from '../../../components/ui/Button';
import {
  Plus, Pencil, Trash2, X, AlertTriangle, AlertCircle, Info,
  ChevronDown, ChevronUp, Building2, User, Scale, Phone, MapPin, FileText,
} from 'lucide-react';

// ─── 常量 ─────────────────────────────────────────────────────────────────────

const PARTY_TYPE_OPTIONS = [
  { value: 'PLAINTIFF', label: '原告' },
  { value: 'DEFENDANT', label: '被告' },
  { value: 'THIRD_PARTY', label: '第三人' },
  { value: 'INTERESTED_PARTY', label: '利害关系人' },
];

const IDENTITY_TYPE_OPTIONS = [
  { value: 'LEGAL_ENTITY', label: '法人/组织' },
  { value: 'INDIVIDUAL', label: '自然人' },
];

const CONFLICT_STYLE: Record<string, { bg: string; border: string; icon: React.ReactNode; label: string }> = {
  BLACKLIST: { bg: 'bg-red-50', border: 'border-red-300', icon: <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />, label: '黑名单' },
  ONGOING:   { bg: 'bg-amber-50', border: 'border-amber-300', icon: <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />, label: '在办冲突' },
  HISTORY:   { bg: 'bg-blue-50', border: 'border-blue-200', icon: <Info className="w-4 h-4 text-blue-500 shrink-0" />, label: '历史关联' },
};

// ─── 类型 ─────────────────────────────────────────────────────────────────────

interface PartyFormData {
  partyType: string;
  isOurSide: boolean;
  partyName: string;
  identityType: string;
  identityNumber: string;
  legalRepresentative: string;
  contactNumber: string;
  serviceAddress: string;
  claimAmount: string;
  claimDetails: string;
  agentName: string;
  agentLawFirm: string;
  agentContact: string;
}

const EMPTY_FORM: PartyFormData = {
  partyType: 'PLAINTIFF',
  isOurSide: false,
  partyName: '',
  identityType: 'LEGAL_ENTITY',
  identityNumber: '',
  legalRepresentative: '',
  contactNumber: '',
  serviceAddress: '',
  claimAmount: '',
  claimDetails: '',
  agentName: '',
  agentLawFirm: '',
  agentContact: '',
};

interface CasePartiesTabProps {
  caseId: string;
  canEdit?: boolean;
}

// ─── 子组件：冲突预警列表 ──────────────────────────────────────────────────────

function ConflictWarnings({ warnings }: { warnings: ConflictWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="space-y-2 mb-4">
      {warnings.map((w, i) => {
        const style = CONFLICT_STYLE[w.type] || CONFLICT_STYLE.HISTORY;
        return (
          <div key={i} className={`flex items-start gap-2 px-3 py-2.5 rounded-lg border ${style.bg} ${style.border}`}>
            {style.icon}
            <div className="min-w-0">
              <span className={`text-xs font-bold mr-1.5 ${w.type === 'BLACKLIST' ? 'text-red-700' : w.type === 'ONGOING' ? 'text-amber-700' : 'text-blue-700'}`}>
                [{style.label}]
              </span>
              <span className="text-xs text-slate-700">{w.message}</span>
              {w.relatedCaseCode && (
                <span className="text-xs text-slate-500 ml-1">（关联：{w.relatedCaseCode}）</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── 子组件：当事人行 ──────────────────────────────────────────────────────────

function PartyRow({
  party,
  canEdit,
  onEdit,
  onDelete,
}: {
  party: CaseParty;
  canEdit: boolean;
  onEdit: (p: CaseParty) => void;
  onDelete: (p: CaseParty) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = party.legalRepresentative || party.contactNumber || party.serviceAddress ||
    party.claimAmount || party.claimDetails || party.agentName;

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      {/* 主行 */}
      <div className={`flex items-center gap-3 px-4 py-3 ${party.isOurSide ? 'bg-blue-50' : 'bg-white'}`}>
        {/* 阵营标记 */}
        <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${
          party.isOurSide ? 'bg-blue-100 text-blue-700' : 'bg-orange-50 text-orange-700 border border-orange-200'
        }`}>
          {party.isOurSide ? '我方' : '对方'}
        </span>

        {/* 主体类型图标 */}
        {party.identityType === 'LEGAL_ENTITY'
          ? <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
          : <User className="w-4 h-4 text-slate-400 shrink-0" />
        }

        {/* 名称 + 诉讼地位 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900 text-sm truncate">{party.partyName}</span>
            <span className="shrink-0 text-[10px] text-slate-500 bg-slate-100 px-1.5 rounded">
              {party.partyTypeName || party.partyType}
            </span>
          </div>
          {party.identityNumber && (
            <div className="text-xs text-slate-400 mt-0.5 font-mono">{party.identityNumber}</div>
          )}
        </div>

        {/* 诉讼金额 */}
        {party.claimAmount != null && (
          <span className="shrink-0 text-sm font-mono text-slate-600">
            ¥{Number(party.claimAmount).toLocaleString('zh-CN')}
          </span>
        )}

        {/* 操作按钮 */}
        <div className="flex items-center gap-1 shrink-0">
          {hasDetail && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              title={expanded ? '收起' : '展开详情'}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
          {canEdit && (
            <>
              <button
                onClick={() => onEdit(party)}
                className="p-1 rounded text-slate-400 hover:text-brand-600 hover:bg-brand-50"
                title="编辑"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={() => onDelete(party)}
                className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                title="删除"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* 展开详情 */}
      {expanded && hasDetail && (
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
          {party.legalRepresentative && (
            <div className="flex items-center gap-1.5 text-slate-600">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400">法代：</span>{party.legalRepresentative}
            </div>
          )}
          {party.contactNumber && (
            <div className="flex items-center gap-1.5 text-slate-600">
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400">电话：</span>{party.contactNumber}
            </div>
          )}
          {party.serviceAddress && (
            <div className="col-span-2 flex items-start gap-1.5 text-slate-600">
              <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
              <span className="text-slate-400 shrink-0">送达：</span>{party.serviceAddress}
            </div>
          )}
          {party.claimDetails && (
            <div className="col-span-2 flex items-start gap-1.5 text-slate-600">
              <FileText className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
              <span className="text-slate-400 shrink-0">诉请：</span>{party.claimDetails}
            </div>
          )}
          {party.agentName && (
            <div className="flex items-center gap-1.5 text-slate-600">
              <Scale className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400">代理人：</span>{party.agentName}
              {party.agentLawFirm && <span className="text-slate-400">（{party.agentLawFirm}）</span>}
            </div>
          )}
          {party.agentContact && (
            <div className="flex items-center gap-1.5 text-slate-600">
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400">代理电话：</span>{party.agentContact}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 子组件：新增/编辑表单 Modal ──────────────────────────────────────────────

function PartyFormModal({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  warnings,
  submitting,
}: {
  initial: PartyFormData;
  submitLabel: string;
  onSubmit: (data: PartyFormData) => Promise<void>;
  onCancel: () => void;
  warnings: ConflictWarning[];
  submitting: boolean;
}) {
  const [form, setForm] = useState<PartyFormData>(initial);
  const set = (k: keyof PartyFormData, v: string | boolean) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.partyName.trim()) return;
    await onSubmit(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-xl shadow-xl w-[620px] max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
        {/* Header */}
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center shrink-0">
          <h3 className="font-bold text-slate-800">{submitLabel}当事人</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto">
          <div className="p-6 space-y-5">
            <ConflictWarnings warnings={warnings} />

            {/* 基础信息 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">诉讼地位 *</label>
                <select
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                  value={form.partyType}
                  onChange={e => set('partyType', e.target.value)}
                >
                  {PARTY_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">主体类型 *</label>
                <select
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                  value={form.identityType}
                  onChange={e => set('identityType', e.target.value)}
                >
                  {IDENTITY_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">当事人名称 *</label>
              <input
                required
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="公司全称或自然人姓名"
                value={form.partyName}
                onChange={e => set('partyName', e.target.value)}
              />
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  checked={form.isOurSide}
                  onChange={e => set('isOurSide', e.target.checked)}
                />
                <span className="text-sm text-slate-700">我方阵营</span>
              </label>
              <span className="text-xs text-slate-400">（勾选表示该当事人代表我司/我方利益）</span>
            </div>

            {/* 证件 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">
                  {form.identityType === 'LEGAL_ENTITY' ? '统一社会信用代码' : '身份证号码'}
                </label>
                <input
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder={form.identityType === 'LEGAL_ENTITY' ? '18位统一社会信用代码' : '18位身份证号'}
                  value={form.identityNumber}
                  onChange={e => set('identityNumber', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">
                  {form.identityType === 'LEGAL_ENTITY' ? '法定代表人' : '联系人'}
                </label>
                <input
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                  value={form.legalRepresentative}
                  onChange={e => set('legalRepresentative', e.target.value)}
                />
              </div>
            </div>

            {/* 联系 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">联系电话</label>
                <input
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                  value={form.contactNumber}
                  onChange={e => set('contactNumber', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">诉讼请求金额（元）</label>
                <input
                  type="number"
                  min="0"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                  value={form.claimAmount}
                  onChange={e => set('claimAmount', e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">法律文书送达地址</label>
              <input
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                value={form.serviceAddress}
                onChange={e => set('serviceAddress', e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">具体诉讼请求/答辩意见</label>
              <textarea
                rows={2}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                value={form.claimDetails}
                onChange={e => set('claimDetails', e.target.value)}
              />
            </div>

            {/* 代理人 */}
            <div className="border-t border-slate-100 pt-4">
              <div className="text-xs font-bold text-slate-500 mb-3">委托代理人信息（可选）</div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">代理人姓名</label>
                  <input
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                    value={form.agentName}
                    onChange={e => set('agentName', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">代理律所/机构</label>
                  <input
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                    value={form.agentLawFirm}
                    onChange={e => set('agentLawFirm', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">代理人联系方式</label>
                  <input
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                    value={form.agentContact}
                    onChange={e => set('agentContact', e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2 shrink-0">
            <Button type="button" variant="ghost" onClick={onCancel}>取消</Button>
            <Button type="submit" disabled={submitting || !form.partyName.trim()}>
              {submitting ? '保存中...' : submitLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────

const CasePartiesTab: React.FC<CasePartiesTabProps> = ({ caseId, canEdit = true }) => {
  const [parties, setParties] = useState<CaseParty[]>([]);
  const [ourSideCount, setOurSideCount] = useState(0);
  const [opposingCount, setOpposingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editTarget, setEditTarget] = useState<CaseParty | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CaseParty | null>(null);

  const [pendingWarnings, setPendingWarnings] = useState<ConflictWarning[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listParties(caseId);
      setParties(result.parties);
      setOurSideCount(result.ourSideCount);
      setOpposingCount(result.opposingCount);
    } catch {
      // apiClient 拦截器已 toast.error，组件保持空列表状态
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (data: PartyFormData) => {
    setSubmitting(true);
    try {
      const { party, warnings } = await addParty({
        caseId,
        partyType: data.partyType,
        isOurSide: data.isOurSide,
        partyName: data.partyName,
        identityType: data.identityType,
        identityNumber: data.identityNumber || undefined,
        legalRepresentative: data.legalRepresentative || undefined,
        contactNumber: data.contactNumber || undefined,
        serviceAddress: data.serviceAddress || undefined,
        claimAmount: data.claimAmount ? Number(data.claimAmount) : undefined,
        claimDetails: data.claimDetails || undefined,
        agentName: data.agentName || undefined,
        agentLawFirm: data.agentLawFirm || undefined,
        agentContact: data.agentContact || undefined,
      });
      if (warnings.length > 0) {
        setPendingWarnings(warnings);
      }
      setParties(prev => [...prev, party]);
      setOurSideCount(prev => data.isOurSide ? prev + 1 : prev);
      setOpposingCount(prev => !data.isOurSide ? prev + 1 : prev);
      setShowAddModal(false);
    } catch {
      // apiClient 拦截器已 toast.error
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (data: PartyFormData) => {
    if (!editTarget) return;
    setSubmitting(true);
    try {
      const updated = await updateParty(editTarget.id, {
        partyType: data.partyType,
        isOurSide: data.isOurSide,
        partyName: data.partyName,
        identityType: data.identityType,
        identityNumber: data.identityNumber || undefined,
        legalRepresentative: data.legalRepresentative || undefined,
        contactNumber: data.contactNumber || undefined,
        serviceAddress: data.serviceAddress || undefined,
        claimAmount: data.claimAmount ? Number(data.claimAmount) : undefined,
        claimDetails: data.claimDetails || undefined,
        agentName: data.agentName || undefined,
        agentLawFirm: data.agentLawFirm || undefined,
        agentContact: data.agentContact || undefined,
      });
      setParties(prev => prev.map(p => p.id === editTarget.id ? updated : p));
      const wasOurSide = editTarget.isOurSide;
      const nowOurSide = data.isOurSide;
      if (wasOurSide !== nowOurSide) {
        setOurSideCount(prev => nowOurSide ? prev + 1 : prev - 1);
        setOpposingCount(prev => !nowOurSide ? prev + 1 : prev - 1);
      }
      setEditTarget(null);
    } catch {
      // apiClient 拦截器已 toast.error
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await removeParty(deleteTarget.id, deleteReason || undefined);
      setParties(prev => prev.filter(p => p.id !== deleteTarget.id));
      setOurSideCount(prev => deleteTarget.isOurSide ? prev - 1 : prev);
      setOpposingCount(prev => !deleteTarget.isOurSide ? prev - 1 : prev);
      setDeleteTarget(null);
      setDeleteReason('');
    } catch {
      // apiClient 拦截器已 toast.error
    } finally {
      setSubmitting(false);
    }
  };

  const toFormData = (p: CaseParty): PartyFormData => ({
    partyType: p.partyType,
    isOurSide: p.isOurSide,
    partyName: p.partyName,
    identityType: p.identityType,
    identityNumber: p.identityNumber || '',
    legalRepresentative: p.legalRepresentative || '',
    contactNumber: p.contactNumber || '',
    serviceAddress: p.serviceAddress || '',
    claimAmount: p.claimAmount != null ? String(p.claimAmount) : '',
    claimDetails: p.claimDetails || '',
    agentName: p.agentName || '',
    agentLawFirm: p.agentLawFirm || '',
    agentContact: p.agentContact || '',
  });

  const ourSide = parties.filter(p => p.isOurSide);
  const opposing = parties.filter(p => !p.isOurSide);

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-14 bg-slate-100 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 冲突预警（新增后持续显示直到关闭） */}
      {pendingWarnings.length > 0 && (
        <div className="relative">
          <ConflictWarnings warnings={pendingWarnings} />
          <button
            onClick={() => setPendingWarnings([])}
            className="absolute top-2 right-2 text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 头部统计 + 新增按钮 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold text-slate-700">当事人</h3>
          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
            共 {parties.length} 人
          </span>
          {ourSideCount > 0 && (
            <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
              我方 {ourSideCount}
            </span>
          )}
          {opposingCount > 0 && (
            <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-100">
              对方 {opposingCount}
            </span>
          )}
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => setShowAddModal(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> 新增当事人
          </Button>
        )}
      </div>

      {/* 我方阵营 */}
      {ourSide.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wide px-1">我方阵营</div>
          {ourSide.map(p => (
            <PartyRow
              key={p.id}
              party={p}
              canEdit={canEdit}
              onEdit={p => setEditTarget(p)}
              onDelete={p => setDeleteTarget(p)}
            />
          ))}
        </div>
      )}

      {/* 对方阵营 */}
      {opposing.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wide px-1">对方阵营</div>
          {opposing.map(p => (
            <PartyRow
              key={p.id}
              party={p}
              canEdit={canEdit}
              onEdit={p => setEditTarget(p)}
              onDelete={p => setDeleteTarget(p)}
            />
          ))}
        </div>
      )}

      {/* 空状态 */}
      {parties.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <Scale className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">暂无当事人</p>
          {canEdit && (
            <p className="text-xs mt-1">点击「新增当事人」添加原告、被告等信息</p>
          )}
        </div>
      )}

      {/* 新增 Modal */}
      {showAddModal && (
        <PartyFormModal
          initial={EMPTY_FORM}
          submitLabel="新增"
          warnings={[]}
          submitting={submitting}
          onSubmit={handleAdd}
          onCancel={() => setShowAddModal(false)}
        />
      )}

      {/* 编辑 Modal */}
      {editTarget && (
        <PartyFormModal
          initial={toFormData(editTarget)}
          submitLabel="保存"
          warnings={[]}
          submitting={submitting}
          onSubmit={handleEdit}
          onCancel={() => setEditTarget(null)}
        />
      )}

      {/* 删除确认 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-xl shadow-xl w-96 overflow-hidden border border-slate-200">
            <div className="bg-red-50 px-6 py-4 border-b border-red-100">
              <h3 className="font-bold text-red-800 flex items-center gap-2">
                <Trash2 className="w-4 h-4" /> 确认删除当事人
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-700">
                确定要删除 <span className="font-bold">{deleteTarget.partyName}</span>（{deleteTarget.partyTypeName || deleteTarget.partyType}）吗？
              </p>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">删除原因（可选）</label>
                <input
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="记录在审计日志中"
                  value={deleteReason}
                  onChange={e => setDeleteReason(e.target.value)}
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setDeleteTarget(null); setDeleteReason(''); }}>
                取消
              </Button>
              <Button
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50"
                disabled={submitting}
                onClick={handleDelete}
              >
                {submitting ? '删除中...' : '确认删除'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CasePartiesTab;
