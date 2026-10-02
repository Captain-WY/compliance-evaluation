import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Building2, 
  AlertTriangle, 
  FileSearch, 
  ShieldCheck, 
  Scale, 
  History, 
  MessageSquare, 
  Gavel, 
  CheckCircle2, 
  XCircle, 
  ImageIcon,
  Lock,
  PartyPopper,
  Send,
  UploadCloud
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface AppealWorkspaceProps {
  onBack?: () => void;
  isArchived?: boolean;
}

interface Issue {
  id: string;
  title: string;
  risk: string;
  finding: string;
  defense: string;
  status: 'pending' | 'adopted' | 'rejected';
}

const initialIssues: Issue[] = [
  {
    id: 'PRE-001',
    title: '上海分公司大堂未按要求公示最新代销产品费率',
    risk: 'HIGH',
    finding: '在抽查1月份的大堂营业环境时发现，大堂展示的费率表仍为2025年旧版，且未见大堂经理主动出示新版说明。',
    defense: '',
    status: 'pending'
  },
  {
    id: 'PRE-002',
    title: '客户风险等级重估流程缺失关键签字',
    risk: 'MEDIUM',
    finding: '抽查20份客户风险等级重估表，其中3份缺失客户本人手写签字。',
    defense: '',
    status: 'pending'
  }
];

export default function AppealWorkspace({ onBack, isArchived }: AppealWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'original'>('original');
  const [issues, setIssues] = useState<Issue[]>(initialIssues);
  const [selectedId, setSelectedId] = useState<string>('PRE-001');
  const [reasoning, setReasoning] = useState('');
  const [errorShake, setErrorShake] = useState(false);

  const handleSubmit = (action: 'agree' | 'appeal') => {
    if (action === 'appeal') {
      if (!reasoning.trim()) {
        setErrorShake(true);
        setTimeout(() => setErrorShake(false), 500);
        return;
      }
      toast.success(`✅ 申辩已提交：${selectedIssue?.title}`);
    } else {
      toast.success(`✅ 无异议已确认：${selectedIssue?.title}`);
    }
    
    // Simulate moving to next.
    onBack?.();
  };

  const selectedIssue = issues.find(i => i.id === selectedId);
  const allDone = issues.every(i => i.status !== 'pending') && !isArchived;

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 overflow-hidden">
      {/* Minimalist Top Navbar */}
      <header className="h-14 bg-white border-b border-slate-200 flex items-center px-4 shrink-0 shadow-sm z-10 w-full">
        <Button variant="ghost" size="sm" className="text-slate-500 hover:text-slate-800 -ml-2 mr-2" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1"/> 返回 结论核对与申辩
        </Button>
        <span className="text-slate-300 mx-2">|</span>
        <h1 className="font-bold text-slate-800 text-sm">{isArchived ? '2026年Q1财富管理条线常规检查' : '2026年反洗钱(AML)专项现场检查'}</h1>
      </header>

      {isArchived && (
        <div className="bg-slate-800 text-slate-200 text-xs py-2 px-4 flex items-center justify-center shrink-0 w-full shadow-sm z-20">
          <Lock className="w-3.5 h-3.5 mr-2 text-amber-400"/> 该检查项目已结束并归档，当前为只读视图，所有底层数据、证据与裁决结论均不可篡改。
        </div>
      )}

      {/* Three-Column Main Container */}
      <div className="flex flex-1 h-[calc(100vh-56px)] overflow-hidden w-full">
        {/* Column 1: Left Sidebar (w-80) Issue Navigation Tree */}
        <aside className="w-80 bg-white border-r border-slate-200 flex flex-col h-full shrink-0">
          <div className="h-12 border-b border-slate-100 flex items-center px-4 font-bold text-slate-700 text-sm bg-slate-50/50">
            待核对案卷
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            <div className="flex flex-col">
              {/* Level 1 (Branch) */}
              <div className="flex items-center px-4 py-2 bg-slate-50 text-slate-800 font-bold text-sm border-b border-slate-100">
                <Building2 className="w-4 h-4 mr-2 text-indigo-500"/> 上海分公司
              </div>
              
              {/* Level 2 Issues */}
              {issues.map(issue => (
                <div key={issue.id} onClick={() => setSelectedId(issue.id)} className={`flex items-start pl-8 pr-4 py-3 cursor-pointer ${selectedId === issue.id ? 'bg-indigo-50 border-r-2 border-indigo-600' : 'hover:bg-slate-50 border-b border-slate-50'}`}>
                  <AlertTriangle className={`w-4 h-4 mr-2 shrink-0 mt-0.5 ${issue.status === 'pending' ? (issue.risk === 'HIGH' ? 'text-rose-500' : 'text-amber-500') : 'text-slate-300'}`}/>
                  <div className="flex flex-col gap-1 w-full">
                    <span className={`text-sm font-bold leading-tight ${selectedId === issue.id ? 'text-indigo-900' : (issue.status === 'pending' ? 'text-slate-700' : 'text-slate-400')}`}>
                      {issue.title}
                    </span>
                    <div className="flex items-center">
                      <Badge className={`w-fit text-[10px] scale-90 border-transparent px-1.5 origin-left ${issue.status === 'pending' ? (issue.risk === 'HIGH' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700') : 'bg-slate-100 text-slate-500'}`}>
                        {issue.risk}
                      </Badge>
                      {issue.status === 'adopted' && <Badge className="bg-emerald-50 text-emerald-600 border-emerald-200 ml-2 scale-75 origin-left">已确认</Badge>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Column 2: Middle Document Reader (flex-1) Dual-Source Evidence Viewer */}
        <section className="flex-1 bg-slate-100 flex flex-col h-full overflow-hidden shadow-inner">
          {/* Viewer Body */}
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="h-12 bg-slate-800 border-b border-slate-700 text-slate-300 flex items-center justify-between px-4 text-sm shrink-0 shadow-md z-10 w-full">
               <div className="flex items-center">
                  <FileSearch className="w-4 h-4 mr-2 text-slate-400"/> 
                  交易明细表.xlsx
               </div>
            </div>
            <div className="flex-1 overflow-auto p-8 flex justify-center">
              <div className="w-full max-w-3xl bg-white shadow-lg min-h-[800px] p-12 ring-1 ring-slate-900/5">
                <h2 className="text-xl font-bold text-center border-b pb-4 mb-6">
                   总部初审底稿检验证据
                </h2>
                <div className="aspect-video bg-slate-100 border-2 border-dashed border-slate-300 rounded flex items-center justify-center text-slate-400">
                  <ImageIcon className="w-8 h-8 mr-2"/> 
                  电子底稿预览区
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Column 3: Audit Console (Right - w-[450px]) */}
        <aside className="w-[450px] bg-white border-l border-slate-200 flex flex-col h-full shrink-0 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.02)]">
          <div className="h-14 border-b border-slate-200 flex items-center px-5 bg-white shrink-0 shadow-sm z-10">
            <Scale className="w-5 h-5 mr-2 text-indigo-600"/>
            <span className="font-bold text-slate-800 text-sm">核对与申辩工作台</span>
          </div>
          
          <div className="flex-1 flex flex-col p-5 overflow-y-auto bg-slate-50/50">
            {allDone ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-10">
                <PartyPopper className="w-12 h-12 text-indigo-200 mb-4"/>
                <h3 className="text-lg font-bold text-slate-700">全部核对完毕</h3>
                <p className="text-sm text-slate-400 mt-2">该项目下所有事项处理完成。</p>
                <Button variant="outline" className="mt-6 border-indigo-200 text-indigo-600" onClick={onBack}>返回列表</Button>
              </div>
            ) : selectedIssue ? (
              <>
                <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl flex flex-col gap-4 mb-6 shadow-sm">
                  <div className="flex justify-between items-start border-b border-slate-200 pb-3">
                    <h3 className="font-bold text-slate-800 text-base leading-snug">大额交易未按规定上报</h3>
                    <Badge className="bg-rose-100 text-rose-700 shrink-0 ml-2">HIGH 高风险</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-y-3 text-sm">
                     <div className="flex flex-col"><span className="text-slate-400 text-xs">业务条线</span><span className="text-slate-700 font-medium">财富管理</span></div>
                     <div className="flex flex-col"><span className="text-slate-400 text-xs">发生日期</span><span className="text-slate-700 font-medium">2026-03-22</span></div>
                     <div className="flex flex-col col-span-2"><span className="text-slate-400 text-xs">操作风险编号</span><span className="text-slate-700 font-medium font-mono text-xs">LDC_20190610152431731</span></div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-slate-400 text-xs mb-1">违规事实描述</span>
                    <p className="text-slate-700 text-sm leading-relaxed bg-white p-3 rounded border border-slate-100">
                      在抽查1月份的大额交易流水时发现...
                    </p>
                  </div>
                  <div className="flex flex-col mt-2">
                    <span className="text-slate-400 text-xs mb-1">必须采取的整改动作</span>
                    <p className="text-slate-700 text-sm leading-relaxed bg-indigo-50/50 p-3 rounded border border-indigo-100 text-indigo-900">
                      立即补充大额交易未报送的说明报告...
                    </p>
                  </div>
                </div>

                <div className={`space-y-4 ${isArchived ? 'opacity-50 pointer-events-none' : ''}`}>
                  <h3 className="text-sm font-bold text-slate-800 mb-2">发起申辩 (可选)</h3>
                  <div>
                     <label className="block text-sm font-bold text-slate-700 mb-2 mt-4">申辩理由说明 <span className="text-rose-500">*</span></label>
                     <Textarea 
                       className={`min-h-[120px] bg-white text-sm shadow-inner resize-none ${errorShake && !reasoning.trim() ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-300'}`} 
                       placeholder="请基于客观事实，详细陈述您对上述定性哪一部分存在异议..."
                       value={reasoning}
                       onChange={e => setReasoning(e.target.value)}
                     />
                  </div>

                  <div>
                    <span className="text-sm font-bold text-slate-700 mb-2 mt-4 block">补充佐证附件</span>
                    <div className="border-2 border-dashed border-slate-200 rounded-lg p-5 flex flex-col items-center justify-center bg-slate-50 hover:bg-indigo-50 cursor-pointer text-slate-500 mt-2 transition-colors group">
                      <UploadCloud className="w-6 h-6 mb-2 text-slate-400 group-hover:text-indigo-500" />
                      <span className="text-xs font-medium group-hover:text-indigo-600">点击或拖拽文件上传</span>
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </div>
          
          {!isArchived && selectedIssue && (
            <div className="p-5 border-t border-slate-200 bg-white flex gap-3 mt-auto shrink-0 shadow-[0_-4px_10px_-4px_rgba(0,0,0,0.05)]">
               <Button variant="outline" onClick={() => handleSubmit('agree')} className="flex-1 h-11 border-emerald-500 text-emerald-600 hover:bg-emerald-50 bg-white font-bold">
                 <CheckCircle2 className="w-4 h-4 mr-2"/> 无异议，确认接收
               </Button>
               <Button onClick={() => handleSubmit('appeal')} className="flex-1 h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md">
                 <Send className="w-4 h-4 mr-2"/> 提交申辩
               </Button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
