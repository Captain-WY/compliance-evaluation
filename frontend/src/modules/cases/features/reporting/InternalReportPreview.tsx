
import React, { useEffect, useState, useMemo } from 'react';
import { getCases } from '../../services/case';
import { getAllTransactions, getProvisionLogs } from '../../services/mock/finance';
import { listVendors, type VendorRecord } from '../../services/case';
import { Case, FeeTransaction, TransactionType, ProvisionLog, InternalReport } from '../../types';
import { X, FileText, Download, PieChart, TrendingUp, AlertTriangle, Gavel, Briefcase, ChevronRight } from 'lucide-react';
import Button from '../../components/ui/Button';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart as RePieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid } from 'recharts';

interface InternalReportPreviewProps {
    report: InternalReport;
    onClose: () => void;
}

const InternalReportPreview: React.FC<InternalReportPreviewProps> = ({ report, onClose }) => {
    const [loading, setLoading] = useState(true);
    const [cases, setCases] = useState<Case[]>([]);
    const [transactions, setTransactions] = useState<FeeTransaction[]>([]);
    const [provisions, setProvisions] = useState<ProvisionLog[]>([]);
    const [vendors, setVendors] = useState<VendorRecord[]>([]);

    useEffect(() => {
        const load = async () => {
            const [c, t, p, vRes] = await Promise.all([
                getCases(),
                getAllTransactions(),
                getProvisionLogs(),
                listVendors()
            ]);
            setCases(c);
            setTransactions(t);
            setProvisions(p);
            setVendors(vRes.items);
            setLoading(false);
        };
        load();
    }, []);

    // --- Dynamic Analytics ---

    // 1. Business Line Distribution
    const pieData = useMemo(() => {
        const groups: Record<string, number> = {};
        cases.forEach(c => {
            const amt = c.regulatoryAttrs?.amountNoInterest || 0;
            groups[c.businessLine] = (groups[c.businessLine] || 0) + amt;
        });
        const colors = ['#3b82f6', '#f97316', '#10b981', '#a855f7', '#ec4899'];
        return Object.entries(groups).map(([name, value], idx) => ({ 
            name, 
            value, 
            color: colors[idx % colors.length] 
        }));
    }, [cases]);

    // 2. Trend (Last 6 Months Case Count)
    const trendData = useMemo(() => {
        const months: Record<string, number> = {};
        const today = new Date();
        for(let i=5; i>=0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const key = d.toISOString().slice(0, 7); // YYYY-MM
            months[key] = 0;
        }
        
        cases.forEach(c => {
            const m = c.createdAt.slice(0, 7);
            if (months[m] !== undefined) months[m]++;
        });

        return Object.entries(months).map(([name, value]) => ({ name, value }));
    }, [cases]);

    // 3. Provision Movement (Bridge)
    const provisionBridge = useMemo(() => {
        // Mock bridge for demo: Start -> Additions -> Reversals -> End
        const totalNow = provisions.reduce((sum, p) => p.quarter === '2026-Q1' ? sum + p.newAmount : sum, 0) || 100000000;
        return [
            { name: '期初余额', value: totalNow * 0.8 },
            { name: '本期计提', value: totalNow * 0.3 },
            { name: '本期转回', value: -(totalNow * 0.1) },
            { name: '期末余额', value: totalNow }
        ];
    }, [provisions]);

    // 4. Vendor ROI (Recovered / Fees)
    const vendorROI = useMemo(() => {
        return vendors.map(v => {
            // Find cases by this vendor
            const vendorCases = cases.filter(c => c.lawyerId === v.firmId);
            const caseIds = vendorCases.map(c => c.id);
            
            // Sum Fees
            const fees = transactions
                .filter(t => caseIds.includes(t.caseId) && t.type === TransactionType.LAWYER_FEE)
                .reduce((sum, t) => sum + t.amount, 0);
            
            // Sum Recovery
            const recovery = transactions
                .filter(t => caseIds.includes(t.caseId) && t.type === TransactionType.RECOVERY_RECEIVED)
                .reduce((sum, t) => sum + t.amount, 0);

            return {
                name: v.firmName.split(' ')[0], // Short name
                fees,
                recovery,
                roi: fees > 0 ? recovery / fees : 0
            };
        }).filter(v => v.fees > 0); // Only show active vendors
    }, [vendors, cases, transactions]);

    const fmtMoney = (val: number) => `¥${(val/10000).toFixed(0)}万`;

    if (loading) return <div className="p-12 text-center text-slate-400">正在生成动态报表...</div>;

    return (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="bg-slate-900 px-6 py-4 flex justify-between items-center text-white shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-white/10 rounded-lg">
                            <FileText className="w-6 h-6 text-indigo-300" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold">{report.title}</h3>
                            <p className="text-xs text-slate-400 mt-0.5">{report.cycle} • 实时数据生成</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Document Body */}
                <div className="flex-1 overflow-y-auto bg-slate-100 p-8">
                    <div className="max-w-5xl mx-auto space-y-8">
                        
                        {/* 1. Executive Summary */}
                        <div className="bg-white p-8 rounded-lg shadow-sm border border-slate-200">
                            <h4 className="text-xl font-bold text-slate-800 mb-4 border-l-4 border-indigo-600 pl-3">
                                1. 核心摘要 (Executive Summary)
                            </h4>
                            <div className="text-sm text-slate-600 leading-7 whitespace-pre-wrap">
                                {report.summary || (
                                    <>
                                        截止本报告期末，公司存续法律纠纷案件共计 <span className="font-bold text-slate-900">{cases.length}</span> 起，
                                        涉及总金额 <span className="font-bold text-slate-900">¥{(report.metrics.totalAmount/100000000).toFixed(2)}亿</span>。
                                        其中，风险等级为“重大”及以上的案件 <span className="font-bold text-red-600">{cases.filter(c=>c.riskLevel==='重大'||c.riskLevel==='特大').length}</span> 起。
                                        本期新增案件 {trendData[trendData.length-1]?.value || 0} 起，主要集中在{pieData[0]?.name || '相关'}业务领域。
                                    </>
                                )}
                            </div>
                        </div>

                        {/* 2. Key Metrics Visualization */}
                        <div className="grid grid-cols-2 gap-6">
                            {/* Risk Dist */}
                            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                                <h5 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                                    <PieChart className="w-4 h-4 text-slate-400" /> 业务线风险敞口分布
                                </h5>
                                <div className="h-64">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RePieChart>
                                            <Pie data={pieData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                                {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                                            </Pie>
                                            <Legend verticalAlign="bottom"/>
                                            <Tooltip formatter={fmtMoney} />
                                        </RePieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                            
                            {/* Trend */}
                            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                                <h5 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                                    <TrendingUp className="w-4 h-4 text-slate-400" /> 近6个月案件新增趋势
                                </h5>
                                <div className="h-64">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={trendData}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10}} xAxisId="0" />
                                            <YAxis axisLine={false} tickLine={false} yAxisId="0" />
                                            <Tooltip />
                                            <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} xAxisId="0" yAxisId="0" />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>

                        {/* 3. Provision Bridge */}
                        <div className="bg-white p-8 rounded-lg shadow-sm border border-slate-200">
                            <h4 className="text-xl font-bold text-slate-800 mb-4 border-l-4 border-red-500 pl-3">
                                2. 预计负债变动分析 (Provision Movement)
                            </h4>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={provisionBridge}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false}/>
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} xAxisId="0" />
                                        <YAxis axisLine={false} tickLine={false} tickFormatter={fmtMoney} yAxisId="0" />
                                        <Tooltip formatter={fmtMoney} cursor={{fill: 'transparent'}} />
                                        <Bar dataKey="value" fill="#ef4444" radius={[4, 4, 0, 0]} xAxisId="0" yAxisId="0">
                                            {provisionBridge.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={index === 2 ? '#10b981' : index === 3 ? '#1e293b' : '#ef4444'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <p className="text-xs text-slate-500 mt-2 text-center">
                                * 绿色代表转回/释放，红色代表计提，深色代表期末余额。
                            </p>
                        </div>

                        {/* 4. Vendor ROI Analysis (NEW) */}
                        <div className="bg-white p-8 rounded-lg shadow-sm border border-slate-200">
                            <h4 className="text-xl font-bold text-slate-800 mb-4 border-l-4 border-emerald-500 pl-3">
                                3. 律所效能分析 (Vendor Performance)
                            </h4>
                            
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-500 font-medium">
                                        <tr>
                                            <th className="px-4 py-3">律所名称</th>
                                            <th className="px-4 py-3 text-right">律师费支出 (Cost)</th>
                                            <th className="px-4 py-3 text-right">挽回/回款金额 (Recovery)</th>
                                            <th className="px-4 py-3 text-center">费效比 (ROI)</th>
                                            <th className="px-4 py-3 w-48">效能评价</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {vendorROI.map((v, i) => (
                                            <tr key={i}>
                                                <td className="px-4 py-3 font-bold text-slate-700">{v.name}</td>
                                                <td className="px-4 py-3 text-right font-mono text-slate-600">{fmtMoney(v.fees)}</td>
                                                <td className="px-4 py-3 text-right font-mono text-emerald-600">{fmtMoney(v.recovery)}</td>
                                                <td className="px-4 py-3 text-center font-bold">1 : {v.roi.toFixed(1)}</td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                                            <div 
                                                                className={`h-full ${v.roi > 5 ? 'bg-emerald-500' : v.roi > 2 ? 'bg-blue-500' : 'bg-orange-500'}`} 
                                                                style={{width: `${Math.min(v.roi * 10, 100)}%`}}
                                                            ></div>
                                                        </div>
                                                        <span className="text-xs text-slate-400">
                                                            {v.roi > 5 ? '优异' : v.roi > 2 ? '良好' : '一般'}
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {vendorROI.length === 0 && (
                                            <tr><td colSpan={5} className="p-4 text-center text-slate-400">暂无足够的财务数据进行 ROI 分析</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* 5. Recommendations */}
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-5">
                            <h5 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                                <Gavel className="w-4 h-4" /> 综合管理建议 (Conclusion)
                            </h5>
                            <div className="text-sm text-slate-600 whitespace-pre-wrap leading-6">
                                {report.conclusion || (
                                    <ul className="list-disc list-inside space-y-2">
                                        <li>建议加强对 <span className="font-bold text-slate-800">自营业务</span> 存量债券的风险排查，特别是城投债领域。</li>
                                        <li>针对 TechNova 系列案，建议利用二审窗口期，与中小投资者进行 <span className="font-bold text-slate-800">批量和解</span>，以降低声誉风险。</li>
                                        <li>鉴于 <span className="font-bold text-slate-800">金杜律所</span> 在债券违约案件中的高 ROI 表现，建议在类似案件中优先续聘。</li>
                                    </ul>
                                )}
                            </div>
                        </div>

                        {/* 6. Attachments (NEW) */}
                        {report.attachments && report.attachments.length > 0 && (
                            <div className="bg-white border border-slate-200 rounded-lg p-5">
                                <h5 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                                    <Briefcase className="w-4 h-4" /> 附件列表 (Attachments)
                                </h5>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {report.attachments.map((att, idx) => (
                                        <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer group">
                                            <div className="p-2 bg-white rounded border border-slate-200 text-indigo-600">
                                                <FileText className="w-5 h-5" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-slate-700 text-sm truncate group-hover:text-indigo-700">{typeof att === 'string' ? att : (att as any).name}</div>
                                                <div className="text-xs text-slate-400">{typeof att === 'string' ? '文件' : (att as any).type} • {typeof att === 'string' ? '外部文件' : ((att as any).sourceData ? '系统生成' : '外部文件')}</div>
                                            </div>
                                            <Download className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                    </div>
                </div>

                {/* Footer */}
                <div className="bg-white border-t border-slate-200 px-6 py-4 flex justify-between items-center shrink-0">
                    <span className="text-xs text-slate-400">仅供内部决策参考 • 机密文件</span>
                    <div className="flex gap-3">
                        <Button variant="outline" onClick={onClose}>关闭预览</Button>
                        <Button onClick={() => alert('已生成 PDF 并发送至您的邮箱。')}>
                            <Download className="w-4 h-4 mr-2" /> 导出 PPT / Word
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InternalReportPreview;
