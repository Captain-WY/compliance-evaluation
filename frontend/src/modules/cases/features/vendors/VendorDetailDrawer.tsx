import React, { useState, useEffect } from 'react';
import { X, Phone, Mail, Scale, Briefcase, DollarSign, Users, Loader2, ToggleLeft, ToggleRight } from 'lucide-react';
import Button from '../../components/ui/Button';
import VendorForm from './VendorForm';
import LawyerPanel from './LawyerPanel';
import {
  getVendorDetail,
  getVendorCases,
  toggleVendorStatus,
  type VendorRecord,
  type VendorCaseItem,
} from '../../services/case';

interface VendorDetailDrawerProps {
  firmId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

type DrawerTab = 'OVERVIEW' | 'LAWYERS' | 'CASES';

const TAB_LABELS: Record<DrawerTab, string> = {
  OVERVIEW: '基础档案',
  LAWYERS: '律师团队',
  CASES: '案件实绩',
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  BACKUP: 'bg-amber-50 text-amber-700 border-amber-200',
  BLACKLISTED: 'bg-red-50 text-red-700 border-red-200',
};

const VendorDetailDrawer: React.FC<VendorDetailDrawerProps> = ({ firmId, isOpen, onClose, onRefresh }) => {
  const [vendor, setVendor] = useState<VendorRecord | null>(null);
  const [cases, setCases] = useState<VendorCaseItem[]>([]);
  const [casesTotal, setCasesTotal] = useState(0);
  const [activeTab, setActiveTab] = useState<DrawerTab>('OVERVIEW');
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (isOpen && firmId) {
      setActiveTab('OVERVIEW');
      setIsEditing(false);
      load(firmId);
    }
  }, [isOpen, firmId]);

  const load = async (id: string) => {
    setLoading(true);
    const [vData, cData] = await Promise.all([
      getVendorDetail(id),
      getVendorCases(id),
    ]);
    setVendor(vData);
    setCases(cData.items);
    setCasesTotal(cData.total);
    setLoading(false);
  };

  const handleToggleStatus = async () => {
    if (!vendor) return;
    const next = vendor.cooperationStatus === 'ACTIVE' ? 'BACKUP' : 'ACTIVE';
    setToggling(true);
    await toggleVendorStatus(vendor.firmId, next);
    setToggling(false);
    if (firmId) {
      await load(firmId);
      onRefresh?.();
    }
  };

  const handleEditSave = () => {
    setIsEditing(false);
    if (firmId) {
      load(firmId);
      onRefresh?.();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px]" onClick={onClose} />

      <div className="relative w-[640px] h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">

        {loading || !vendor ? (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中...
          </div>
        ) : isEditing ? (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-800">编辑律所档案</h2>
              <button onClick={() => setIsEditing(false)} className="p-1 hover:bg-slate-100 rounded text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <VendorForm
              initialData={vendor}
              mode="EDIT"
              onSave={handleEditSave}
              onCancel={() => setIsEditing(false)}
            />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-5 shrink-0">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-lg font-bold text-brand-600 shadow-sm">
                    {vendor.firmName.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-bold text-slate-800">{vendor.firmName}</h2>
                      <span className={`px-2 py-0.5 text-xs rounded border font-medium ${STATUS_COLORS[vendor.cooperationStatus] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                        {vendor.cooperationStatusName}
                      </span>
                      {vendor.ratingLevelName && (
                        <span className="text-xs text-amber-600 font-medium">★ {vendor.ratingLevelName}</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{vendor.activeLawyerCount} 位在职律师</p>
                  </div>
                </div>
                <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded text-slate-400">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex items-center gap-2 mb-4">
                <Button size="sm" variant="secondary" onClick={() => setIsEditing(true)}>编辑</Button>
                <button
                  onClick={handleToggleStatus}
                  disabled={toggling}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-slate-300 rounded-lg hover:bg-slate-100 text-slate-600 disabled:opacity-50"
                >
                  {vendor.cooperationStatus === 'ACTIVE'
                    ? <><ToggleRight className="w-3.5 h-3.5 text-emerald-600" /> 切换为候选库</>
                    : <><ToggleLeft className="w-3.5 h-3.5 text-slate-400" /> 切换为合作中</>
                  }
                </button>
              </div>

              {/* Tabs */}
              <div className="flex gap-6 text-sm font-medium text-slate-500">
                {(Object.keys(TAB_LABELS) as DrawerTab[]).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`pb-2 border-b-2 transition-colors ${
                      activeTab === tab
                        ? 'text-brand-600 border-brand-600'
                        : 'border-transparent hover:text-slate-800'
                    }`}
                  >
                    {tab === 'CASES' ? `${TAB_LABELS[tab]} (${casesTotal})` : TAB_LABELS[tab]}
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">

              {/* OVERVIEW */}
              {activeTab === 'OVERVIEW' && (
                <div className="space-y-4">
                  {vendor.profile && (
                    <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                      <h4 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-1.5">
                        <Briefcase className="w-3.5 h-3.5" /> 律所简介
                      </h4>
                      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{vendor.profile}</p>
                    </div>
                  )}

                  {vendor.rateCardSummary && (
                    <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                      <h4 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5" /> 费率说明
                      </h4>
                      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{vendor.rateCardSummary}</p>
                    </div>
                  )}

                  <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                    <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-1.5">
                      <Scale className="w-3.5 h-3.5" /> 基本信息
                    </h4>
                    <div className="space-y-2 text-sm">
                      {vendor.unifiedSocialCreditCode && (
                        <div className="flex gap-2">
                          <span className="text-slate-400 w-28 shrink-0">统一信用代码</span>
                          <span className="text-slate-700 font-mono">{vendor.unifiedSocialCreditCode}</span>
                        </div>
                      )}
                      {vendor.createdAt && (
                        <div className="flex gap-2">
                          <span className="text-slate-400 w-28 shrink-0">入库时间</span>
                          <span className="text-slate-700">{vendor.createdAt.slice(0, 10)}</span>
                        </div>
                      )}
                      {vendor.updatedAt && (
                        <div className="flex gap-2">
                          <span className="text-slate-400 w-28 shrink-0">最近更新</span>
                          <span className="text-slate-700">{vendor.updatedAt.slice(0, 10)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* LAWYERS */}
              {activeTab === 'LAWYERS' && (
                <LawyerPanel firmId={vendor.firmId} />
              )}

              {/* CASES */}
              {activeTab === 'CASES' && (
                <div className="space-y-2">
                  {cases.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 text-sm">暂无案件实绩记录</div>
                  ) : (
                    cases.map(c => (
                      <div key={c.counselId} className="bg-white border border-slate-200 rounded-lg px-4 py-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-slate-800 text-sm">{c.caseName}</p>
                            <div className="flex gap-2 text-xs text-slate-400 mt-0.5">
                              <span>{c.roleName}</span>
                              <span>·</span>
                              <span className={c.status === 'CLOSED' ? 'text-slate-400' : 'text-emerald-600'}>{c.statusName}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default VendorDetailDrawer;
