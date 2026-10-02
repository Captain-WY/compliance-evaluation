
import React, { useEffect, useState } from 'react';
import {
  listPreservations,
  createPreservation,
  extendPreservation,
  releasePreservation,
  realizePreservation,
  type AssetPreservationRecord,
} from '../../services/case';
import { partyApi } from '../../src/services/api/partyApi';
import type { PartyResponse } from '../../src/types/api/party';
import {
  Building2, CreditCard, Coins, Car, HelpCircle, AlertTriangle, Lock,
  Search, Plus, X, Clock, Wallet, ShieldCheck, Calendar, Unlock, TrendingUp,
} from 'lucide-react';
import Button from '../../components/ui/Button';

interface AssetListProps {
  caseId: string;
}

type ModalMode = 'create' | 'extend' | 'release' | 'realize';

interface CreateForm {
  assetType: string;
  assetName: string;
  preservationType: string;
  ownerPartyId: string;
  startDate: string;
  expireDate: string;
  estimatedValue: number;
  currency: string;
  executionCourt: string;
  description: string;
}

interface ExtendForm { newExpireDate: string; reason: string; }
interface ReleaseForm { releaseDate: string; releaseReason: string; rulingDocumentId: string; }
interface RealizeForm { realizedValue: number; realizeDate: string; remarks: string; }

const ASSET_TYPE_OPTIONS = [
  { code: 'REAL_ESTATE', label: '房产' },
  { code: 'BANK_ACCOUNT', label: '银行账户' },
  { code: 'EQUITY', label: '股权' },
  { code: 'VEHICLE', label: '车辆' },
  { code: 'OTHER', label: '其他' },
];

const PRESERVATION_TYPE_OPTIONS = [
  { code: 'SEIZE', label: '查封' },
  { code: 'FREEZE', label: '冻结' },
  { code: 'DETAIN', label: '扣押' },
];

const getIcon = (assetType: string) => {
  switch (assetType) {
    case 'REAL_ESTATE': return <Building2 className="w-5 h-5 text-indigo-600" />;
    case 'BANK_ACCOUNT': return <CreditCard className="w-5 h-5 text-blue-600" />;
    case 'EQUITY': return <Coins className="w-5 h-5 text-amber-600" />;
    case 'VEHICLE': return <Car className="w-5 h-5 text-slate-600" />;
    default: return <HelpCircle className="w-5 h-5 text-slate-400" />;
  }
};

const getStatusBadge = (status: string, statusName: string) => {
  const styles: Record<string, string> = {
    ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    RELEASED: 'bg-slate-100 text-slate-500 border-slate-200',
    REALIZED: 'bg-blue-50 text-blue-700 border-blue-100',
    EXPIRED: 'bg-red-50 text-red-700 border-red-100',
  };
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${styles[status] ?? 'bg-slate-100 text-slate-500 border-slate-200'}`}>
      {statusName || status}
    </span>
  );
};

const autoCalcExpireDate = (assetType: string, startDate: string): string => {
  if (!startDate) return '';
  const date = new Date(startDate);
  const yearsMap: Record<string, number> = { BANK_ACCOUNT: 1, VEHICLE: 2 };
  date.setFullYear(date.getFullYear() + (yearsMap[assetType] ?? 3));
  date.setDate(date.getDate() - 1);
  return date.toISOString().split('T')[0];
};

const DEFAULT_CREATE: CreateForm = {
  assetType: 'REAL_ESTATE', assetName: '', preservationType: 'SEIZE',
  ownerPartyId: '', startDate: '', expireDate: '', estimatedValue: 0,
  currency: 'CNY', executionCourt: '', description: '',
};

const AssetList: React.FC<AssetListProps> = ({ caseId }) => {
  const [assets, setAssets] = useState<AssetPreservationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<AssetPreservationRecord | null>(null);

  const [createForm, setCreateForm] = useState<CreateForm>(DEFAULT_CREATE);
  const [extendForm, setExtendForm] = useState<ExtendForm>({ newExpireDate: '', reason: '' });
  const [releaseForm, setReleaseForm] = useState<ReleaseForm>({ releaseDate: '', releaseReason: '', rulingDocumentId: '' });
  const [realizeForm, setRealizeForm] = useState<RealizeForm>({ realizedValue: 0, realizeDate: '', remarks: '' });
  const [caseParties, setCaseParties] = useState<PartyResponse[]>([]);

  const refreshAssets = async () => {
    setLoading(true);
    try {
      const data = await listPreservations(caseId);
      setAssets(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refreshAssets(); }, [caseId]);

  const openCreate = async () => {
    setCreateForm(DEFAULT_CREATE);
    setModalMode('create');
    try {
      const parties = await partyApi.getParties(caseId);
      setCaseParties(parties);
    } catch {
      setCaseParties([]);
    }
  };

  const openExtend = (asset: AssetPreservationRecord) => {
    setSelectedAsset(asset);
    setExtendForm({ newExpireDate: '', reason: '' });
    setModalMode('extend');
  };

  const openRelease = (asset: AssetPreservationRecord) => {
    setSelectedAsset(asset);
    setReleaseForm({ releaseDate: new Date().toISOString().split('T')[0], releaseReason: '', rulingDocumentId: '' });
    setModalMode('release');
  };

  const openRealize = (asset: AssetPreservationRecord) => {
    setSelectedAsset(asset);
    setRealizeForm({ realizedValue: 0, realizeDate: new Date().toISOString().split('T')[0], remarks: '' });
    setModalMode('realize');
  };

  const closeModal = () => { setModalMode(null); setSelectedAsset(null); };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (modalMode === 'create') {
        await createPreservation({
          caseId,
          ownerPartyId: createForm.ownerPartyId,
          assetType: createForm.assetType,
          assetName: createForm.assetName,
          preservationType: createForm.preservationType,
          startDate: createForm.startDate,
          expireDate: createForm.expireDate,
          estimatedValue: createForm.estimatedValue || null,
          currency: createForm.currency,
          executionCourt: createForm.executionCourt || null,
          description: createForm.description || null,
        });
      } else if (modalMode === 'extend' && selectedAsset) {
        await extendPreservation({
          preservationId: selectedAsset.id,
          newExpireDate: extendForm.newExpireDate,
          reason: extendForm.reason || null,
        });
      } else if (modalMode === 'release' && selectedAsset) {
        await releasePreservation({
          preservationId: selectedAsset.id,
          releaseDate: releaseForm.releaseDate,
          releaseReason: releaseForm.releaseReason || null,
          rulingDocumentId: releaseForm.rulingDocumentId || null,
        });
      } else if (modalMode === 'realize' && selectedAsset) {
        await realizePreservation({
          preservationId: selectedAsset.id,
          realizedValue: realizeForm.realizedValue,
          realizeDate: realizeForm.realizeDate,
          remarks: realizeForm.remarks || null,
        });
      }
      closeModal();
      await refreshAssets();
    } finally {
      setSaving(false);
    }
  };

  // Dashboard metrics computed from list
  const totalEstimatedValue = assets.reduce((sum, a) => sum + a.estimatedValue, 0);
  const activeCount = assets.filter(a => a.effectiveStatus === 'ACTIVE').length;
  const expiring30dCount = assets.filter(a => a.isExpiringSoon).length;

  if (loading) return <div className="p-8 text-center text-slate-400">加载资产保全台账...</div>;

  return (
    <div className="space-y-6">
      {/* Dashboard Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900 rounded-xl p-5 text-white shadow-lg relative overflow-hidden">
          <div className="relative z-10">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">保全总估值 (Total Value)</p>
            <p className="text-3xl font-bold mt-2 font-mono">¥ {(totalEstimatedValue / 10000).toFixed(0)} 万</p>
          </div>
          <Wallet className="absolute right-4 bottom-4 w-12 h-12 text-slate-800 opacity-50" />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">当前有效保全</p>
          <div className="flex items-center gap-2 mt-2">
            <Lock className="w-6 h-6 text-emerald-600" />
            <p className="text-2xl font-bold text-emerald-700">{activeCount} <span className="text-sm font-normal text-slate-400">笔</span></p>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3 overflow-hidden">
            <div className="bg-emerald-500 h-full" style={{ width: `${assets.length > 0 ? (activeCount / assets.length) * 100 : 0}%` }} />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">即将到期 (<span className="text-red-500">30天内</span>)</p>
            <p className="text-2xl font-bold text-slate-800 mt-2">
              {expiring30dCount} <span className="text-sm font-normal text-slate-400">笔</span>
            </p>
          </div>
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
            <Clock className="w-6 h-6 text-red-500" />
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-brand-600" /> 资产保全台账
        </h3>
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" /> 录入保全信息
        </Button>
      </div>

      {/* Asset Cards */}
      {assets.length === 0 ? (
        <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
          <Search className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-400">暂无资产保全记录</p>
        </div>
      ) : (
        <div className="space-y-4">
          {assets.map(asset => {
            const isExpiring = asset.isExpiringSoon;
            const isActive = asset.effectiveStatus === 'ACTIVE';
            return (
              <div key={asset.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-all">
                <div className="flex flex-col md:flex-row md:items-start gap-5">
                  {/* Left */}
                  <div className="flex-1 flex gap-4 min-w-0">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 h-fit">
                      {getIcon(asset.assetType)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{asset.assetTypeName}</span>
                        {getStatusBadge(asset.effectiveStatus, asset.effectiveStatusName)}
                        <span className="text-[10px] bg-slate-50 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">{asset.preservationTypeName}</span>
                      </div>
                      <h4 className="font-bold text-slate-800 text-sm truncate mb-2" title={asset.assetName}>{asset.assetName}</h4>
                      <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs text-slate-600">
                        <div className="flex justify-between">
                          <span className="text-slate-400">估值:</span>
                          <span className="font-mono font-bold">¥ {(asset.estimatedValue / 10000).toFixed(0)} 万</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">保全法院:</span>
                          <span className="truncate max-w-[120px]">{asset.executionCourt || '-'}</span>
                        </div>
                        <div className="col-span-2 flex justify-between border-t border-slate-100 pt-2 mt-1">
                          <span className="text-slate-400">被保全方:</span>
                          <span>{asset.ownerPartyName || '-'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right: Timeline & Actions */}
                  <div className="w-full md:w-64 shrink-0 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6 flex flex-col justify-between">
                    <div className="mb-4">
                      <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                        <span>保全期限</span>
                        <span>{asset.expireDate || '未设定'}</span>
                      </div>
                      <div className="flex justify-end mt-1">
                        {isExpiring ? (
                          <span className="text-xs font-bold text-red-600 flex items-center gap-1 animate-pulse">
                            <AlertTriangle className="w-3 h-3" /> 剩 {asset.daysUntilExpiry} 天
                          </span>
                        ) : asset.daysUntilExpiry > 0 ? (
                          <span className="text-[10px] text-slate-500">剩余 {asset.daysUntilExpiry} 天</span>
                        ) : (
                          <span className="text-[10px] text-slate-400">已过期或已结束</span>
                        )}
                      </div>
                    </div>

                    {isActive && (
                      <div className="flex gap-2 justify-end flex-wrap">
                        <Button size="sm" variant="outline" onClick={() => openExtend(asset)} className="h-7 text-xs">
                          <Calendar className="w-3 h-3 mr-1" /> 续期
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openRealize(asset)} className="h-7 text-xs">
                          <TrendingUp className="w-3 h-3 mr-1" /> 变现
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openRelease(asset)} className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50">
                          <Unlock className="w-3 h-3 mr-1" /> 解除
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-[500px] overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-brand-600" />
                {modalMode === 'create' ? '录入保全信息' : modalMode === 'extend' ? '续期保全' : modalMode === 'release' ? '解除保全' : '变现处置'}
              </h3>
              <button onClick={closeModal}><X className="w-5 h-5 text-slate-400 hover:text-slate-600" /></button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              {modalMode === 'create' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">资产类型</label>
                      <select className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                        value={createForm.assetType}
                        onChange={e => setCreateForm(f => ({ ...f, assetType: e.target.value, expireDate: autoCalcExpireDate(e.target.value, f.startDate) }))}>
                        {ASSET_TYPE_OPTIONS.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">保全方式</label>
                      <select className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                        value={createForm.preservationType}
                        onChange={e => setCreateForm(f => ({ ...f, preservationType: e.target.value }))}>
                        {PRESERVATION_TYPE_OPTIONS.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">资产名称</label>
                    <input className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                      placeholder="如：上海市浦东新区XX路房产"
                      value={createForm.assetName}
                      onChange={e => setCreateForm(f => ({ ...f, assetName: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">被保全方</label>
                    <select className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                      value={createForm.ownerPartyId}
                      onChange={e => setCreateForm(f => ({ ...f, ownerPartyId: e.target.value }))}>
                      <option value="">请选择被保全方</option>
                      {caseParties.map(p => (
                        <option key={p.id} value={p.id}>{p.partyName} ({p.partyType === 'plaintiff' ? '原告' : p.partyType === 'defendant' ? '被告' : '第三人'})</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">估值 (元)</label>
                      <input type="number" className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                        value={createForm.estimatedValue || ''}
                        onChange={e => setCreateForm(f => ({ ...f, estimatedValue: Number(e.target.value) }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">保全法院</label>
                      <input className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                        value={createForm.executionCourt}
                        onChange={e => setCreateForm(f => ({ ...f, executionCourt: e.target.value }))} />
                    </div>
                  </div>
                  <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <h4 className="text-xs font-bold text-blue-700 mb-2 flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> 保全期限
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] text-blue-600 mb-1">起始日</label>
                        <input type="date" className="w-full border border-blue-200 rounded px-2 py-1 text-sm text-blue-900"
                          value={createForm.startDate}
                          onChange={e => setCreateForm(f => ({ ...f, startDate: e.target.value, expireDate: autoCalcExpireDate(f.assetType, e.target.value) }))} />
                      </div>
                      <div>
                        <label className="block text-[10px] text-blue-600 mb-1">届满日</label>
                        <input type="date" className="w-full border border-blue-200 rounded px-2 py-1 text-sm text-blue-900"
                          value={createForm.expireDate}
                          onChange={e => setCreateForm(f => ({ ...f, expireDate: e.target.value }))} />
                      </div>
                    </div>
                    <p className="text-[10px] text-blue-500 mt-2">* 系统已根据资产类型自动计算法定有效期（银行1年/动产2年/不动产3年）。</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">备注</label>
                    <input className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                      value={createForm.description}
                      onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} />
                  </div>
                </>
              )}

              {modalMode === 'extend' && selectedAsset && (
                <>
                  <div className="bg-slate-50 p-3 rounded-lg text-sm text-slate-600">
                    <span className="font-bold">资产：</span>{selectedAsset.assetName}
                    <span className="ml-4 font-bold">当前到期：</span>{selectedAsset.expireDate}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">新到期日</label>
                    <input type="date" className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                      value={extendForm.newExpireDate}
                      onChange={e => setExtendForm(f => ({ ...f, newExpireDate: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">续期原因</label>
                    <input className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                      placeholder="如：案件尚未执行完毕，申请续封"
                      value={extendForm.reason}
                      onChange={e => setExtendForm(f => ({ ...f, reason: e.target.value }))} />
                  </div>
                </>
              )}

              {modalMode === 'release' && selectedAsset && (
                <>
                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-sm text-amber-800">
                    <AlertTriangle className="w-4 h-4 inline mr-1" />
                    解除保全为不可逆操作，请确认后提交。
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg text-sm text-slate-600">
                    <span className="font-bold">资产：</span>{selectedAsset.assetName}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">解除日期</label>
                    <input type="date" className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                      value={releaseForm.releaseDate}
                      onChange={e => setReleaseForm(f => ({ ...f, releaseDate: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">解除原因</label>
                    <input className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                      value={releaseForm.releaseReason}
                      onChange={e => setReleaseForm(f => ({ ...f, releaseReason: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">裁定文书编号 (可选)</label>
                    <input className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm font-mono"
                      value={releaseForm.rulingDocumentId}
                      onChange={e => setReleaseForm(f => ({ ...f, rulingDocumentId: e.target.value }))} />
                  </div>
                </>
              )}

              {modalMode === 'realize' && selectedAsset && (
                <>
                  <div className="bg-slate-50 p-3 rounded-lg text-sm text-slate-600">
                    <span className="font-bold">资产：</span>{selectedAsset.assetName}
                    <span className="ml-4 font-bold">估值：</span>¥{(selectedAsset.estimatedValue / 10000).toFixed(0)}万
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">实际变现金额 (元)</label>
                    <input type="number" className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                      value={realizeForm.realizedValue || ''}
                      onChange={e => setRealizeForm(f => ({ ...f, realizedValue: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">变现日期</label>
                    <input type="date" className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                      value={realizeForm.realizeDate}
                      onChange={e => setRealizeForm(f => ({ ...f, realizeDate: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">备注</label>
                    <input className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                      value={realizeForm.remarks}
                      onChange={e => setRealizeForm(f => ({ ...f, remarks: e.target.value }))} />
                  </div>
                </>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <Button variant="ghost" onClick={closeModal} disabled={saving}>取消</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? '保存中...' : '确认提交'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetList;
