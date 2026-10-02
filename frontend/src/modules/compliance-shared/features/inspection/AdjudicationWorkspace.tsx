import React, { useEffect, useMemo, useState } from 'react';
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
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { inspectionApi } from '../../services/api';

interface AppealFile {
  fileId?: string;
  fileName?: string;
  contentType?: string;
}

interface AppealIssue {
  title?: string;
  description?: string;
  riskLevel?: string;
}

interface AppealDecision {
  decision?: string;
  decisionReason?: string;
  decidedByName?: string;
  decidedAt?: string;
}

interface AppealItem {
  appealId?: string;
  id?: string;
  issueId?: string;
  branchId?: string;
  branchName?: string;
  reason?: string;
  status?: string;
  files?: AppealFile[];
  fileIds?: string[];
  issue?: AppealIssue;
  decision?: AppealDecision | null;
}

interface AdjudicationWorkspaceProps {
  inspectionPlanId: string;
  onBack?: () => void;
  isArchived?: boolean;
}

export default function AdjudicationWorkspace({
  inspectionPlanId,
  onBack,
  isArchived = false,
}: AdjudicationWorkspaceProps) {
  const [appeals, setAppeals] = useState<AppealItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAppealId, setSelectedAppealId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'original' | 'defense'>('defense');
  const [reasoning, setReasoning] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorShake, setErrorShake] = useState(false);

  const loadAppeals = async () => {
    setLoading(true);
    try {
      const data = await inspectionApi.getAppeals({
        inspectionPlanId: inspectionPlanId,
        pageSize: '100',
      });
      const items: AppealItem[] = (data as any)?.items ?? [];
      setAppeals(items);
      if (items.length > 0) {
        const firstPending = items.find(
          i => i.status === 'SUBMITTED' || i.status === 'UNDER_ADJUDICATION'
        );
        const target = firstPending ?? items[0];
        setSelectedAppealId(target.appealId ?? target.id ?? null);
      } else {
        setSelectedAppealId(null);
      }
    } catch (err) {
      console.error('Failed to load appeals', err);
      toast.error('加载申辩数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAppeals();
  }, [inspectionPlanId]);

  const groupedByBranch = useMemo(() => {
    const map: Record<string, AppealItem[]> = {};
    appeals.forEach(a => {
      const key = a.branchId ?? a.branchName ?? '未知机构';
      if (!map[key]) map[key] = [];
      map[key].push(a);
    });
    return Object.entries(map).map(([branchId, items]) => ({
      branchId,
      branchName: items[0].branchName ?? branchId,
      items,
    }));
  }, [appeals]);

  const selectedAppeal = useMemo(
    () => appeals.find(a => (a.appealId ?? a.id) === selectedAppealId) ?? null,
    [appeals, selectedAppealId]
  );

  const allDone = useMemo(
    () =>
      appeals.length > 0 &&
      appeals.every(a => a.status !== 'SUBMITTED' && a.status !== 'UNDER_ADJUDICATION'),
    [appeals]
  );

  const handleDecide = async (decision: 'ADOPTED' | 'REJECTED') => {
    if (!reasoning.trim()) {
      setErrorShake(true);
      setTimeout(() => setErrorShake(false), 500);
      return;
    }
    const appealId = selectedAppeal?.appealId ?? selectedAppeal?.id;
    if (!appealId) return;
    setSubmitting(true);
    try {
      await inspectionApi.decideAppeal(appealId, decision, reasoning);
      toast.success(
        decision === 'ADOPTED' ? '✅ 已采纳申辩（撤销缺陷）' : '✅ 已驳回申辩（维持原判）'
      );
      setReasoning('');
      await loadAppeals();
    } catch (err) {
      toast.error('裁决提交失败', {
        description: err instanceof Error ? err.message : '请稍后重试',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const planTitle = inspectionPlanId;

  if (loading) {
    return (
      <div className="flex flex-col h-full w-full bg-slate-50 overflow-hidden items-center justify-center">
        <div className="text-slate-500">加载申辩数据中...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-slate-50 overflow-hidden">
      {/* Top Navbar */}
      <header className="h-14 bg-white border-b border-slate-200 flex items-center px-4 shrink-0 shadow-sm z-10 w-full">
        <Button
          variant="ghost"
          size="sm"
          className="text-slate-500 hover:text-slate-800 -ml-2 mr-2"
          onClick={onBack}
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> 返回 申辩与裁决中心
        </Button>
        <span className="text-slate-300 mx-2">|</span>
        <h1 className="font-bold text-slate-800 text-sm truncate">
          {isArchived ? '归档项目' : '裁决工作台'} · {planTitle}
        </h1>
      </header>

      {isArchived && (
        <div className="bg-slate-800 text-slate-200 text-xs py-2 px-4 flex items-center justify-center shrink-0 w-full shadow-sm z-20">
          <Lock className="w-3.5 h-3.5 mr-2 text-amber-400" />
          该检查项目已结束并归档，当前为只读视图，所有底层数据、证据与裁决结论均不可篡改。
        </div>
      )}

      {/* Three-Column Main Container */}
      <div className="flex flex-1 overflow-hidden w-full">
        {/* Column 1: Left Sidebar */}
        <aside className="w-80 bg-white border-r border-slate-200 flex flex-col h-full shrink-0">
          <div className="h-12 border-b border-slate-100 flex items-center px-4 font-bold text-slate-700 text-sm bg-slate-50/50">
            案卷目录
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {groupedByBranch.length === 0 ? (
              <div className="px-4 py-8 text-center text-slate-400 text-sm">暂无申辩记录</div>
            ) : (
              groupedByBranch.map(group => (
                <div key={group.branchId} className="flex flex-col">
                  <div className="flex items-center px-4 py-2 bg-slate-50 text-slate-800 font-bold text-sm border-b border-slate-100">
                    <Building2 className="w-4 h-4 mr-2 text-indigo-500" /> {group.branchName}
                  </div>
                  {group.items.map(appeal => {
                    const id = appeal.appealId ?? appeal.id ?? '';
                    const isSelected = selectedAppealId === id;
                    const pending =
                      appeal.status === 'SUBMITTED' ||
                      appeal.status === 'UNDER_ADJUDICATION';
                    const risk = appeal.issue?.riskLevel ?? 'MEDIUM';
                    return (
                      <div
                        key={id}
                        onClick={() => setSelectedAppealId(id)}
                        className={`flex items-start pl-8 pr-4 py-3 cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-50 border-r-2 border-indigo-600'
                            : 'hover:bg-slate-50 border-b border-slate-50'
                        }`}
                      >
                        <AlertTriangle
                          className={`w-4 h-4 mr-2 shrink-0 mt-0.5 ${
                            pending
                              ? risk === 'HIGH'
                                ? 'text-rose-500'
                                : 'text-amber-500'
                              : 'text-slate-300'
                          }`}
                        />
                        <div className="flex flex-col gap-1 w-full">
                          <span
                            className={`text-sm font-bold leading-tight ${
                              isSelected
                                ? 'text-indigo-900'
                                : pending
                                  ? 'text-slate-700'
                                  : 'text-slate-400'
                            }`}
                          >
                            {appeal.issue?.title ?? '未命名缺陷'}
                          </span>
                          <div className="flex items-center">
                            <Badge
                              className={`w-fit text-[10px] scale-90 border-transparent px-1.5 origin-left ${
                                pending
                                  ? risk === 'HIGH'
                                    ? 'bg-rose-100 text-rose-700'
                                    : 'bg-amber-100 text-amber-700'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {risk}
                            </Badge>
                            {appeal.status === 'ADOPTED' && (
                              <Badge className="bg-emerald-50 text-emerald-600 border-emerald-200 ml-2 scale-75 origin-left">
                                已撤销
                              </Badge>
                            )}
                            {appeal.status === 'REJECTED' && (
                              <Badge className="bg-rose-50 text-rose-600 border-rose-200 ml-2 scale-75 origin-left">
                                维持原判
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Column 2: Middle Document Reader */}
        <section className="flex-1 bg-slate-100 flex flex-col h-full overflow-hidden shadow-inner">
          <div className="h-14 bg-slate-800 flex items-center justify-center px-4 shrink-0 shadow-md z-10 gap-2">
            <Button
              size="sm"
              onClick={() => setActiveTab('original')}
              className={
                activeTab === 'original'
                  ? 'bg-indigo-500 text-white hover:bg-indigo-600 shadow-sm'
                  : 'bg-slate-700 text-white hover:bg-slate-600 border border-slate-600'
              }
            >
              <FileSearch className="w-4 h-4 mr-2" /> 总部初审底稿 (原案)
            </Button>
            <Button
              size="sm"
              onClick={() => setActiveTab('defense')}
              className={
                activeTab === 'defense'
                  ? 'bg-indigo-500 text-white hover:bg-indigo-600 shadow-sm'
                  : 'bg-slate-700 text-white hover:bg-slate-600 border border-slate-600'
              }
            >
              <ShieldCheck className="w-4 h-4 mr-2" /> 机构补充证据 (申辩)
            </Button>
          </div>

          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="h-12 bg-slate-800 border-t border-slate-700 text-slate-300 flex items-center px-4 text-sm shrink-0">
              <FileSearch className="w-4 h-4 mr-2 text-slate-400" />
              {activeTab === 'original'
                ? selectedAppeal?.issue?.title ?? '总部初审底稿'
                : '机构补充证据材料'}
            </div>
            <div className="flex-1 overflow-auto p-8 flex justify-center">
              <div className="w-full max-w-2xl bg-white shadow-lg min-h-[600px] p-8 ring-1 ring-slate-900/5">
                {activeTab === 'original' ? (
                  <div>
                    <h2 className="text-lg font-bold text-slate-800 border-b pb-4 mb-6">
                      总部初审事实认定
                    </h2>
                    <div className="space-y-4">
                      <div className="text-sm text-slate-500 font-bold">缺陷标题</div>
                      <p className="text-base text-slate-800 font-medium">
                        {selectedAppeal?.issue?.title ?? '未选择缺陷'}
                      </p>
                      <div className="text-sm text-slate-500 font-bold mt-6">初审事实描述</div>
                      <p className="text-sm text-slate-700 leading-relaxed">
                        {selectedAppeal?.issue?.description ?? '暂无初审事实描述。'}
                      </p>
                      {selectedAppeal?.issue?.riskLevel && (
                        <div className="mt-4">
                          <Badge
                            className={
                              selectedAppeal.issue.riskLevel === 'HIGH'
                                ? 'bg-rose-100 text-rose-700'
                                : selectedAppeal.issue.riskLevel === 'MEDIUM'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-slate-100 text-slate-600'
                            }
                          >
                            风险等级: {selectedAppeal.issue.riskLevel}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div>
                    <h2 className="text-lg font-bold text-slate-800 border-b pb-4 mb-6">
                      机构补充证据与申辩材料
                    </h2>
                    {selectedAppeal?.files && selectedAppeal.files.length > 0 ? (
                      <div className="space-y-3">
                        {selectedAppeal.files.map((file, idx) => (
                          <div
                            key={file.fileId ?? idx}
                            className="flex items-center p-3 bg-slate-50 border border-slate-200 rounded-lg"
                          >
                            <FileText className="w-5 h-5 mr-3 text-indigo-500" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-slate-700 truncate">
                                {file.fileName ?? '未命名文件'}
                              </div>
                              <div className="text-xs text-slate-400">
                                {file.contentType ?? '未知类型'}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="aspect-video bg-slate-100 border-2 border-dashed border-slate-300 rounded flex flex-col items-center justify-center text-slate-400">
                        <ImageIcon className="w-8 h-8 mb-2" />
                        <p>机构未上传补充证据</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Column 3: Right Adjudication Panel */}
        <aside className="w-[450px] bg-white border-l border-slate-200 flex flex-col h-full shrink-0 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.02)]">
          <div className="h-14 border-b border-slate-200 flex items-center px-5 bg-white shrink-0 shadow-sm z-10">
            <Scale className="w-5 h-5 mr-2 text-indigo-600" />
            <span className="font-bold text-slate-800 text-sm">申辩核对与裁决</span>
          </div>

          <div className="flex-1 flex flex-col p-5 overflow-y-auto bg-slate-50 space-y-4">
            {allDone && !isArchived ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-10">
                <PartyPopper className="w-12 h-12 text-indigo-200 mb-4" />
                <h3 className="text-lg font-bold text-slate-700">该项目裁决完毕</h3>
                <p className="text-sm text-slate-400 mt-2">
                  所有申辩案件已处理完成，请返回大盘或处理下一家。
                </p>
                <Button
                  variant="outline"
                  className="mt-6 border-indigo-200 text-indigo-600"
                  onClick={onBack}
                >
                  返回大盘列表
                </Button>
              </div>
            ) : selectedAppeal ? (
              <>
                {/* Block A: Original Finding */}
                <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-1 rounded-bl uppercase">
                    Original Finding
                  </div>
                  <h4 className="text-xs font-bold text-slate-400 mb-2 flex items-center">
                    <History className="w-3.5 h-3.5 mr-1" /> 总部初审事实
                  </h4>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {selectedAppeal.issue?.description ?? '暂无初审事实。'}
                  </p>
                </div>

                {/* Block B: Branch Defense */}
                <div className="bg-indigo-50/50 border border-indigo-100 rounded-lg p-4 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 bg-indigo-100 text-indigo-600 text-[10px] font-bold px-2 py-1 rounded-bl uppercase">
                    Branch Defense
                  </div>
                  <h4 className="text-xs font-bold text-indigo-400 mb-2 flex items-center">
                    <MessageSquare className="w-3.5 h-3.5 mr-1" /> 机构申辩理由
                  </h4>
                  <p className="text-sm text-slate-800 leading-relaxed">
                    {selectedAppeal.reason ?? '机构未填写申辩理由。'}
                  </p>
                </div>

                {/* Block C: The Gavel Actions */}
                <div className="mt-auto pt-4 border-t border-slate-200">
                  <label className="text-sm font-bold text-slate-800 mb-2 flex items-center">
                    <Gavel className="w-4 h-4 mr-1.5 text-slate-500" /> 总部最终裁决
                  </label>

                  {isArchived ? (
                    <div className="bg-slate-100 border border-slate-200 rounded-lg p-4 text-sm text-slate-700">
                      <div className="font-bold mb-2 text-slate-500 flex items-center">
                        <Lock className="w-4 h-4 mr-1.5" /> 已归档
                      </div>
                      <p>该项目已结束归档，不可进行新的裁决操作。</p>
                    </div>
                  ) : selectedAppeal.status === 'ADOPTED' ||
                    selectedAppeal.status === 'REJECTED' ? (
                    <div className="bg-slate-100 border border-slate-200 rounded-lg p-4 text-sm text-slate-700">
                      <div
                        className={`font-bold mb-2 flex items-center ${
                          selectedAppeal.status === 'ADOPTED'
                            ? 'text-emerald-700'
                            : 'text-rose-700'
                        }`}
                      >
                        {selectedAppeal.status === 'ADOPTED' ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 mr-1.5" /> 已采纳申辩 (撤销缺陷)
                          </>
                        ) : (
                          <>
                            <XCircle className="w-4 h-4 mr-1.5" /> 已驳回申辩 (维持原判)
                          </>
                        )}
                      </div>
                      {selectedAppeal.decision?.decisionReason && (
                        <p className="mb-2">{selectedAppeal.decision.decisionReason}</p>
                      )}
                      {selectedAppeal.decision?.decidedByName && (
                        <div className="mt-3 text-xs text-slate-400">
                          裁决人: {selectedAppeal.decision.decidedByName} |{' '}
                          {selectedAppeal.decision.decidedAt ?? ''}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <Textarea
                        value={reasoning}
                        onChange={e => setReasoning(e.target.value)}
                        placeholder="输入裁决意见（必填）..."
                        disabled={submitting}
                        className={`bg-white text-sm mb-4 min-h-[100px] border-slate-300 shadow-inner overflow-y-auto ${
                          errorShake
                            ? 'animate-in slide-in-from-left-1 border-rose-500 ring-1 ring-rose-500 focus-visible:ring-rose-500 duration-100'
                            : ''
                        }`}
                      />
                      {errorShake && (
                        <p className="text-rose-500 text-xs mt-1 mb-2">请填写裁决意见以记录理由</p>
                      )}
                      <div className="flex flex-col gap-2.5">
                        <Button
                          onClick={() => handleDecide('ADOPTED')}
                          disabled={submitting}
                          className="w-full bg-emerald-500 hover:bg-emerald-600 text-white h-12 shadow-md font-bold mb-3"
                        >
                          <CheckCircle2 className="w-4 h-4 mr-2" /> 采纳申辩 (撤销缺陷)
                        </Button>
                        <Button
                          onClick={() => handleDecide('REJECTED')}
                          disabled={submitting}
                          className="w-full bg-rose-600 hover:bg-rose-700 text-white h-12 shadow-md font-bold"
                        >
                          <XCircle className="w-4 h-4 mr-2" /> 驳回申辩 (维持原判)
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-10">
                <p className="text-sm text-slate-400">请从左侧案卷目录选择一项申辩进行裁决。</p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
