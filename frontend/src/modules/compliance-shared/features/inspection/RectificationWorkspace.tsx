import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  FileSearch, 
  X,
  FileText,
  MessageSquare,
  Bell,
  Info,
  Library,
  ArrowRight,
  LayoutTemplate,
  BellRing,
  Building2,
  ShieldCheck,
  PenTool,
  XCircle,
  ArrowLeft,
  RefreshCw,
  Eye
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { inspectionApi, issueApi } from '../../services/api';

export default function RectificationWorkspace({ 
  isReadOnly: initialReadOnly = false, 
  defaultIssueId = '', 
  onBack 
}: { 
  isReadOnly?: boolean, 
  defaultIssueId?: string, 
  onBack?: () => void 
}) {
  const [rectificationData, setRectificationData] = useState({ stats: { total: 0, closed: 0, overdue: 0, inProgress: 0, rate: 0 }, ledger: [] as any[] });
  const [ledger, setLedger] = useState<any[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'dashboard' | 'verify'>(defaultIssueId ? 'verify' : 'dashboard');
  const [verificationFeedback, setVerificationFeedback] = useState('');
  const [isReadOnly, setIsReadOnly] = useState(initialReadOnly);
  const [selectedIssueId, setSelectedIssueId] = useState(defaultIssueId);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    inspectionApi.getRectificationWorkspace()
      .then(data => {
        if (cancelled) return;
        setRectificationData(data);
        setLedger(data.ledger);
      })
      .catch(error => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : '整改工作台加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGlobalLibraryJump = () => {
    if (onBack) {
      onBack();
    } else {
      toast.success('[路由跳转] 正在为您切换至全局视图：【中央问题库与督办大盘】...');
      navigate('/issue-hub');
    }
  };

  const handleVerify = (id: string) => {
    setSelectedIssueId(id);
    setIsReadOnly(false);
    setActiveView('verify');
  };

  const handleViewDossier = (id: string) => {
    toast.info('进入工作台 (只读模式)：机构尚未提交证据，操作按钮将锁定。');
    setSelectedIssueId(id);
    setIsReadOnly(true);
    setActiveView('verify');
  };

  const handleUrge = () => {
    toast.success('已向相关机构发送督办提醒');
  };

  const loadWorkspace = async () => {
    setLoadError(null);
    const data = await inspectionApi.getRectificationWorkspace();
    setRectificationData(data);
    setLedger(data.ledger);
  };

  const handleApprove = async () => {
    if (!selectedIssueId) return;
    await issueApi.verifyRectification(selectedIssueId, 'APPROVE');
    toast.success('✅ 已准予销号');
    await loadWorkspace();
    setActiveView('dashboard');
  };

  const handleReject = async () => {
    if (!selectedIssueId) return;
    await issueApi.verifyRectification(selectedIssueId, 'REJECT', verificationFeedback || '需补充完善整改材料');
    toast.success('❌ 已打回重改');
    await loadWorkspace();
    setActiveView('dashboard');
  };

  const renderStatusBadge = (status: string, deadline: string) => {
    if (status === 'OVERDUE') {
      return (
        <span className="inline-flex items-center text-rose-700 bg-rose-50 px-2 py-1 rounded text-xs font-bold border border-rose-200">
          <AlertCircle className="w-3.5 h-3.5 mr-1" /> ⚠️ 逾期 6 天
        </span>
      );
    }
    if (status === 'PENDING_VERIFICATION') {
      return (
        <span className="inline-flex items-center text-indigo-700 bg-indigo-50 px-2 py-1 rounded text-xs font-bold border border-indigo-200">
          <Clock className="w-3.5 h-3.5 mr-1" /> 待核实 (Pending)
        </span>
      );
    }
    if (status === 'CLOSED') {
      return (
        <span className="inline-flex items-center text-emerald-700 bg-emerald-50 px-2 py-1 rounded text-xs font-bold border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> 已销号 (Closed)
        </span>
      );
    }
    if (status === 'RECTIFYING') {
      return (
        <span className="inline-flex items-center text-amber-700 bg-amber-50 px-2 py-1 rounded text-xs font-bold border border-amber-200">
          <svg className="animate-spin -ml-1 mr-1.5 h-3 w-3 text-amber-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
             <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
             <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          整改中
        </span>
      );
    }
    return <span className="text-slate-500 font-medium text-xs">{status}</span>;
  };

  if (activeView === 'verify') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col h-screen w-full bg-slate-50 overflow-hidden">
        {/* Minimalist Top Navbar */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center px-4 shrink-0 shadow-sm z-10 w-full">
          <Button variant="ghost" size="sm" className="text-slate-500 hover:text-slate-800 -ml-2 mr-2" onClick={() => {
            if (onBack) onBack(); 
            else setActiveView('dashboard');
          }}>
            <ArrowLeft className="w-4 h-4 mr-1"/> 返回 整改大盘
          </Button>
          <span className="text-slate-300 mx-2">|</span>
          <h1 className="font-bold text-slate-800 text-sm">整改核实控制台</h1>
        </header>

        {/* Three-Column Main Container */}
        <div className="flex flex-1 h-[calc(100vh-56px)] overflow-hidden w-full">
           
           {/* Left Column (w-80) - Pending Issue Tree */}
           <aside className="w-80 bg-white border-r border-slate-200 flex flex-col h-full shrink-0">
              <div className="flex items-center px-4 py-2 bg-slate-50 text-slate-800 font-bold text-sm border-b border-slate-100">
                 <Building2 className="w-4 h-4 mr-2 text-indigo-500"/> 深圳分公司
              </div>
              <div className="flex flex-col pl-8 pr-4 py-3 cursor-pointer bg-indigo-50 border-r-2 border-indigo-600">
                 <span className="text-xs text-slate-500 mb-1">ISS-2026-002</span>
                 <span className="text-sm font-bold text-indigo-900 leading-tight">客户风险等级重估流程缺失</span>
              </div>
           </aside>

           {/* Middle Column (flex-1) - Evidence Viewer */}
           <section className="flex-1 bg-slate-200 flex flex-col h-full overflow-hidden shadow-inner">
              <div className="h-12 bg-slate-800 text-slate-300 flex items-center px-4 text-sm shrink-0">
                 <FileText className="w-4 h-4 mr-2 text-slate-400"/> 机构提交证据：重估流程修订说明.pdf
              </div>
              <div className="flex-1 overflow-auto p-8 flex justify-center">
                 {isReadOnly ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500">
                      <FileText className="w-12 h-12 mb-4 text-slate-300" />
                      <p className="text-lg font-medium">机构正在整改中，暂无最新证据文件，请查阅原始底稿。</p>
                    </div>
                 ) : (
                    <div className="w-full max-w-3xl bg-white shadow-lg min-h-[800px] p-12 ring-1 ring-slate-900/5">
                      <h2 className="text-xl font-bold text-center border-b pb-4 mb-6 text-slate-800">
                        《反洗钱风控管理办法》 2026版 (节选)
                      </h2>
                      <div className="space-y-4 text-sm text-slate-700 leading-relaxed">
                         <p className="indent-8">
                           针对此前暴露的客户风险等级重估流程缺失问题，我司经过专项研讨，现将新的内控要求固化如下：
                         </p>
                         <h3 className="font-bold text-slate-900 mt-6 mb-2">第四章 第三十二条 【高风险客户重估强制机制】</h3>
                         <p className="indent-8 bg-amber-50/50 p-4 rounded border border-amber-100">
                           (一) 对于被评定为“高风险”的客户，系统将强制启动年度重估计时器。若距上次重估超过365天，核心交易系统将在客户发起资金转出、认购新产品等关键操作时，触发 <span className="font-bold text-rose-600">硬阻断</span>。
                         </p>
                         <p className="indent-8">
                           (二) 阻断后，柜面系统或移动端主动弹窗提示客户进行风险问卷更新。未经所在营业部合规专员双人复核，不得解除限制。
                         </p>
                      </div>
                    </div>
                 )}
              </div>
           </section>

           {/* Right Column - Verification Console */}
           <aside className="w-[450px] bg-white border-l border-slate-200 flex flex-col h-full shrink-0 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.02)]">
              <div className="h-14 border-b border-slate-200 flex items-center px-5 bg-white shrink-0 shadow-sm z-10">
                 <ShieldCheck className="w-5 h-5 mr-2 text-indigo-600"/>
                 <span className="font-bold text-slate-800 text-sm">整改核实与销号</span>
              </div>
              <div className="flex-1 flex flex-col p-5 overflow-y-auto bg-slate-50 space-y-4">
                 
                 {/* Block A: Original Defect */}
                 <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm relative">
                    <h4 className="text-xs font-bold text-slate-400 mb-2">原缺陷描述</h4>
                    <p className="text-sm text-slate-700">抽查发现，机构对部分高风险客户未按年度进行风险等级重估，系统缺少强制阻断机制。</p>
                 </div>

                 {/* Block B: Branch Feedback */}
                 <div className="bg-indigo-50/50 border border-indigo-100 rounded-lg p-4 shadow-sm relative">
                    <h4 className="text-xs font-bold text-indigo-400 mb-2">机构整改说明</h4>
                    <p className="text-sm text-slate-800">已修订《反洗钱风控管理办法》，并于4月20日在柜台系统上线了高风险客户强制重估模块（见左侧截图与制度附件）。</p>
                 </div>

                 {/* Block C: Auditor's Verification */}
                 <div className="mt-auto pt-4 border-t border-slate-200">
                    <label className="text-sm font-bold text-slate-800 mb-2 flex items-center">
                       <PenTool className="w-4 h-4 mr-1.5 text-slate-500"/> 核实意见 (必填)
                    </label>
                    <Textarea 
                       data-testid="verification-comment"
                       value={verificationFeedback}
                       onChange={(e) => setVerificationFeedback(e.target.value)}
                       placeholder={isReadOnly ? "机构尚未提交整改说明，只读模式下不可填写" : "输入核实意见，如同意销号或指出需补充完善的部分..."} 
                       disabled={isReadOnly}
                       className="bg-white text-sm mb-4 min-h-[100px] border-slate-300 shadow-inner disabled:bg-slate-50 disabled:cursor-not-allowed" 
                    />
                    <div className="flex gap-3">
                       <Button data-testid="verification-reject-btn" disabled={isReadOnly} onClick={handleReject} className="w-1/2 bg-rose-600 hover:bg-rose-700 text-white h-11 shadow-sm disabled:opacity-50 disabled:pointer-events-none">
                          <XCircle className="w-4 h-4 mr-2"/> 打回重改
                       </Button>
                       <Button data-testid="verification-approve-btn" disabled={isReadOnly} onClick={handleApprove} className="w-1/2 bg-emerald-500 hover:bg-emerald-600 text-white h-11 shadow-sm disabled:opacity-50 disabled:pointer-events-none">
                          <CheckCircle2 className="w-4 h-4 mr-2"/> 准予销号
                       </Button>
                    </div>
                 </div>

              </div>
           </aside>

        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      
      {/* Cross-Lifecycle Bridge */}
      <div className="mb-4 flex justify-end">
        <Button onClick={handleGlobalLibraryJump} variant="link" className="text-indigo-600 hover:text-indigo-800 text-sm">
          <Library className="w-4 h-4 mr-1"/> 前往【中央问题库与督办大盘】进行跨项目长效追踪 <ArrowRight className="w-3 h-3 ml-1"/>
        </Button>
      </div>

      {/* Section 1: 整改执行看板 (Rectification Pulse Dashboard) */}
      {loadError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {loadError}
        </div>
      )}
      <section>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Card 1: 全部问题 */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col items-center justify-center text-center shadow-sm">
            <span className="text-slate-500 font-medium text-sm mb-1">全部发现问题</span>
            <span className="text-3xl font-black text-slate-700">{rectificationData.stats.total}</span>
          </div>
          
          {/* Card 2: 已销号 */}
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 flex flex-col items-center justify-center text-center shadow-sm relative overflow-hidden">
            <div className="absolute -right-4 -top-4 w-16 h-16 bg-emerald-100/50 rounded-full blur-xl"></div>
            <span className="text-emerald-700 font-semibold text-sm mb-1 flex items-center">
              <CheckCircle2 className="w-4 h-4 mr-1.5" /> 已销号
            </span>
            <span className="text-3xl font-black text-emerald-600">{rectificationData.stats.closed}</span>
          </div>

          {/* Card 3: 待核实 */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 flex flex-col items-center justify-center text-center shadow-sm ring-1 ring-indigo-500/20 relative">
            <span className="text-indigo-700 font-semibold text-sm mb-1 flex items-center">
              <Clock className="w-4 h-4 mr-1.5" /> 待核实 (当前工作)
            </span>
            <span className="text-3xl font-black text-indigo-600">{rectificationData.stats.inProgress}</span>
            <div className="absolute top-2 right-2 w-2 h-2 bg-indigo-500 rounded-full animate-ping"></div>
          </div>

          {/* Card 4: 已逾期 */}
          <div className="bg-rose-100 border border-rose-200 rounded-xl p-5 flex flex-col items-center justify-center text-center shadow-md relative overflow-hidden animate-[pulse_3s_ease-in-out_infinite]">
            <div className="absolute inset-0 bg-gradient-to-br from-rose-500/10 to-transparent pointer-events-none"></div>
            <span className="text-rose-800 font-bold text-sm mb-1 flex items-center z-10">
              <AlertCircle className="w-4 h-4 mr-1.5" /> 已逾期问题
            </span>
            <span className="text-3xl font-black text-rose-700 z-10">{rectificationData.stats.overdue}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center justify-between">
           <div className="flex-1 mr-6">
             <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-bold text-slate-700">整体整改完成率</span>
                <span className="text-sm font-bold text-emerald-600">{rectificationData.stats.rate}%</span>
             </div>
             <div className="w-full bg-slate-100 rounded-full h-2 mb-1 overflow-hidden">
                <div className="bg-emerald-500 h-2 rounded-full transition-all duration-1000 relative" style={{ width: `${rectificationData.stats.rate}%` }}>
                   <div className="absolute inset-0 bg-white/20 w-full h-full animate-[shimmer_2s_infinite]"></div>
                </div>
             </div>
           </div>
           <div className="flex-shrink-0 text-xs text-slate-500 font-medium">
             目标: 100% 闭环
           </div>
        </div>
      </section>

      {/* Section 2: 整改动态监控台 (The Live Ledger) */}
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
         <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h3 className="text-base font-bold text-slate-800">整改问题台账 (Live Ledger)</h3>
         </div>
         <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                 <tr>
                    <th className="px-5 py-3 w-48">问题编号 & 机构</th>
                    <th className="px-5 py-3">缺陷摘要</th>
                    <th className="px-5 py-3 w-40">截止日期 & 状态</th>
                    <th className="px-5 py-3 w-32 text-center">整改证据</th>
                    <th className="px-5 py-3 w-36 text-center">核心操作</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white relative">
                 <AnimatePresence>
                   {ledger.map((item) => (
                     <motion.tr 
                       layout
                       initial={{ opacity: 0, y: 10 }}
                       animate={{ opacity: 1, y: 0 }}
                       exit={{ opacity: 0, scale: 0.95 }}
                       key={item.issueId} 
                       className="hover:bg-slate-50/50 transition-colors group"
                     >
                        <td className="px-5 py-4">
                           <div className="font-semibold text-slate-800">{item.issueId}</div>
                           <div className="text-slate-500 text-xs mt-0.5">{item.branchName}</div>
                        </td>
                        <td className="px-5 py-4">
                           <div className="flex items-center">
                              <span className="font-medium text-slate-700 truncate max-w-[200px] xl:max-w-xs">{item.description}</span>
                              <div className="relative inline-block ml-2 group/tooltip">
                                 <Info className="w-4 h-4 text-slate-400 hover:text-indigo-500 cursor-pointer" />
                                 <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-max max-w-xs px-3 py-2 bg-slate-800 text-white text-xs rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity z-10 shadow-lg">
                                    {item.description}
                                    <svg className="absolute text-slate-800 h-2 w-full left-0 top-full" x="0px" y="0px" viewBox="0 0 255 255"><polygon className="fill-current" points="0,0 127.5,127.5 255,0"/></svg>
                                 </div>
                              </div>
                           </div>
                        </td>
                        <td className="px-5 py-4">
                           <div className="text-slate-500 text-xs mb-1.5 font-medium">{item.deadline}</div>
                           {renderStatusBadge(item.status, item.deadline)}
                        </td>
                        <td className="px-5 py-4 text-center">
                           {item.evidenceCount > 0 ? (
                              <div className="inline-flex items-center px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md text-xs font-semibold border border-slate-200 hover:bg-slate-200 transition-colors cursor-pointer">
                                 <FileSearch className="w-3.5 h-3.5 mr-1 text-indigo-500" />
                                 {item.evidenceCount} 份凭证
                              </div>
                           ) : (
                              <span className="text-slate-400 text-xs font-medium">—</span>
                           )}
                        </td>
                        <td className="px-5 py-4 text-center">
                           {item.status === 'PENDING_VERIFICATION' ? (
                             <Button onClick={() => handleVerify(item.branchId)} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm h-8 px-3 text-xs rounded w-full">
                               <LayoutTemplate className="w-3.5 h-3.5 mr-1.5"/> 进入工作台核实
                             </Button>
                           ) : item.status === 'OVERDUE' ? (
                             <Button onClick={handleUrge} variant="outline" className="border-rose-200 text-rose-600 bg-rose-50 hover:bg-rose-100 h-8 px-3 text-xs rounded w-full">
                               <BellRing className="w-3.5 h-3.5 mr-1.5"/> 督办提醒
                             </Button>
                           ) : item.status === 'CLOSED' ? (
                             <span className="text-slate-400 text-xs flex items-center justify-center">
                               <CheckCircle2 className="w-3.5 h-3.5 mr-1"/> 准予销号
                             </span>
                           ) : item.status === 'RECTIFYING' ? (
                             <Button variant="ghost" size="sm" onClick={() => handleViewDossier(item.branchId)} className="text-slate-500 hover:text-indigo-600 font-medium w-full transition-colors">
                               <Eye className="w-4 h-4 mr-1.5"/> 查看案卷
                             </Button>
                           ) : (
                             <button className="inline-flex items-center justify-center w-full px-3 py-1.5 text-slate-600 hover:bg-slate-100 text-xs font-semibold rounded transition-colors">
                               查看详情
                             </button>
                           )}
                        </td>
                     </motion.tr>
                   ))}
                 </AnimatePresence>
              </tbody>
            </table>
         </div>
      </section>

    </div>
  );
}
