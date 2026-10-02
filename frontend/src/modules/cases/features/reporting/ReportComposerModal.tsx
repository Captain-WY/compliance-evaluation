import React, { useState, useMemo, useEffect } from 'react';
import { Case, InternalReport, InternalReportType, InternalReportSubType, ReportTargetAudience } from '../../types';
import { X, FileText, Download, Save, PieChart, ShieldAlert, Paperclip, FileSpreadsheet, File as FileIcon, Briefcase, Building2, Scale } from 'lucide-react';
import Button from '../../components/ui/Button';
import { ResponsiveContainer, PieChart as RePieChart, Pie, Cell, Tooltip } from 'recharts';

interface ReportComposerModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedCases: Case[];
    initialType?: InternalReportType;
    initialSubType?: InternalReportSubType;
    onSave: (report: Partial<InternalReport>) => void;
}

const ReportComposerModal: React.FC<ReportComposerModalProps> = ({ 
    isOpen, onClose, selectedCases, onSave, 
    initialType = InternalReportType.EVENT_DRIVEN, initialSubType = InternalReportSubType.CASE_BRIEF 
}) => {
    const [isSaving, setIsSaving] = useState(false);
    const [title, setTitle] = useState('');
    const [targetAudience, setTargetAudience] = useState<ReportTargetAudience>(ReportTargetAudience.LEGAL_HEAD);
    
    // Editable Content
    const [summary, setSummary] = useState('');
    const [conclusion, setConclusion] = useState('');
    
    // Attachments State
    const [attachments, setAttachments] = useState<{name: string, type: 'EXCEL' | 'PDF', selected: boolean}[]>([]);

    // 1. Statistics Calculation
    const stats = useMemo(() => {
        const total = selectedCases.length;
        const critical = selectedCases.filter(c => c.riskLevel === '特大').length;
        const major = selectedCases.filter(c => c.riskLevel === '重大').length;
        const totalAmount = selectedCases.reduce((sum, c) => sum + (c.regulatoryAttrs?.amountNoInterest || 0), 0);
        
        const riskCounts: Record<string, number> = {};
        selectedCases.forEach(c => {
            riskCounts[c.riskLevel] = (riskCounts[c.riskLevel] || 0) + 1;
        });
        
        const pieData = Object.entries(riskCounts).map(([name, value]) => ({ 
            name, value, 
            color: name === '特大' ? '#ef4444' : name === '重大' ? '#f97316' : '#3b82f6' 
        }));

        return { total, critical, major, totalAmount, pieData };
    }, [selectedCases]);

    // 2. Scenario Logic: Auto-generate content based on Audience & SubType
    useEffect(() => {
        if (!isOpen) return;

        const dateStr = new Date().toLocaleDateString();
        const amountStr = (stats.totalAmount / 100000000).toFixed(2);
        
        // A. Title Generation
        let newTitle = `法律事务专项汇报 - ${dateStr}`;
        if (initialSubType === InternalReportSubType.CUSTOM) {
            const line = selectedCases[0]?.businessLine || '特定业务';
            newTitle = `${line}业务法律风险专项分析报告 (${dateStr})`;
        } else if (initialSubType === InternalReportSubType.MONTHLY) {
            newTitle = `法律合规部月度工作综报 (${new Date().getMonth() + 1}月)`;
        } else if (initialSubType === InternalReportSubType.QUARTERLY) {
            const q = Math.floor((new Date().getMonth() + 3) / 3);
            newTitle = `法律合规部季度风控报告 (${new Date().getFullYear()}年Q${q})`;
        } else if (initialSubType === InternalReportSubType.ANNUAL) {
            newTitle = `法律合规部年度工作总结 (${new Date().getFullYear()}年)`;
        }
        setTitle(newTitle);

        // B. Summary & Conclusion Templates
        let newSummary = '';
        let newConclusion = '';
        
        if (targetAudience === ReportTargetAudience.BOARD) {
            newSummary = `【董事会摘要】本次汇报涉及 ${stats.total} 起案件，合计涉案金额 ${amountStr} 亿元。其中特大风险案件 ${stats.critical} 起，预计对本期净利润产生实质性影响。需重点关注...`;
            newConclusion = `建议：1. 批准对特大案件的预计负债计提方案；2. 授权管理层进行和解谈判。`;
        } else if (targetAudience === ReportTargetAudience.CRO) {
            newSummary = `【风控视角】当前业务线风险敞口合计 ${amountStr} 亿元。资产保全覆盖率为 65%，低于风控红线。主要风险集中在信用业务条线...`;
            newConclusion = `建议：1. 立即启动对担保物的补充查封；2. 暂停相关业务线的授信额度。`;
        } else if (targetAudience === ReportTargetAudience.REGULATOR) {
            newSummary = `【合规视角】本期新增监管类案件 0 起。但在办案件中发现 3 处合规操作隐患，可能引发监管问询...`;
            newConclusion = `建议：1. 对业务部门下发合规整改通知书；2. 完善相关业务合同模板。`;
        } else {
            // General
            if (initialType === InternalReportType.PERIODIC) {
                 newSummary = `本周期内，公司法律纠纷案件总数 ${stats.total} 起，涉案金额 ${amountStr} 亿元。整体风险水平${stats.critical > 0 ? '较高' : '平稳'}。`;
                 newConclusion = `建议持续监控重大案件进展，定期复盘律所代理质量。`;
            } else {
                 newSummary = `本次专项汇报共涉及 ${stats.total} 起案件，合计涉案金额人民币 ${amountStr} 亿元。其中特大风险案件 ${stats.critical} 起，整体风险可控。`;
                 newConclusion = `建议加强对上述高风险案件的节点管控，并协调财务部门提前做好资金安排。`;
            }
        }
        
        setSummary(newSummary);
        setConclusion(newConclusion);

        // C. Attachment Recommendations
        const newAttachments: {name: string, type: 'EXCEL' | 'PDF', selected: boolean}[] = [];
        
        // Always add case list
        newAttachments.push({ name: `案件明细清单_${dateStr}.xlsx`, type: 'EXCEL', selected: true });
        
        if (targetAudience === ReportTargetAudience.BOARD || stats.critical > 0) {
            newAttachments.push({ name: `重大未决诉讼进展表.xlsx`, type: 'EXCEL', selected: true });
            newAttachments.push({ name: `预计负债变动明细表.xlsx`, type: 'EXCEL', selected: true });
        }
        if (targetAudience === ReportTargetAudience.CRO) {
            newAttachments.push({ name: `风险敞口分析底稿.xlsx`, type: 'EXCEL', selected: true });
            newAttachments.push({ name: `资产保全与执行台账.xlsx`, type: 'EXCEL', selected: true });
        }
        if (targetAudience === ReportTargetAudience.REGULATOR) {
            newAttachments.push({ name: `合规风险案件清单.xlsx`, type: 'EXCEL', selected: true });
        }

        setAttachments(newAttachments);

    }, [isOpen, targetAudience, initialSubType, stats]);

    const handleConfirm = async () => {
        setIsSaving(true);
        await new Promise(r => setTimeout(r, 1000));
        
        onSave({
            title,
            type: initialType,
            subType: initialSubType,
            targetAudience: [targetAudience],
            cycle: new Date().toISOString().slice(0, 7),
            generatedAt: new Date().toISOString().split('T')[0],
            status: 'DRAFT', // Starts as draft
            metrics: {
                totalCases: stats.total,
                highRiskCount: stats.major + stats.critical,
                totalAmount: stats.totalAmount
            },
            summary,
            conclusion,
            attachments: attachments.filter(a => a.selected).map(a => a.name)
        });
        setIsSaving(false);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-slate-100 rounded-xl shadow-2xl w-full max-w-6xl flex flex-col max-h-[95vh]">
                
                {/* Header */}
                <div className="bg-white px-6 py-4 border-b border-slate-200 flex justify-between items-center rounded-t-xl shrink-0">
                    <div>
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <FileText className="w-5 h-5 text-indigo-600" /> 智能汇报编辑器 (Report Composer)
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                            {initialSubType === InternalReportSubType.CUSTOM ? '业务条线专项汇报' : '通用汇报'}模式
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    
                    {/* Left Sidebar: Configuration */}
                    <div className="w-64 bg-slate-50 border-r border-slate-200 p-4 flex flex-col gap-6 overflow-y-auto">
                        
                        {/* Audience Selector */}
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">汇报对象 (Audience)</label>
                            <div className="space-y-2">
                                {[
                                    { id: ReportTargetAudience.LEGAL_HEAD, label: '法务负责人', icon: FileText },
                                    { id: ReportTargetAudience.BOARD, label: '董事会办公室', icon: Building2 },
                                    { id: ReportTargetAudience.CRO, label: '风控管理部', icon: ShieldAlert },
                                    { id: ReportTargetAudience.REGULATOR, label: '合规管理部', icon: Scale },
                                ].map(opt => (
                                    <button
                                        key={opt.id}
                                        onClick={() => setTargetAudience(opt.id as any)}
                                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                                            targetAudience === opt.id 
                                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm font-bold' 
                                            : 'text-slate-600 hover:bg-slate-100 border border-transparent'
                                        }`}
                                    >
                                        <opt.icon className="w-4 h-4" /> {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Attachments Manager */}
                        <div className="flex-1">
                            <label className="text-xs font-bold text-slate-500 uppercase mb-2 block flex justify-between">
                                <span>附件管理</span>
                                <span className="text-[10px] bg-slate-200 px-1.5 rounded-full">{attachments.filter(a=>a.selected).length}</span>
                            </label>
                            <div className="space-y-2">
                                {attachments.map((att, idx) => (
                                    <div key={idx} className="flex items-start gap-2 p-2 bg-white border border-slate-200 rounded hover:border-indigo-300 transition-colors group">
                                        <input 
                                            type="checkbox" 
                                            checked={att.selected}
                                            onChange={() => {
                                                const newAtts = [...attachments];
                                                newAtts[idx].selected = !newAtts[idx].selected;
                                                setAttachments(newAtts);
                                            }}
                                            className="mt-1 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs font-medium text-slate-700 truncate" title={att.name}>{att.name}</div>
                                            <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                                                {att.type === 'EXCEL' ? <FileSpreadsheet className="w-3 h-3 text-green-600" /> : <FileIcon className="w-3 h-3" />}
                                                系统自动生成
                                            </div>
                                        </div>
                                        <button className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-indigo-600">
                                            <Download className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                                <button className="w-full py-2 border border-dashed border-slate-300 rounded text-xs text-slate-500 hover:text-indigo-600 hover:border-indigo-300 flex items-center justify-center gap-1">
                                    <Paperclip className="w-3 h-3" /> 添加其他附件
                                </button>
                            </div>
                        </div>

                    </div>

                    {/* Right: Paper View */}
                    <div className="flex-1 overflow-y-auto p-8 bg-slate-200/50">
                        <div className="bg-white shadow-lg border border-slate-200 p-12 min-h-[800px] mx-auto max-w-3xl font-serif text-slate-800 leading-relaxed">
                            
                            {/* Title Input */}
                            <div className="text-center mb-8 border-b-2 border-slate-800 pb-4">
                                <input 
                                    className="text-2xl font-bold text-center w-full outline-none border-b border-transparent hover:border-slate-300 focus:border-indigo-500 transition-all font-serif bg-transparent"
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                />
                                <div className="text-sm font-sans text-slate-500 mt-2 flex justify-center gap-4">
                                    <span>汇报部门：法律合规部</span>
                                    <span>密级：<span className="text-red-600 font-bold">机密</span></span>
                                    <span>日期：{new Date().toLocaleDateString()}</span>
                                </div>
                            </div>

                            {/* Section 1: Executive Summary */}
                            <div className="mb-8">
                                <h4 className="font-bold text-lg mb-3 font-sans border-l-4 border-indigo-600 pl-3">一、总体情况综述</h4>
                                <textarea 
                                    className="w-full border border-slate-200 bg-slate-50 rounded p-4 text-sm font-sans min-h-[120px] outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
                                    value={summary}
                                    onChange={e => setSummary(e.target.value)}
                                />
                            </div>

                            {/* Section 2: Statistics (Visual) */}
                            <div className="mb-8">
                                <h4 className="font-bold text-lg mb-3 font-sans border-l-4 border-indigo-600 pl-3">二、风险量化分析</h4>
                                <div className="grid grid-cols-2 gap-6 bg-white border border-slate-200 p-4 rounded-lg">
                                    {/* Text Stats */}
                                    <div className="flex flex-col justify-center space-y-4">
                                        <div className="p-4 bg-slate-50 rounded-lg">
                                            <p className="text-xs text-slate-500 font-sans font-bold">涉及总金额</p>
                                            <p className="text-xl font-bold text-slate-900 font-mono">¥ {(stats.totalAmount).toLocaleString()}</p>
                                        </div>
                                        <div className="p-4 bg-red-50 rounded-lg">
                                            <p className="text-xs text-red-500 font-sans font-bold">特大风险占比</p>
                                            <p className="text-xl font-bold text-red-700 font-mono">
                                                {selectedCases.length > 0 
                                                    ? ((stats.critical / selectedCases.length)*100).toFixed(1) 
                                                    : 0}%
                                            </p>
                                        </div>
                                    </div>
                                    {/* Chart */}
                                    <div className="h-40 relative font-sans">
                                        <p className="text-xs text-center text-slate-400 absolute w-full top-0">案件风险等级分布</p>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <RePieChart>
                                                <Pie data={stats.pieData} innerRadius={35} outerRadius={60} dataKey="value" paddingAngle={5}>
                                                    {stats.pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                                                </Pie>
                                                <Tooltip />
                                            </RePieChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>

                            {/* Section 3: Conclusion */}
                            <div>
                                <h4 className="font-bold text-lg mb-3 font-sans border-l-4 border-indigo-600 pl-3">三、拟办意见</h4>
                                <textarea 
                                    className="w-full border border-slate-200 bg-slate-50 rounded p-4 text-sm font-sans min-h-[100px] outline-none focus:ring-2 focus:ring-indigo-500"
                                    value={conclusion}
                                    onChange={e => setConclusion(e.target.value)}
                                />
                            </div>

                            {/* Section 4: Attachments List (In Paper) */}
                            <div className="mt-8 pt-8 border-t border-slate-200">
                                <h4 className="font-bold text-sm mb-3 font-sans text-slate-500">附件清单：</h4>
                                <ul className="list-disc pl-5 text-xs text-slate-600 space-y-1 font-sans">
                                    {attachments.filter(a => a.selected).map((a, i) => (
                                        <li key={i}>{a.name}</li>
                                    ))}
                                </ul>
                            </div>

                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="bg-white px-6 py-4 border-t border-slate-200 rounded-b-xl flex justify-between items-center shrink-0">
                    <span className="text-xs text-slate-400">系统自动排版 • 支持导出 Word/PDF</span>
                    <div className="flex gap-3">
                        <Button variant="outline" onClick={() => alert('已导出 Word 底稿')}>
                            <Download className="w-4 h-4 mr-2" /> 导出底稿
                        </Button>
                        <Button onClick={handleConfirm} isLoading={isSaving}>
                            <Save className="w-4 h-4 mr-2" /> 保存并提交复核
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ReportComposerModal;
