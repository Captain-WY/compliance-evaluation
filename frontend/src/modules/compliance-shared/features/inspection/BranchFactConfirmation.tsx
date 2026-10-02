import React, { useState, useEffect } from 'react';
import { 
  ChevronRight, 
  Search, 
  Filter, 
  Clock, 
  CheckCircle2, 
  FileText,
  LayoutTemplate,
  Eye,
  X,
  UploadCloud,
  Loader2
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { fileApi, inspectionApi } from '../../services/api';

interface FactProject {
  id: string;
  title: string;
}

interface InspectionFactIssue {
  id: string;
  issueCode?: string;
  inspectionPlanId?: string;
  title: string;
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'PENDING_CONFIRMATION' | 'FACT_CONFIRMED' | 'APPEALED' | 'APPEAL_ADOPTED' | 'APPEAL_REJECTED';
  description: string;
  basisRule?: string;
  appealDeadline?: string;
}

interface FactIssue {
  id: string;
  projectId: string;
  category: string;
  risk: string;
  title: string;
  finding: string;
  rectification: string;
  hqEvidence: string;
  status: 'PENDING' | 'AGREED' | 'DISPUTED';
  confirmDeadline: string;
  isUrgent: boolean;
}

const buildProjectList = (issues: FactIssue[]): FactProject[] => {
  const projects = new Map<string, FactProject>();
  for (const issue of issues) {
    if (!projects.has(issue.projectId)) {
      projects.set(issue.projectId, { id: issue.projectId, title: issue.projectId });
    }
  }
  return [...projects.values()];
};

const mapIssueConfirmationStatus = (status: InspectionFactIssue['status']): FactIssue['status'] => {
  if (status === 'PENDING_CONFIRMATION') return 'PENDING';
  if (status === 'FACT_CONFIRMED') return 'AGREED';
  return 'DISPUTED';
};

export default function BranchFactConfirmation() {
  const [selectedProject, setSelectedProject] = useState('');
  const [projectList, setProjectList] = useState<FactProject[]>([]);
  const [issues, setIssues] = useState<FactIssue[]>([]);
  const [selectedIssueIds, setSelectedIssueIds] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [workspaceIssue, setWorkspaceIssue] = useState<FactIssue | null>(null);
  const [workspaceReadOnly, setWorkspaceReadOnly] = useState(false);
  const [appealReason, setAppealReason] = useState('');
  const [appealFiles, setAppealFiles] = useState<File[]>([]);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  
  useEffect(() => {
    setLoadError(null);
    inspectionApi.getFactIssues({ pageSize: 100 }).then(data => {
      const mapped = data.map((item: InspectionFactIssue) => ({
        id: item.id,
        projectId: item.inspectionPlanId || '未关联检查项目',
        category: item.issueCode ?? item.id,
        risk: `${item.riskLevel} ${item.riskLevel === 'HIGH' ? '高风险' : item.riskLevel === 'MEDIUM' ? '中风险' : '低风险'}`,
        title: item.title,
        finding: item.description,
        rectification: item.basisRule || '',
        hqEvidence: '附件.pdf',
        status: mapIssueConfirmationStatus(item.status),
        confirmDeadline: item.appealDeadline ?? '',
        isUrgent: false,
      }));
      const nextProjects = buildProjectList(mapped);
      setProjectList(nextProjects);
      setSelectedProject(previous =>
        nextProjects.some(project => project.id === previous)
          ? previous
          : nextProjects[0]?.id ?? ''
      );
      setIssues(mapped);
    }).catch(err => {
      console.error("Failed to fetch issues", err);
      setLoadError(err instanceof Error ? err.message : '问题清单加载失败');
    });
  }, []);

  const visibleIssues = selectedProject
    ? issues.filter(issue => issue.projectId === selectedProject)
    : issues;

  const pendingCount = visibleIssues.filter(i => i.status === 'PENDING').length;
  const agreedCount = visibleIssues.filter(i => i.status === 'AGREED').length;
  const disputedCount = visibleIssues.filter(i => i.status === 'DISPUTED').length;

  const handleAgree = async (id: string) => {
    await inspectionApi.confirmFact(id, 'NO_OBJECTION');
    setIssues(issues.map(issue =>
      issue.id === id ? { ...issue, status: 'AGREED' } : issue
    ));
    setSelectedIssueIds(selectedIssueIds.filter(selId => selId !== id));
    toast.success('已确认无异议');
  };

  const handleOpenWorkspace = (issue: FactIssue, readOnly: boolean) => {
    setWorkspaceIssue(issue);
    setWorkspaceReadOnly(readOnly);
    setAppealReason('');
    setAppealFiles([]);
  };

  const handleSubmitAppeal = async () => {
    if (!workspaceIssue || !appealReason.trim()) return;
    setIsSubmittingAction(true);
    try {
      const uploaded = await Promise.all(appealFiles.map(file => fileApi.uploadFile(file)));
      const fileIds = uploaded.map(file => file.fileId).filter(Boolean);
      await inspectionApi.submitAppeal(workspaceIssue.id, appealReason.trim(), fileIds);
      setIssues(prev => prev.map(issue =>
        issue.id === workspaceIssue.id ? { ...issue, status: 'DISPUTED' } : issue
      ));
      setWorkspaceIssue(null);
      toast.success('申辩已提交，总部裁决队列将可见该事项');
    } catch (error) {
      toast.error('申辩提交失败', { description: error instanceof Error ? error.message : '请稍后重试' });
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleWorkspaceAgree = async () => {
    if (!workspaceIssue) return;
    setIsSubmittingAction(true);
    try {
      await handleAgree(workspaceIssue.id);
      setWorkspaceIssue(null);
    } catch (error) {
      toast.error('确认失败', { description: error instanceof Error ? error.message : '请稍后重试' });
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleBulkAgree = async () => {
    await Promise.all(selectedIssueIds.map(id => inspectionApi.confirmFact(id, 'NO_OBJECTION')));
    setIssues(issues.map(issue =>
      (selectedIssueIds.includes(issue.id) && issue.status === 'PENDING') ? { ...issue, status: 'AGREED' } : issue
    ));
    setSelectedIssueIds([]);
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const pendingIds = visibleIssues.filter(i => i.status === 'PENDING').map(i => i.id);
      setSelectedIssueIds(pendingIds);
    } else {
      setSelectedIssueIds([]);
    }
  };

  const toggleSelect = (id: string) => {
    if (selectedIssueIds.includes(id)) {
      setSelectedIssueIds(selectedIssueIds.filter(i => i !== id));
    } else {
      setSelectedIssueIds([...selectedIssueIds, id]);
    }
  };

  const currentProject = projectList.find(p => p.id === selectedProject);

  return (
    <div className="h-full flex flex-col relative w-full overflow-hidden bg-slate-50/50">
      {/* Header & Project Selector */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 z-10 shrink-0">
        <div className="flex items-center text-sm font-medium text-slate-500">
          <span className="hover:text-slate-800 cursor-pointer transition-colors">合规检查</span>
          <ChevronRight className="w-4 h-4 mx-2 text-slate-400" />
          <span className="text-slate-800 font-bold">结论核对与申辩</span>
        </div>

        <div className="flex items-center space-x-3">
          <span className="text-sm font-bold text-slate-600 tracking-wide">当前核对项目:</span>
          <select 
            value={selectedProject}
            onChange={(e) => {
              setSelectedProject(e.target.value);
              setSelectedIssueIds([]);
            }}
            data-testid="fact-project-select"
            className="border border-slate-300 rounded-lg py-2 px-3 text-sm font-bold text-indigo-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-sm cursor-pointer"
          >
            {projectList.length === 0 && (
              <option value="">暂无检查项目</option>
            )}
            {projectList.map(p => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-300">
        <div className="max-w-[1400px] mx-auto space-y-6">
          
          {/* Legal / Compliance Alert */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start shadow-sm">
            <span className="text-xl mr-3 leading-none">💡</span>
            <div className="text-sm text-blue-800 leading-relaxed font-medium">
              <span className="font-bold">提示：</span> 对于存在异议的问题，请务必在截止时间前提交证据，否则系统将视同默认同意结论。
            </div>
          </div>

          {/* Summary Dashboard (The Pressure Bar) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex items-stretch">
            <div className="w-2 bg-indigo-500"></div>
            <div className="p-4 flex-1 flex flex-wrap items-center justify-around md:justify-start md:gap-12">
              <div className="flex flex-col items-center md:items-start text-center md:text-left">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">待确认问题</span>
                <span className="text-2xl font-black text-amber-600">{pendingCount} <span className="text-sm font-medium text-amber-600/70 ml-1">项</span></span>
              </div>
              
              <div className="hidden md:block w-px h-10 bg-slate-200"></div>
              
              <div className="flex flex-col items-center md:items-start text-center md:text-left">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">已确认无异议</span>
                <span className="text-2xl font-black text-emerald-600">{agreedCount} <span className="text-sm font-medium text-emerald-600/70 ml-1">项</span></span>
              </div>
              
              <div className="hidden md:block w-px h-10 bg-slate-200"></div>
              
              <div className="flex flex-col items-center md:items-start text-center md:text-left">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">已提交申辩</span>
                <span className="text-2xl font-black text-blue-600">{disputedCount} <span className="text-sm font-medium text-blue-600/70 ml-1">项</span></span>
              </div>
            </div>
          </div>

          {/* Main Findings Table */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            {loadError && (
              <div className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700" data-testid="fact-load-error">
                {loadError}
              </div>
            )}
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800">初审问题清单 ({currentProject?.title})</h3>
              <div className="flex gap-2 items-center">
                {selectedIssueIds.length > 0 && (
                  <Button variant="outline" size="sm" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50 mr-2" onClick={handleBulkAgree} data-testid="fact-bulk-confirm">
                    <CheckCircle2 className="w-4 h-4 mr-2"/> 批量无异议确认
                  </Button>
                )}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input type="text" placeholder="搜索编号/摘要..." className="pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-48 transition-all" />
                </div>
                <button className="px-3 py-1.5 bg-white border border-slate-200 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-50 flex items-center shadow-sm">
                  <Filter className="w-4 h-4 mr-2" /> 筛选
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 border-r border-slate-100 w-10">
                      <input 
                        type="checkbox" 
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" 
                        onChange={handleSelectAll}
                        checked={pendingCount > 0 && selectedIssueIds.length === pendingCount}
                      />
                    </th>
                    <th className="px-4 py-4 border-r border-slate-100">风险与编号</th>
                    <th className="px-6 py-4 border-r border-slate-100">问题标题与整改要求</th>
                    <th className="px-6 py-4 border-r border-slate-100">关联底稿证据</th>
                    <th className="px-6 py-4 border-r border-slate-100">确认截止时间</th>
                    <th className="px-4 py-4 border-r border-slate-100">当前状态</th>
                    <th className="px-6 py-4 font-bold text-indigo-700 bg-indigo-50/30 text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleIssues.map(issue => {
                    const isAgreed = issue.status === 'AGREED';
                    const isHigh = issue.risk?.includes('HIGH');
                    return (
                      <tr key={issue.id} data-testid={`fact-issue-row-${issue.id}`} className={`group transition-colors ${isAgreed ? 'bg-slate-50/50' : 'hover:bg-indigo-50/30'}`}>
                        {/* Checkbox */}
                        <td className="px-6 py-4 align-top">
                          {issue.status === 'PENDING' && (
                            <input 
                              type="checkbox" 
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 mt-1"
                              checked={selectedIssueIds.includes(issue.id)}
                              onChange={() => toggleSelect(issue.id)}
                            />
                          )}
                        </td>
                        
                        {/* Risk & ID */}
                        <td className="px-4 py-4 align-top">
                          <div className="flex flex-col gap-1">
                            <Badge className={`${isHigh && !isAgreed ? 'bg-rose-100 text-rose-700 hover:bg-rose-100' : 'bg-slate-100 text-slate-600 hover:bg-slate-100'} w-fit`}>
                              {issue.risk}
                            </Badge>
                            <span className="text-[10px] text-slate-400 font-mono">{issue.id}</span>
                          </div>
                        </td>
                        
                        {/* Title & Rectification */}
                        <td className="px-6 py-4 align-top max-w-md group/tooltip relative">
                          <div className="max-w-md">
                            <div className={`font-bold mb-1 truncate ${isAgreed ? 'text-slate-400' : 'text-slate-800'}`}>
                              {issue.title}
                            </div>
                            <div className={`text-xs line-clamp-1 italic ${isAgreed ? 'text-slate-400' : 'text-slate-500'}`}>
                              整改要求：{issue.rectification}
                            </div>
                          </div>
                          {/* Rich tooltip via group-hover */}
                          {!isAgreed && (
                            <div className="absolute top-full left-6 z-50 mt-1 hidden group-hover/tooltip:block w-80 bg-white border border-slate-200 p-4 rounded-xl shadow-xl text-slate-700 text-sm leading-relaxed whitespace-normal break-words">
                              <span className="font-bold text-slate-800 mb-1 block">事实摘要:</span>
                              <p className="mb-2">{issue.finding}</p>
                              <span className="font-bold text-slate-800 mb-1 block">整改要求:</span>
                              <p>{issue.rectification}</p>
                            </div>
                          )}
                        </td>

                        {/* Evidence */}
                        <td className="px-6 py-4 align-top">
                          <div className="flex items-center text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded border border-indigo-100 w-fit cursor-pointer hover:bg-indigo-100 transition-colors">
                            <FileText className="w-3 h-3 mr-1"/> {issue.hqEvidence}
                          </div>
                        </td>

                        {/* Deadline */}
                        <td className="px-6 py-4 align-top">
                          <div className="flex flex-col">
                            <span className={`text-sm font-bold flex items-center ${isAgreed ? 'text-slate-400 line-through' : (issue.isUrgent ? 'text-rose-600' : 'text-slate-700')}`}>
                              <Clock className="w-3.5 h-3.5 mr-1.5" />
                              {issue.confirmDeadline}
                            </span>
                            {issue.isUrgent && !isAgreed && (
                              <span className="text-[11px] font-bold text-rose-500 mt-1 uppercase tracking-wide">不足 24 小时</span>
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-4 align-top">
                          {issue.status === 'PENDING' && (
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              待确认
                            </span>
                          )}
                          {issue.status === 'AGREED' && (
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 mr-1" /> 已无异议
                            </span>
                          )}
                          {issue.status === 'DISPUTED' && (
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              申辩审核中
                            </span>
                          )}
                        </td>

                        {/* Action Tools */}
                        <td className="px-6 py-4 align-top text-center border-l border-slate-100 bg-white group-hover:bg-slate-50/50 transition-colors">
                          {issue.status === 'PENDING' ? (
                            <Button 
                              size="sm"
                              className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm h-9" 
                              data-testid={`fact-open-workspace-${issue.id}`}
                              onClick={() => handleOpenWorkspace(issue, false)}
                            >
                              <LayoutTemplate className="w-4 h-4 mr-2"/> 进入工作台核对
                            </Button>
                          ) : (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="text-slate-500 h-9" 
                              data-testid={`fact-view-detail-${issue.id}`}
                              onClick={() => handleOpenWorkspace(issue, true)}
                            >
                              <Eye className="w-4 h-4 mr-2"/> 查看详情
                            </Button>
                          )}
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {visibleIssues.length === 0 && (
                <div className="p-8 text-center text-slate-500 font-medium">
                  当前项目暂无需要确认的初审问题
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {workspaceIssue && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-3xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden" data-testid="fact-real-workspace">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900">事实核对工作台</h3>
                <p className="text-xs text-slate-500 mt-1">{workspaceIssue.id} · {workspaceIssue.title}</p>
              </div>
              <button
                className="p-2 rounded-md text-slate-400 hover:text-slate-700 hover:bg-white"
                onClick={() => setWorkspaceIssue(null)}
                aria-label="关闭事实核对工作台"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-bold text-slate-500 mb-2">事实摘要</div>
                  <p className="text-sm text-slate-700 leading-relaxed">{workspaceIssue.finding}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="text-xs font-bold text-slate-500 mb-2">整改要求</div>
                  <p className="text-sm text-slate-700 leading-relaxed">{workspaceIssue.rectification}</p>
                </div>
                <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-4">
                  <div className="text-xs font-bold text-indigo-600 mb-2">总部证据</div>
                  <p className="text-sm text-indigo-900">{workspaceIssue.hqEvidence}</p>
                </div>
              </div>
              <div className="space-y-4">
                {workspaceReadOnly ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    当前为只读查看，不能重复提交确认或申辩。
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-sm font-bold text-slate-700 mb-2 block">申辩理由</label>
                      <Textarea
                        value={appealReason}
                        onChange={event => setAppealReason(event.target.value)}
                        data-testid="fact-appeal-reason"
                        placeholder="请输入事实异议说明，必要时上传佐证材料。"
                        className="min-h-[120px]"
                      />
                    </div>
                    <label className="block border-2 border-dashed border-slate-300 rounded-lg p-4 text-center cursor-pointer hover:bg-slate-50" data-testid="fact-appeal-upload-zone">
                      <UploadCloud className="w-5 h-5 text-indigo-500 mx-auto mb-2" />
                      <div className="text-sm font-bold text-slate-700">上传申辩材料</div>
                      <div className="text-xs text-slate-500 mt-1">{appealFiles.length ? `${appealFiles.length} 个文件待提交` : '支持 PDF/JPG/PNG/TXT'}</div>
                      <input
                        data-testid="fact-appeal-file-input"
                        type="file"
                        className="hidden"
                        onChange={event => {
                          const file = event.target.files?.[0];
                          if (file) setAppealFiles(prev => [...prev, file]);
                          event.currentTarget.value = '';
                        }}
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <Button
                        variant="outline"
                        disabled={isSubmittingAction}
                        data-testid={`fact-confirm-no-objection-${workspaceIssue.id}`}
                        onClick={handleWorkspaceAgree}
                        className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                      >
                        {isSubmittingAction ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                        无异议
                      </Button>
                      <Button
                        disabled={isSubmittingAction || !appealReason.trim()}
                        data-testid={`fact-submit-appeal-${workspaceIssue.id}`}
                        onClick={handleSubmitAppeal}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                      >
                        {isSubmittingAction ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        提交申辩
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
