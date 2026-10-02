import React, { useState, useMemo } from 'react';
import { Case, BusinessLine, CaseRole, CaseStage, InternalReportType, InternalReportSubType } from '../../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { Filter, Download, Briefcase, TrendingUp, Gavel, AlertCircle, FileText, PieChart as PieIcon } from 'lucide-react';
import { formatCurrency } from '../../utils/format';
import ReportComposerModal from './ReportComposerModal';

// Helper for currency formatting if utility not available
const fmtMoney = (val: number) => {
    if (val >= 100000000) return `¥${(val / 100000000).toFixed(2)}亿`;
    if (val >= 10000) return `¥${(val / 10000).toFixed(2)}万`;
    return `¥${val}`;
};

interface BusinessAnalysisViewProps {
    cases: Case[];
}

const BusinessAnalysisView: React.FC<BusinessAnalysisViewProps> = ({ cases = [] }) => {
    const [selectedLine, setSelectedLine] = useState<BusinessLine | 'ALL'>('ALL');
    const [viewMode, setViewMode] = useState<'COUNT' | 'AMOUNT'>('AMOUNT');
    const [showReportModal, setShowReportModal] = useState(false);

    // 1. Aggregation Logic
    const stats = useMemo(() => {
        if (!cases) return [];
        const activeCases = cases.filter(c => c.stage !== CaseStage.CLOSED && c.stage !== CaseStage.ARCHIVED);
        
        const byLine: Record<string, { 
            totalCount: number; 
            totalAmount: number; 
            plaintiffCount: number; 
            defendantCount: number; 
            plaintiffAmount: number; 
            defendantAmount: number;
        }> = {};

        // Initialize
        if (BusinessLine) {
            Object.values(BusinessLine).forEach(line => {
                if (typeof line === 'string') {
                    byLine[line] = { 
                        totalCount: 0, totalAmount: 0, 
                        plaintiffCount: 0, defendantCount: 0,
                        plaintiffAmount: 0, defendantAmount: 0
                    };
                }
            });
        }

        activeCases.forEach(c => {
            const line = c.businessLine;
            if (!line || !byLine[line]) return;

            const amount = c.regulatoryAttrs?.amountNoInterest || 0;
            byLine[line].totalCount++;
            byLine[line].totalAmount += amount;

            if (c.ourRole === CaseRole.PLAINTIFF) {
                byLine[line].plaintiffCount++;
                byLine[line].plaintiffAmount += amount;
            } else if (c.ourRole === CaseRole.DEFENDANT) {
                byLine[line].defendantCount++;
                byLine[line].defendantAmount += amount;
            }
        });

        return Object.entries(byLine).map(([name, data]) => ({
            name,
            ...data
        })).sort((a, b) => b.totalAmount - a.totalAmount); // Sort by exposure descending
    }, [cases]);

    // 2. Filtered List Logic
    const filteredCases = useMemo(() => {
        if (!cases) return [];
        let result = cases.filter(c => c.stage !== CaseStage.CLOSED && c.stage !== CaseStage.ARCHIVED);
        if (selectedLine !== 'ALL') {
            result = result.filter(c => c.businessLine === selectedLine);
        }
        return result.sort((a, b) => (b.regulatoryAttrs?.amountNoInterest || 0) - (a.regulatoryAttrs?.amountNoInterest || 0));
    }, [cases, selectedLine]);

    // Chart Data Preparation (All Lines)
    const allLinesChartData = stats.map(s => ({
        name: s.name,
        '主诉': viewMode === 'AMOUNT' ? s.plaintiffAmount : s.plaintiffCount,
        '被诉': viewMode === 'AMOUNT' ? s.defendantAmount : s.defendantCount,
        total: viewMode === 'AMOUNT' ? s.totalAmount : s.totalCount
    }));

    // Specific Line Data (for Pie/Bar charts when filtered)
    const specificLineStats = stats.find(s => s.name === selectedLine);
    const specificPieData = specificLineStats ? [
        { name: '主诉 (主动维权)', value: specificLineStats.plaintiffAmount, color: '#3b82f6' },
        { name: '被诉 (被动应诉)', value: specificLineStats.defendantAmount, color: '#ef4444' }
    ] : [];
    
    const specificBarData = specificLineStats ? [
        { name: '主诉', value: specificLineStats.plaintiffCount, fill: '#3b82f6' },
        { name: '被诉', value: specificLineStats.defendantCount, fill: '#ef4444' }
    ] : [];

    // Export Handler
    const handleExport = () => {
        if (!filteredCases.length) return;

        const headers = ['案号', '案件名称', '业务条线', '我方角色', '案由', '涉案金额(元)', '当前阶段', '风险等级'];
        const csvContent = [
            headers.join(','),
            ...filteredCases.map(c => [
                `"${c.code}"`,
                `"${c.title}"`,
                c.businessLine,
                c.ourRole || '未知',
                c.cause,
                c.regulatoryAttrs?.amountNoInterest || 0,
                c.stage,
                c.riskLevel
            ].join(','))
        ].join('\n');

        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const contentBytes = new TextEncoder().encode(csvContent);
        const blob = new Blob([bom, contentBytes], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `案件清单_${selectedLine === 'ALL' ? '全部' : selectedLine}_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (!cases) return null;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            
            {/* Header / Controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div>
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-brand-600" /> 业务条线透视 (Business Lens)
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">分析各业务线的案件分布、攻守形势与风险敞口。</p>
                </div>
                
                <div className="flex items-center gap-3">
                    {/* Business Line Selector */}
                    <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200">
                        <Filter className="w-4 h-4 text-slate-400 ml-2" />
                        <select 
                            value={selectedLine}
                            onChange={(e) => setSelectedLine(e.target.value as BusinessLine | 'ALL')}
                            className="bg-transparent text-sm font-bold text-slate-700 outline-none border-none focus:ring-0 cursor-pointer py-1 pr-8"
                        >
                            <option value="ALL">全部业务条线</option>
                            {Object.values(BusinessLine).map(line => (
                                <option key={line} value={line}>{line}</option>
                            ))}
                        </select>
                    </div>

                    <div className="h-6 w-px bg-slate-200 mx-1"></div>

                    <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg">
                        <button 
                            onClick={() => setViewMode('AMOUNT')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'AMOUNT' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}
                        >
                            按金额
                        </button>
                        <button 
                            onClick={() => setViewMode('COUNT')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'COUNT' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}
                        >
                            按数量
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Charts Area */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Left: Charts (Dynamic based on selection) */}
                <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-sm h-[400px] flex flex-col">
                    <h4 className="text-sm font-bold text-slate-700 mb-4 flex justify-between items-center">
                        <span>
                            {selectedLine === 'ALL' 
                                ? `各业务线攻守形势分布 (${viewMode === 'AMOUNT' ? '金额' : '案件量'})` 
                                : `${selectedLine} - 诉讼态势分析 (Litigation Posture)`
                            }
                        </span>
                        {selectedLine === 'ALL' && <span className="text-xs font-normal text-slate-400">点击柱状图可下钻筛选</span>}
                    </h4>
                    
                    <div className="flex-1 w-full min-h-0">
                        {selectedLine === 'ALL' ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart 
                                    data={allLinesChartData} 
                                    layout="vertical" 
                                    margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                                    onClick={(data) => {
                                        const name = data?.activeLabel;
                                        if (name && allLinesChartData.some(item => item.name === name)) setSelectedLine(name as BusinessLine);
                                    }}
                                    className="cursor-pointer"
                                >
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                                    <XAxis type="number" tickFormatter={viewMode === 'AMOUNT' ? (val) => `¥${val/100000000}亿` : undefined} fontSize={10} stroke="#94a3b8" xAxisId={0} />
                                    <YAxis dataKey="name" type="category" width={80} fontSize={11} stroke="#64748b" fontWeight={500} yAxisId={0} />
                                    <Tooltip 
                                        cursor={{fill: '#f1f5f9'}}
                                        formatter={(value: number) => viewMode === 'AMOUNT' ? fmtMoney(value) : `${value} 件`}
                                        contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}}
                                    />
                                    <Legend iconType="circle" wrapperStyle={{fontSize: '12px', paddingTop: '10px'}} />
                                    <Bar dataKey="主诉" name="主动维权 (主诉)" stackId="a" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={32} />
                                    <Bar dataKey="被诉" name="被动应诉 (被诉)" stackId="a" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={32} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="grid grid-cols-2 gap-4 h-full">
                                {/* Sub-Chart 1: Amount Composition (Pie) */}
                                <div className="relative">
                                    <div className="absolute top-0 left-0 w-full text-center text-xs text-slate-500 font-bold z-10">涉案金额构成</div>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie 
                                                data={specificPieData} 
                                                innerRadius={60} 
                                                outerRadius={80} 
                                                paddingAngle={5} 
                                                dataKey="value"
                                            >
                                                {specificPieData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={fmtMoney} />
                                            <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    {/* Center Label */}
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none pb-8">
                                        <div className="text-center">
                                            <div className="text-xs text-slate-400">总金额</div>
                                            <div className="text-sm font-bold text-slate-700">
                                                {fmtMoney(specificLineStats?.totalAmount || 0)}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Sub-Chart 2: Count Comparison (Bar) */}
                                <div className="relative">
                                    <div className="absolute top-0 left-0 w-full text-center text-xs text-slate-500 font-bold z-10">案件数量对比</div>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={specificBarData} margin={{ top: 30, right: 10, left: 10, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                            <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={12} xAxisId={0} />
                                            <YAxis axisLine={false} tickLine={false} allowDecimals={false} yAxisId={0} />
                                            <Tooltip cursor={{fill: 'transparent'}} />
                                            <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={40}>
                                                {specificBarData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Key Metrics Card for Selected Line */}
                <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 shadow-sm h-[400px] flex flex-col">
                    <h4 className="text-sm font-bold text-slate-700 mb-4 flex justify-between items-center">
                        <span>{selectedLine === 'ALL' ? '全公司总览' : `${selectedLine} - 核心指标`}</span>
                        {selectedLine !== 'ALL' && (
                            <button 
                                onClick={() => setShowReportModal(true)}
                                className="text-[10px] bg-brand-100 text-brand-700 px-2 py-1 rounded hover:bg-brand-200 transition-colors flex items-center gap-1"
                            >
                                <FileText className="w-3 h-3" /> 生成简报
                            </button>
                        )}
                    </h4>
                    
                    {selectedLine === 'ALL' ? (
                        <div className="flex-1 flex flex-col justify-center items-center text-center space-y-4">
                            <div className="p-4 bg-white rounded-full shadow-sm">
                                <PieIcon className="w-8 h-8 text-slate-400" />
                            </div>
                            <p className="text-sm text-slate-500">
                                请在上方选择业务条线<br/>
                                或点击左侧图表<br/>
                                <span className="text-xs text-slate-400 mt-2 block">查看特定业务线的详细指标与报告</span>
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-6 animate-in zoom-in duration-300">
                            {/* Metric 1 */}
                            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                                <div className="text-xs text-slate-500 mb-1">累计涉案金额 (Exposure)</div>
                                <div className="text-2xl font-bold text-slate-900">
                                    {fmtMoney(stats.find(s => s.name === selectedLine)?.totalAmount || 0)}
                                </div>
                            </div>

                            {/* Metric 2 */}
                            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                                <div className="text-xs text-slate-500 mb-1">案件总数 (Volume)</div>
                                <div className="text-2xl font-bold text-slate-900">
                                    {stats.find(s => s.name === selectedLine)?.totalCount || 0} <span className="text-sm font-normal text-slate-400">件</span>
                                </div>
                            </div>

                            {/* Metric 3: Ratio */}
                            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                                <div className="text-xs text-slate-500 mb-1">主被诉比例 (A/D Ratio)</div>
                                <div className="flex items-center gap-2">
                                    <span className="text-blue-600 font-bold">
                                        {((stats.find(s => s.name === selectedLine)?.plaintiffCount || 0) / (stats.find(s => s.name === selectedLine)?.totalCount || 1) * 100).toFixed(0)}%
                                    </span>
                                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div 
                                            className="h-full bg-blue-500" 
                                            style={{width: `${((stats.find(s => s.name === selectedLine)?.plaintiffCount || 0) / (stats.find(s => s.name === selectedLine)?.totalCount || 1) * 100)}%`}}
                                        />
                                    </div>
                                    <span className="text-red-500 font-bold">
                                        {((stats.find(s => s.name === selectedLine)?.defendantCount || 0) / (stats.find(s => s.name === selectedLine)?.totalCount || 1) * 100).toFixed(0)}%
                                    </span>
                                </div>
                                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                                    <span>主动 ({stats.find(s => s.name === selectedLine)?.plaintiffCount})</span>
                                    <span>被动 ({stats.find(s => s.name === selectedLine)?.defendantCount})</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Drill-down List */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <Gavel className="w-4 h-4 text-slate-500" /> 
                        {selectedLine === 'ALL' ? '全部在办案件' : `${selectedLine} - 案件明细`}
                    </h3>
                    <div className="flex gap-2">
                         {selectedLine !== 'ALL' && (
                             <button 
                                onClick={() => setSelectedLine('ALL')}
                                className="text-xs text-slate-500 hover:text-brand-600 px-3 py-1 rounded border border-slate-200 bg-white"
                             >
                                清除筛选
                             </button>
                         )}
                         <button 
                            onClick={handleExport}
                            className="text-xs flex items-center gap-1 text-brand-600 bg-brand-50 hover:bg-brand-100 px-3 py-1 rounded border border-brand-100"
                         >
                            <Download className="w-3 h-3" /> 导出清单
                         </button>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-medium text-xs">
                            <tr>
                                <th className="px-6 py-3">案号/名称</th>
                                <th className="px-6 py-3">角色</th>
                                <th className="px-6 py-3">案由</th>
                                <th className="px-6 py-3 text-right">涉案金额</th>
                                <th className="px-6 py-3">当前阶段</th>
                                <th className="px-6 py-3">风险等级</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredCases.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-slate-400">该条线暂无符合条件的案件</td>
                                </tr>
                            ) : (
                                filteredCases.map(c => (
                                    <tr key={c.id} className="hover:bg-slate-50 group">
                                        <td className="px-6 py-3">
                                            <div className="font-medium text-slate-800 group-hover:text-brand-600">{c.title}</div>
                                            <div className="text-xs text-slate-400 font-mono">{c.code}</div>
                                        </td>
                                        <td className="px-6 py-3">
                                            <span className={`text-[10px] px-2 py-0.5 rounded border ${
                                                c.ourRole === CaseRole.PLAINTIFF 
                                                ? 'bg-blue-50 text-blue-600 border-blue-100' 
                                                : c.ourRole === CaseRole.DEFENDANT 
                                                ? 'bg-red-50 text-red-600 border-red-100'
                                                : 'bg-slate-50 text-slate-500 border-slate-200'
                                            }`}>
                                                {c.ourRole || '未知'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 text-slate-600">{c.cause}</td>
                                        <td className="px-6 py-3 text-right font-mono font-medium">
                                            {fmtMoney(c.regulatoryAttrs?.amountNoInterest || 0)}
                                        </td>
                                        <td className="px-6 py-3">
                                            <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs">
                                                {c.stage}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3">
                                            {c.riskLevel === '重大' || c.riskLevel === '特大' ? (
                                                <div className="flex items-center gap-1 text-red-600">
                                                    <AlertCircle className="w-3 h-3" /> {c.riskLevel}
                                                </div>
                                            ) : (
                                                <span className="text-slate-500">{c.riskLevel}</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Ad-Hoc Report Modal */}
            <ReportComposerModal 
                isOpen={showReportModal}
                onClose={() => setShowReportModal(false)}
                selectedCases={filteredCases}
                initialType={InternalReportType.EVENT_DRIVEN}
                initialSubType={selectedLine === 'ALL' ? InternalReportSubType.CASE_BRIEF : InternalReportSubType.CUSTOM}
                onSave={(report) => {
                    console.log('Saved report:', report);
                    setShowReportModal(false);
                    // In a real app, you'd trigger a toast or API call here
                    alert('报告已生成并保存到草稿箱');
                }}
            />
        </div>
    );
};

export default BusinessAnalysisView;
