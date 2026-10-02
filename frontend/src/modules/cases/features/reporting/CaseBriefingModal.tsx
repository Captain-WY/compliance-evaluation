
import React, { useState, useEffect } from 'react';
import { Case, CaseStrategy, FinancialRecord, CaseHistoryLog, BriefingRecord } from '../../types';
import { addBriefingRecord, updateBriefingRecord } from '../../services/mock/internalReporting';
import { X, Copy, Download, FileText, Check, Printer, AlertTriangle, ShieldCheck, Save, Loader2, TrendingDown, Edit3 } from 'lucide-react';
import Button from '../../components/ui/Button';

interface CaseBriefingModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseData: Case;
  strategy?: CaseStrategy | null;
  finance?: FinancialRecord;
  latestHistory?: CaseHistoryLog;
  existingBriefing?: BriefingRecord; // New prop: Load existing
}

const CaseBriefingModal: React.FC<CaseBriefingModalProps> = ({ 
    isOpen, onClose, caseData, strategy, finance, latestHistory, existingBriefing 
}) => {
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Editable Content States
  const [descContent, setDescContent] = useState('');
  const [strategyContent, setStrategyContent] = useState('');
  const [proposalContent, setProposalContent] = useState('建议批准上述应对策略，并授权法务部进行后续诉讼程序推进。如涉及和解，将另行发起金额审批。');

  // Initialize Content
  useEffect(() => {
      if (isOpen) {
          if (existingBriefing && existingBriefing.content) {
              // Try to parse mock content (Simple approach for demo) or just set a default if structure complex
              // For demo, we'll just set the description as the main editable part if loaded
              setDescContent(caseData.description || '');
              // If we were real, we'd parse existingBriefing.content into sections
          } else {
              // Default Generation
              setDescContent(caseData.description || '（暂无详细案情描述）');
              setStrategyContent(strategy?.analysis || '（暂无详细法律分析意见）');
          }
          setIsEditing(!existingBriefing); // Auto-edit if new
      }
  }, [isOpen, caseData, strategy, existingBriefing]);

  if (!isOpen) return null;

  const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  const amountStr = finance?.claimedAmount 
    ? `¥ ${(finance.claimedAmount / 10000).toFixed(2)} 万元` 
    : `¥ ${((caseData.regulatoryAttrs?.amountNoInterest || 0) / 10000).toFixed(2)} 万元`;

  const provisionStr = finance?.provisionAmount 
    ? `¥ ${(finance.provisionAmount / 10000).toFixed(2)} 万元`
    : '0';

  // Simple Profit Impact Calc
  const impactEstimate = (finance?.provisionAmount || 0) + (finance?.legalFeePaid || 0) + (finance?.otherFeesPaid || 0);

  const generateFullText = () => {
      return `
【关于 ${caseData.title} 的情况汇报】

一、基本情况
案号：${caseData.code}
阶段：${caseData.stage}
金额：${amountStr}

二、案情摘要
${descContent}

三、律师分析
${strategyContent}

四、财务影响
预计负债：${provisionStr}
当期损益影响：¥ ${(impactEstimate / 10000).toFixed(2)} 万元

五、拟办意见
${proposalContent}
      `.trim();
  };

  const handleCopy = () => {
      navigator.clipboard.writeText(generateFullText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
      setIsSaving(true);
      const fullText = generateFullText();
      
      if (existingBriefing) {
          await updateBriefingRecord(existingBriefing.id, {
              content: fullText,
              generatedAt: new Date().toLocaleString()
          });
      } else {
          await addBriefingRecord({
              caseId: caseData.id,
              caseTitle: caseData.title,
              type: caseData.stage === '立案' ? '立案签报' : '进展签报',
              generator: '当前用户',
              content: fullText
          });
      }
      
      setIsSaving(false);
      setSaved(true);
      setIsEditing(false); // Exit edit mode
      setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
        <div className="bg-slate-100 rounded-xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="bg-white px-6 py-4 border-b border-slate-200 flex justify-between items-center rounded-t-xl shrink-0">
                <div>
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-red-700" /> 
                        {existingBriefing ? '编辑签报 (Edit Briefing)' : '生成签报 (Create Briefing)'}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">适用于 OA 流转、管理层汇报及重大事项通报。</p>
                </div>
                <div className="flex items-center gap-3">
                    {!isEditing && (
                        <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                            <Edit3 className="w-4 h-4 mr-2"/> 编辑内容
                        </Button>
                    )}
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Document Preview Area */}
            <div className="flex-1 overflow-y-auto p-8 bg-slate-200/50">
                <div className="bg-white shadow-lg border border-slate-200 p-12 min-h-[800px] mx-auto max-w-3xl font-serif text-slate-800 leading-relaxed selection:bg-red-100">
                    
                    {/* Official Header */}
                    <div className="border-b-2 border-red-600 mb-8 pb-4">
                        <h1 className="text-2xl font-bold text-center text-red-600 tracking-widest mb-2">法律事务重要呈批件</h1>
                        <div className="flex justify-between text-xs font-sans text-slate-500 mt-4">
                            <span>密级：内部机密</span>
                            <span>编号：LAW-${new Date().getFullYear()}-${Math.floor(Math.random()*1000).toString().padStart(3,'0')}</span>
                        </div>
                    </div>

                    {/* Title */}
                    <div className="text-center mb-10">
                        <h2 className="text-xl font-bold mb-4">关于 {caseData.title} 的情况汇报</h2>
                        <div className="flex justify-center gap-8 text-sm font-sans text-slate-600">
                            <span>承办人：{existingBriefing ? existingBriefing.generator : '当前用户'}</span>
                            <span>日期：{today}</span>
                        </div>
                    </div>

                    {/* Content Sections */}
                    <div className="space-y-8">
                        {/* Section 1: Immutable Basics */}
                        <div>
                            <h4 className="font-bold text-base mb-3 font-sans flex items-center gap-2">
                                <span className="bg-slate-800 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs">1</span>
                                基本情况
                            </h4>
                            <div className="bg-slate-50 border border-slate-200 p-4 rounded text-sm font-sans grid grid-cols-2 gap-y-3">
                                <div><span className="text-slate-500">案号：</span>{caseData.code}</div>
                                <div><span className="text-slate-500">阶段：</span><span className="font-bold text-brand-700">{caseData.stage}</span></div>
                                <div><span className="text-slate-500">涉案金额：</span><span className="font-bold text-red-700">{amountStr}</span></div>
                                <div><span className="text-slate-500">受理法院：</span>{caseData.court}</div>
                                <div className="col-span-2 border-t border-slate-200 pt-2 mt-1">
                                    <span className="text-slate-500">当事人：</span>
                                    <span className="ml-2">原告 - {caseData.plaintiff}</span>
                                    <span className="mx-2">|</span>
                                    <span>被告 - {caseData.defendant}</span>
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Editable Description */}
                        <div>
                            <h4 className="font-bold text-base mb-3 font-sans flex items-center gap-2">
                                <span className="bg-slate-800 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs">2</span>
                                案情摘要
                            </h4>
                            {isEditing ? (
                                <textarea 
                                    className="w-full border border-slate-300 p-3 rounded text-sm font-sans min-h-[150px] outline-none focus:ring-2 focus:ring-brand-500 bg-slate-50"
                                    value={descContent}
                                    onChange={e => setDescContent(e.target.value)}
                                />
                            ) : (
                                <p className="text-sm text-justify indent-8 leading-7 whitespace-pre-wrap">
                                    {descContent}
                                </p>
                            )}
                        </div>

                        {/* Section 3: Editable Strategy */}
                        <div>
                            <h4 className="font-bold text-base mb-3 font-sans flex items-center gap-2">
                                <span className="bg-slate-800 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs">3</span>
                                律师分析与策略
                            </h4>
                            <div className="text-sm space-y-3">
                                <div className="flex gap-4">
                                    <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded font-bold text-xs border border-blue-100 flex items-center">
                                        拟定策略：{strategy?.direction || '制定中'}
                                    </div>
                                    <div className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded font-bold text-xs border border-emerald-100 flex items-center">
                                        胜诉率预估：{strategy?.winProbability ? `${strategy.winProbability}%` : '未评估'}
                                    </div>
                                </div>
                                {isEditing ? (
                                    <textarea 
                                        className="w-full border border-slate-300 p-3 rounded text-sm font-sans min-h-[100px] outline-none focus:ring-2 focus:ring-brand-500 bg-slate-50 mt-2"
                                        value={strategyContent}
                                        onChange={e => setStrategyContent(e.target.value)}
                                    />
                                ) : (
                                    <p className="leading-7 indent-8 bg-slate-50 p-4 rounded border-l-4 border-brand-500 italic text-slate-700 whitespace-pre-wrap">
                                        “{strategyContent}”
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Section 4: Enhanced Financials */}
                        <div>
                            <h4 className="font-bold text-base mb-3 font-sans flex items-center gap-2">
                                <span className="bg-slate-800 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs">4</span>
                                财务影响测算 (Financial Impact)
                            </h4>
                            <div className="text-sm border border-slate-200 rounded p-4 bg-slate-50">
                                <div className="grid grid-cols-2 gap-4 mb-3">
                                    <div>
                                        <p className="text-slate-500 text-xs">预计负债 (Provision)</p>
                                        <p className="font-bold text-slate-800">{provisionStr}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-500 text-xs">当期费用支出 (Cost)</p>
                                        <p className="font-bold text-slate-800">¥ {((finance?.legalFeePaid || 0) / 10000).toFixed(2)} 万元</p>
                                    </div>
                                </div>
                                <div className="pt-3 border-t border-slate-200 flex items-center gap-2 text-red-700">
                                    <TrendingDown className="w-4 h-4" />
                                    <span className="font-bold">预计减少当期利润总额：</span>
                                    <span className="text-lg font-mono">¥ {(impactEstimate / 10000).toFixed(2)} 万元</span>
                                </div>
                            </div>
                        </div>

                        {/* Section 5: Editable Proposal */}
                        <div>
                            <h4 className="font-bold text-base mb-3 font-sans flex items-center gap-2">
                                <span className="bg-slate-800 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs">5</span>
                                拟办意见 (Proposed Action)
                            </h4>
                            {isEditing ? (
                                <textarea 
                                    className="w-full border border-slate-300 p-3 rounded text-sm font-sans min-h-[80px] outline-none focus:ring-2 focus:ring-brand-500 bg-slate-50"
                                    value={proposalContent}
                                    onChange={e => setProposalContent(e.target.value)}
                                />
                            ) : (
                                <div className="text-sm font-sans border-2 border-dashed border-slate-300 p-4 rounded bg-slate-50 text-slate-600 min-h-[80px]">
                                    {proposalContent}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="mt-16 pt-8 border-t border-slate-200 flex justify-between items-end font-sans">
                        <div className="text-xs text-slate-400">
                            生成系统：SLD 法务中台<br/>
                            文档指纹：{existingBriefing ? existingBriefing.id : Math.random().toString(36).substring(7).toUpperCase()}
                        </div>
                        <div className="text-right text-sm font-bold">
                            <p className="mb-1">法律合规部</p>
                            <p>{today}</p>
                        </div>
                    </div>

                </div>
            </div>

            {/* Footer Actions */}
            <div className="bg-white px-6 py-4 border-t border-slate-200 rounded-b-xl flex justify-between items-center shrink-0">
                <span className="text-xs text-slate-400 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    内容已通过自动合规校验
                </span>
                <div className="flex gap-3">
                    {/* New Save Button */}
                    <Button variant="outline" onClick={handleSave} disabled={isSaving || saved} className={saved ? 'text-emerald-600 border-emerald-200' : ''}>
                        {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : saved ? <Check className="w-4 h-4 mr-2"/> : <Save className="w-4 h-4 mr-2"/>}
                        {saved ? '已保存' : '保存草稿'}
                    </Button>
                    <Button variant="outline" onClick={() => alert('下载 PDF 功能模拟：Briefing.pdf 已生成')}>
                        <Printer className="w-4 h-4 mr-2" /> 打印 / PDF
                    </Button>
                    <Button onClick={handleCopy} className={copied ? 'bg-emerald-600 hover:bg-emerald-700' : ''}>
                        {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                        {copied ? '已复制全文' : '复制到 OA'}
                    </Button>
                </div>
            </div>
        </div>
    </div>
  );
};

export default CaseBriefingModal;
