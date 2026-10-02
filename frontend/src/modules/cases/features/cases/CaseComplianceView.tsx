
import React, { useEffect, useState } from 'react';
import { Case, RegulatoryAttributes } from '../../types';
import { updateRegulatoryAttributes } from '../../services/case';
import DisclosureTimeline from './DisclosureTimeline';
import { ShieldAlert, Info, Save, RotateCcw, AlertTriangle } from 'lucide-react';
import Button from '../../components/ui/Button';

interface CaseComplianceViewProps {
  caseData: Case;
}

const CaseComplianceView: React.FC<CaseComplianceViewProps> = ({ caseData }) => {
  const [formData, setFormData] = useState<RegulatoryAttributes>({
      regCaseCode: '',
      regCauseName: '',
      securityCode: '',
      securityName: '',
      sector: '主板',
      isInvestorProtection: false,
      isMajor: false,
      amountNoInterest: 0,
      amountWithInterest: 0
  });
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (caseData.regulatoryAttrs) {
        setFormData(caseData.regulatoryAttrs);
    } else {
        // Initialize defaults based on existing data if possible
        setFormData(prev => ({
            ...prev,
            amountNoInterest: 0 // In real app, might default from Finance module
        }));
        setIsEditing(true); // Auto-open edit mode if no data
    }
  }, [caseData]);

  // Mock Security Code Lookup
  const handleSecurityCodeChange = (code: string) => {
      setFormData(prev => ({ ...prev, securityCode: code }));
      // Simple Mock Lookup
      if (code === '600030') setFormData(prev => ({...prev, securityName: '中信证券', sector: '主板'}));
      if (code === '688999') setFormData(prev => ({...prev, securityName: 'TechNova', sector: '科创板'}));
      if (code === '002345') setFormData(prev => ({...prev, securityName: '深南实业', sector: '主板'}));
  };

  const handleSave = async () => {
      setIsSaving(true);
      try {
          await updateRegulatoryAttributes(caseData.id, formData);
          setIsEditing(false);
      } finally {
          setIsSaving(false);
      }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-500">
        
        {/* Left Column: Regulatory Form (2/3) */}
        <div className="lg:col-span-2 space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <ShieldAlert className="w-5 h-5 text-indigo-600" /> 监管要素标签 (Regulatory Tags)
                    </h3>
                    {!isEditing && (
                        <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>编辑要素</Button>
                    )}
                </div>
                
                <div className="p-6 space-y-6">
                    {/* 1. Basic Mapping */}
                    <div>
                        <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-2">
                            <Info className="w-3 h-3" /> 案件性质定性
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">监管标准案由代码</label>
                                <select 
                                    disabled={!isEditing}
                                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500"
                                    value={formData.regCaseCode}
                                    onChange={e => setFormData({...formData, regCaseCode: e.target.value})}
                                >
                                    <option value="">-- 请选择 --</option>
                                    <option value="S01">S01 - 证券虚假陈述责任纠纷</option>
                                    <option value="S02">S02 - 证券欺诈责任纠纷</option>
                                    <option value="M03">M03 - 股票质押回购纠纷</option>
                                    <option value="ZQ-001">ZQ-001 - 公司债券交易纠纷</option>
                                    <option value="JJ-009">JJ-009 - 基金合同纠纷</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">涉案证券代码</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        disabled={!isEditing}
                                        className="w-32 border border-slate-300 rounded px-3 py-2 text-sm disabled:bg-slate-50"
                                        placeholder="如 600030"
                                        value={formData.securityCode}
                                        onChange={e => handleSecurityCodeChange(e.target.value)}
                                    />
                                    <input 
                                        type="text" 
                                        disabled 
                                        className="flex-1 bg-slate-50 border border-slate-200 rounded px-3 py-2 text-sm text-slate-600"
                                        placeholder="自动回填证券名称"
                                        value={formData.securityName}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">所属板块</label>
                                <select 
                                    disabled={!isEditing}
                                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm disabled:bg-slate-50"
                                    value={formData.sector}
                                    onChange={e => setFormData({...formData, sector: e.target.value as any})}
                                >
                                    <option value="主板">主板</option>
                                    <option value="科创板">科创板</option>
                                    <option value="创业板">创业板</option>
                                    <option value="北交所">北交所</option>
                                    <option value="债券">债券</option>
                                </select>
                            </div>
                            <div className="flex items-center pt-6">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        disabled={!isEditing}
                                        checked={formData.isInvestorProtection}
                                        onChange={e => setFormData({...formData, isInvestorProtection: e.target.checked})}
                                        className="w-4 h-4 text-brand-600 rounded border-gray-300 focus:ring-brand-500"
                                    />
                                    <span className="text-sm font-medium text-slate-700">涉及投资者保护基金 (投保)</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-slate-100 pt-6">
                         <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-2">
                            <Info className="w-3 h-3" /> 重大性与金额 (Reporting Amount)
                        </h4>
                        
                        <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 mb-4 flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                            <div className="text-xs text-amber-800">
                                <span className="font-bold">重大性校验规则：</span>
                                涉案金额 &gt; 1000万元，且占最近一期经审计净资产绝对值10%以上。
                                <br/>当前计算结果: <span className={`font-bold ${formData.isMajor ? 'text-red-600' : 'text-emerald-600'}`}>{formData.isMajor ? '触及重大标准' : '未触及'}</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">不含息涉案金额 (元)</label>
                                <input 
                                    type="number" 
                                    disabled={!isEditing}
                                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm disabled:bg-slate-50 font-mono"
                                    value={formData.amountNoInterest}
                                    onChange={e => setFormData({...formData, amountNoInterest: parseFloat(e.target.value)})}
                                />
                                <p className="text-[10px] text-slate-400 mt-1">* 证监局月报口径</p>
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">含息涉案金额 (元)</label>
                                <input 
                                    type="number" 
                                    disabled={!isEditing}
                                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm disabled:bg-slate-50 font-mono"
                                    value={formData.amountWithInterest}
                                    onChange={e => setFormData({...formData, amountWithInterest: parseFloat(e.target.value)})}
                                />
                                <p className="text-[10px] text-slate-400 mt-1">* 财务预计负债口径</p>
                            </div>
                        </div>
                    </div>

                    {isEditing && (
                        <div className="border-t border-slate-100 pt-6 flex justify-end gap-3">
                            <Button variant="ghost" onClick={() => setIsEditing(false)}>取消</Button>
                            <Button onClick={handleSave} isLoading={isSaving} disabled={!formData.regCaseCode}>
                                <Save className="w-4 h-4 mr-1" /> 保存监管要素
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* Right Column: Disclosure Timeline (1/3) */}
        <div className="lg:col-span-1">
            <DisclosureTimeline caseId={caseData.id} />
        </div>
    </div>
  );
};

export default CaseComplianceView;
