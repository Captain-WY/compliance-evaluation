import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Bell,
  CheckCircle2,
  ClipboardList,
  Clock,
  Eye,
  FileText,
  LayoutTemplate,
  RefreshCw,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Upload,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { fileApi, inspectionApi } from '../../services/api';
import type { EvidenceRequirement, EvidenceSubmission, InspectionPlan } from '../../types';

type ExecutionDetail = {
  inspectionPlan?: InspectionPlan;
  branchId?: string;
  evidenceRequirements?: EvidenceRequirement[];
  evidenceSubmissions?: EvidenceSubmission[];
  workingPapers?: Array<{
    workingPaperId?: string;
    id?: string;
    paperCode?: string;
    title?: string;
    category?: string;
    inspector?: string;
    branchId?: string;
    targetOrgId?: string;
    targetOrgName?: string;
    procedure?: string;
    executionRecord?: string;
    fileIds?: string[];
    files?: Array<{ fileId: string; fileName?: string }>;
    updateTime?: string;
    result?: string;
  }>;
  executionStats?: Record<string, number>;
};

type MaterialRow = {
  id: string;
  requirement: EvidenceRequirement;
  submission?: EvidenceSubmission;
  status: 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'ISSUE_CREATED';
  targetLabel: string;
};

type InspectionIssueItem = {
  id: string;
  issueId: string;
  issueCode: string;
  inspectionPlanId: string;
  branchId: string;
  branchName: string;
  title: string;
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  status: string;
  description: string;
  basisRule: string;
  sourceWorkingPaperId: string | null;
  createdBy: string | null;
  createdAt: string | null;
};

type ExecutionWorkspaceProps = {
  inspectionPlanId?: string;
  plan?: InspectionPlan;
  onEnterWorkspace?: () => void;
};

const statusMeta: Record<MaterialRow['status'], { label: string; className: string; icon?: React.ReactNode }> = {
  PENDING: {
    label: '待提交',
    className: 'bg-slate-50 text-slate-600 border-slate-200',
    icon: <Clock className="w-3 h-3 mr-1" />,
  },
  SUBMITTED: {
    label: '已提交待审',
    className: 'bg-blue-50 text-blue-600 border-blue-200',
    icon: <Eye className="w-3 h-3 mr-1" />,
  },
  APPROVED: {
    label: '已通过',
    className: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    icon: <CheckCircle2 className="w-3 h-3 mr-1" />,
  },
  REJECTED: {
    label: '已退回',
    className: 'bg-rose-50 text-rose-600 border-rose-200',
    icon: <AlertCircle className="w-3 h-3 mr-1" />,
  },
  ISSUE_CREATED: {
    label: '已转问题',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: <AlertCircle className="w-3 h-3 mr-1" />,
  },
};

const riskMeta: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  HIGH: {
    label: '高风险',
    className: 'bg-rose-50 text-rose-700 border-rose-200',
    icon: <ShieldAlert className="w-3.5 h-3.5 mr-1" />,
  },
  MEDIUM: {
    label: '中风险',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: <Shield className="w-3.5 h-3.5 mr-1" />,
  },
  LOW: {
    label: '低风险',
    className: 'bg-blue-50 text-blue-700 border-blue-200',
    icon: <ShieldCheck className="w-3.5 h-3.5 mr-1" />,
  },
};

const StatusBadge = ({ status }: { status: MaterialRow['status'] }) => {
  const meta = statusMeta[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${meta.className}`}>
      {meta.icon}
      {meta.label}
    </span>
  );
};

const RiskBadge = ({ riskLevel }: { riskLevel: string }) => {
  const meta = riskMeta[riskLevel] ?? riskMeta.LOW;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${meta.className}`}>
      {meta.icon}
      {meta.label}
    </span>
  );
};

const latestByRequirement = (submissions: EvidenceSubmission[] = []) => {
  const result = new Map<string, EvidenceSubmission>();
  submissions.forEach(submission => {
    const current = result.get(submission.requirementId);
    const currentTime = current?.submitTime ?? '';
    const nextTime = submission.submitTime ?? '';
    if (!current || nextTime >= currentTime) {
      result.set(submission.requirementId, submission);
    }
  });
  return result;
};

const formatDateTime = (value?: string) => value || '--';

const idempotencyKey = (submissionId: string, decision: string) =>
  `SIT-IMPL-01-${decision}-${submissionId}`;

export default function ExecutionWorkspace({
  inspectionPlanId,
  plan,
  onEnterWorkspace,
}: ExecutionWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'issues' | 'materials' | 'papers'>('issues');
  const [detail, setDetail] = useState<ExecutionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reviewingSubmissionId, setReviewingSubmissionId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<EvidenceSubmission | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [workingPaperTitle, setWorkingPaperTitle] = useState('');
  const [workingPaperProcedure, setWorkingPaperProcedure] = useState('');
  const [workingPaperRecord, setWorkingPaperRecord] = useState('');
  const [workingPaperFile, setWorkingPaperFile] = useState<File | null>(null);
  const [isCreatingWorkingPaper, setIsCreatingWorkingPaper] = useState(false);

  const [issues, setIssues] = useState<InspectionIssueItem[]>([]);
  const [isLoadingIssues, setIsLoadingIssues] = useState(false);
  const [issueLoadError, setIssueLoadError] = useState<string | null>(null);
  const [issueTitle, setIssueTitle] = useState('');
  const [issueRiskLevel, setIssueRiskLevel] = useState<'HIGH' | 'MEDIUM' | 'LOW'>('MEDIUM');
  const [issueDescription, setIssueDescription] = useState('');
  const [issueBasisRule, setIssueBasisRule] = useState('');
  const [issueBranchId, setIssueBranchId] = useState('');
  const [issueWorkingPaperId, setIssueWorkingPaperId] = useState('');
  const [isCreatingIssue, setIsCreatingIssue] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!inspectionPlanId) {
      setDetail(null);
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const nextDetail = await inspectionApi.getExecutionDetail(inspectionPlanId);
      setDetail(nextDetail);
    } catch (error) {
      setDetail(null);
      setLoadError(error instanceof Error ? error.message : '实施执行详情加载失败');
    } finally {
      setIsLoading(false);
    }
  }, [inspectionPlanId]);

  const loadIssues = useCallback(async () => {
    if (!inspectionPlanId) {
      setIssues([]);
      return;
    }
    setIsLoadingIssues(true);
    setIssueLoadError(null);
    try {
      const data = await inspectionApi.getFactIssues({ inspectionPlanId, pageSize: 50 });
      setIssues((data as InspectionIssueItem[]).sort((a, b) =>
        (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
      ));
    } catch (error) {
      setIssues([]);
      setIssueLoadError(error instanceof Error ? error.message : '问题列表加载失败');
    } finally {
      setIsLoadingIssues(false);
    }
  }, [inspectionPlanId]);

  useEffect(() => {
    loadDetail();
    loadIssues();
  }, [loadDetail, loadIssues]);

  const materialRows = useMemo<MaterialRow[]>(() => {
    const requirements = detail?.evidenceRequirements ?? [];
    const submissions = latestByRequirement(detail?.evidenceSubmissions ?? []);
    return requirements.map(requirement => {
      const requirementId = requirement.requirementId ?? requirement.id;
      const submission = submissions.get(requirementId);
      return {
        id: requirementId,
        requirement,
        submission,
        status: (submission?.status ?? 'PENDING') as MaterialRow['status'],
        targetLabel: submission?.branchName || requirement.targetOrgIds?.join('、') || detail?.branchId || '--',
      };
    });
  }, [detail]);

  const branchOptions = useMemo(() => {
    const basePlan = plan ?? detail?.inspectionPlan;
    const orgIds = basePlan?.targetOrgIds ?? [];

    const nameById = new Map<string, string>();
    (basePlan?.targetOrgSnapshots ?? []).forEach(snap => {
      if (snap.orgId) nameById.set(snap.orgId, snap.orgName || snap.orgId);
    });
    (basePlan?.targetAcknowledgements ?? []).forEach(ack => {
      if (ack.targetOrgId && !nameById.has(ack.targetOrgId)) {
        nameById.set(ack.targetOrgId, ack.targetOrgName || ack.targetOrgId);
      }
    });

    let ids: string[] = [];
    if (orgIds.length) {
      ids = orgIds;
    } else {
      const reqTargets = new Set<string>();
      (detail?.evidenceRequirements ?? []).forEach(r => {
        (r.targetOrgIds ?? []).forEach(id => reqTargets.add(id));
      });
      ids = Array.from(reqTargets);
    }

    const seen = new Set<string>();
    return ids
      .filter(id => {
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map(id => ({ id, name: nameById.get(id) || id }));
  }, [plan, detail]);

  const workingPaperOptions = useMemo(() =>
    (detail?.workingPapers ?? []).map(wp => ({
      id: wp.workingPaperId ?? wp.id ?? '',
      name: wp.title || wp.paperCode || wp.id || '',
    })).filter(o => o.id),
  [detail]);

  const riskStats = useMemo(() => {
    const high = issues.filter(i => i.riskLevel === 'HIGH').length;
    const medium = issues.filter(i => i.riskLevel === 'MEDIUM').length;
    const low = issues.filter(i => i.riskLevel === 'LOW').length;
    const coveredBranches = new Set(issues.map(i => i.branchId)).size;
    return { high, medium, low, total: issues.length, coveredBranches };
  }, [issues]);

  const handleApprove = async (submission: EvidenceSubmission) => {
    const submissionId = submission.evidenceSubmissionId ?? submission.id;
    setReviewingSubmissionId(submissionId);
    try {
      await inspectionApi.reviewEvidenceSubmission(submissionId, {
        decision: 'APPROVE',
        comment: '材料审阅通过',
        idempotencyKey: idempotencyKey(submissionId, 'APPROVE'),
      });
      toast.success('材料已审核通过，正在刷新最新状态。');
      await loadDetail();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '材料审核通过失败');
    } finally {
      setReviewingSubmissionId(null);
    }
  };

  const handleReject = async () => {
    const reason = rejectReason.trim();
    if (!rejectTarget || !reason) {
      toast.error('退回原因不能为空');
      return;
    }
    const submissionId = rejectTarget.evidenceSubmissionId ?? rejectTarget.id;
    setReviewingSubmissionId(submissionId);
    try {
      await inspectionApi.reviewEvidenceSubmission(submissionId, {
        decision: 'REJECT',
        feedback: reason,
        idempotencyKey: idempotencyKey(submissionId, 'REJECT'),
      });
      toast.success('材料已退回，分支可查看原因并重新提交。');
      setRejectTarget(null);
      setRejectReason('');
      await loadDetail();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '材料退回失败');
    } finally {
      setReviewingSubmissionId(null);
    }
  };

  const handleCreateWorkingPaper = async () => {
    const title = workingPaperTitle.trim();
    const procedure = workingPaperProcedure.trim();
    const executionRecord = workingPaperRecord.trim();
    const targetOrgId = detail?.branchId || plan?.targetDept;
    if (!inspectionPlanId || !title || !procedure || !executionRecord || !workingPaperFile || !targetOrgId) {
      toast.error('请填写底稿标题、检查程序、情况记录并选择附件。');
      return;
    }
    setIsCreatingWorkingPaper(true);
    try {
      const fileAsset = await fileApi.uploadFile(workingPaperFile);
      await inspectionApi.createWorkingPaper(inspectionPlanId, {
        paperCode: `WP-${inspectionPlanId}-${Date.now()}`,
        title,
        category: 'ONSITE_INTERVIEW',
        branchId: targetOrgId,
        procedure,
        executionRecord,
        result: 'RECORDED',
        fileIds: [fileAsset.fileId],
      });
      toast.success('现场底稿已通过真实 API 保存，正在刷新。');
      setWorkingPaperTitle('');
      setWorkingPaperProcedure('');
      setWorkingPaperRecord('');
      setWorkingPaperFile(null);
      await loadDetail();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '现场底稿保存失败');
    } finally {
      setIsCreatingWorkingPaper(false);
    }
  };

  const handleCreateIssue = async () => {
    const title = issueTitle.trim();
    const description = issueDescription.trim();
    const branchId = issueBranchId || detail?.branchId || plan?.targetDept;
    if (!inspectionPlanId || !title || !description || !branchId) {
      toast.error('请填写问题标题、目标机构和问题描述。');
      return;
    }
    setIsCreatingIssue(true);
    try {
      await inspectionApi.createIssue({
        inspectionPlanId,
        branchId,
        title,
        riskLevel: issueRiskLevel,
        description,
        basisRule: issueBasisRule.trim() || undefined,
        sourceWorkingPaperId: issueWorkingPaperId || undefined,
        idempotencyKey: `issue-direct-${inspectionPlanId}-${Date.now()}`,
      });
      toast.success('检查问题已登记，正在刷新最新问题流。');
      setIssueTitle('');
      setIssueDescription('');
      setIssueBasisRule('');
      setIssueWorkingPaperId('');
      await loadIssues();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '问题登记失败');
    } finally {
      setIsCreatingIssue(false);
    }
  };

  const planTitle = detail?.inspectionPlan?.title ?? plan?.title ?? inspectionPlanId ?? '未选择计划';
  const workingPapers = detail?.workingPapers ?? [];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <ClipboardList className="w-5 h-5 text-indigo-600" />
              <h3 className="text-lg font-bold text-slate-800">实施记录与问题登记</h3>
              <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">{planTitle}</Badge>
            </div>
            {!inspectionPlanId ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                暂未选择检查计划，无法加载实施记录。
              </div>
            ) : (
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <BarChart3 className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-600">已登记问题:</span>
                  <strong className="text-slate-800">{riskStats.total}</strong>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm">
                  <ShieldAlert className="w-4 h-4 text-rose-500" />
                  <span className="text-rose-700">高风险:</span>
                  <strong className="text-rose-800">{riskStats.high}</strong>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm">
                  <Shield className="w-4 h-4 text-amber-500" />
                  <span className="text-amber-700">中风险:</span>
                  <strong className="text-amber-800">{riskStats.medium}</strong>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm">
                  <ShieldCheck className="w-4 h-4 text-blue-500" />
                  <span className="text-blue-700">低风险:</span>
                  <strong className="text-blue-800">{riskStats.low}</strong>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                  <FileText className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-600">底稿记录:</span>
                  <strong className="text-slate-800">{workingPapers.length}</strong>
                </div>
              </div>
            )}
          </div>
          <Button
            onClick={onEnterWorkspace}
            className="bg-blue-600 hover:bg-blue-700 text-white shadow-md h-10 text-sm rounded-full transition-all hover:shadow-lg hover:-translate-y-0.5"
          >
            <LayoutTemplate className="w-4 h-4 mr-2" /> 进入统一工作台：底稿审阅与记录 <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center border-b border-slate-200 bg-slate-50/50 px-2 layout-transition relative">
          <button
            onClick={() => setActiveTab('issues')}
            className={`px-6 py-3 text-sm font-bold transition-all relative outline-none flex items-center ${
              activeTab === 'issues' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <ClipboardList className="w-4 h-4 mr-2" />
            问题登记与最新问题流
            {activeTab === 'issues' && <span className="absolute bottom-0 left-0 w-full h-[3px] bg-indigo-600 rounded-t-full" />}
          </button>
          <button
            onClick={() => setActiveTab('materials')}
            className={`px-6 py-3 text-sm font-bold transition-all relative outline-none flex items-center ${
              activeTab === 'materials' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Send className="w-4 h-4 mr-2" />
            辅助材料补充与历史
            {activeTab === 'materials' && <span className="absolute bottom-0 left-0 w-full h-[3px] bg-indigo-600 rounded-t-full" />}
          </button>
          <button
            onClick={() => setActiveTab('papers')}
            className={`px-6 py-3 text-sm font-bold transition-all relative outline-none flex items-center ${
              activeTab === 'papers' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-4 h-4 mr-2" />
            底稿/附件留痕
            {activeTab === 'papers' && <span className="absolute bottom-0 left-0 w-full h-[3px] bg-indigo-600 rounded-t-full" />}
          </button>
        </div>

        {activeTab === 'issues' && (
          <div className="p-5 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                  <div className="font-bold text-slate-800 text-sm flex items-center">
                    <ClipboardList className="w-4 h-4 mr-2 text-indigo-600" />
                    登记检查问题
                  </div>
                  {isLoading || isLoadingIssues ? (
                    <div className="text-sm text-slate-500">正在加载计划数据...</div>
                  ) : loadError || issueLoadError ? (
                    <div className="text-sm text-rose-700">
                      {loadError || issueLoadError}
                      <Button variant="outline" size="sm" className="ml-3" onClick={() => { loadDetail(); loadIssues(); }}>
                        <RefreshCw className="w-3.5 h-3.5 mr-1" /> 重试
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-bold text-slate-600 block mb-1">目标机构 *</label>
                          {branchOptions.length === 0 ? (
                            <div className="w-full rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-400 cursor-not-allowed">
                              暂无被查机构
                            </div>
                          ) : (
                            <Select value={issueBranchId} onValueChange={setIssueBranchId}>
                              <SelectTrigger className="bg-white text-sm w-full">
                                <SelectValue placeholder="选择被查机构" />
                              </SelectTrigger>
                              <SelectContent position="popper" sideOffset={4}>
                                {branchOptions.map(opt => (
                                  <SelectItem key={opt.id} value={opt.id}>{opt.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-600 block mb-1">风险等级 *</label>
                          <Select value={issueRiskLevel} onValueChange={(v) => setIssueRiskLevel(v as 'HIGH' | 'MEDIUM' | 'LOW')}>
                            <SelectTrigger className="bg-white text-sm w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent position="popper" sideOffset={4}>
                              <SelectItem value="HIGH">高风险</SelectItem>
                              <SelectItem value="MEDIUM">中风险</SelectItem>
                              <SelectItem value="LOW">低风险</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-600 block mb-1">问题标题 *</label>
                        <input
                          value={issueTitle}
                          onChange={(event) => setIssueTitle(event.target.value)}
                          placeholder="例如：南沙分支反洗钱大额交易报告资料缺失"
                          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-600 block mb-1">问题描述 *</label>
                        <Textarea
                          value={issueDescription}
                          onChange={(event) => setIssueDescription(event.target.value)}
                          placeholder="描述检查发现的具体问题..."
                          className="min-h-[100px] bg-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-600 block mb-1">检查依据 / 制度条款</label>
                        <input
                          value={issueBasisRule}
                          onChange={(event) => setIssueBasisRule(event.target.value)}
                          placeholder="例如：反洗钱大额交易报告检查要点第 2 条"
                          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10"
                        />
                      </div>
                      {workingPaperOptions.length > 0 && (
                        <div>
                          <label className="text-xs font-bold text-slate-600 block mb-1">关联底稿（可选）</label>
                          <Select value={issueWorkingPaperId} onValueChange={setIssueWorkingPaperId}>
                            <SelectTrigger className="bg-white text-sm w-full">
                              <SelectValue placeholder="选择关联底稿（可选）" />
                            </SelectTrigger>
                            <SelectContent position="popper" sideOffset={4}>
                              <SelectItem value="">不关联底稿</SelectItem>
                              {workingPaperOptions.map(opt => (
                                <SelectItem key={opt.id} value={opt.id}>{opt.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <Button
                        onClick={handleCreateIssue}
                        disabled={isCreatingIssue || !inspectionPlanId}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                      >
                        <ClipboardList className="w-4 h-4 mr-2" /> 提交检查问题
                      </Button>
                      <div className="text-xs text-slate-500">
                        提交将调用真实 POST /api/inspection/issues；成功后自动刷新右侧最新问题流。
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-bold text-slate-800 text-sm flex items-center">
                      <BarChart3 className="w-4 h-4 mr-2 text-indigo-600" />
                      最新登记问题
                    </div>
                    <Button variant="outline" size="sm" onClick={loadIssues} disabled={isLoadingIssues || !inspectionPlanId}>
                      <RefreshCw className="w-3.5 h-3.5 mr-1" /> 刷新
                    </Button>
                  </div>
                  {isLoadingIssues ? (
                    <div className="text-sm text-slate-500 py-6 text-center">正在加载问题列表...</div>
                  ) : issueLoadError ? (
                    <div className="text-sm text-rose-700 py-6 text-center">
                      {issueLoadError}
                      <Button variant="outline" size="sm" className="ml-3" onClick={loadIssues}>
                        <RefreshCw className="w-3.5 h-3.5 mr-1" /> 重试
                      </Button>
                    </div>
                  ) : issues.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                      当前计划暂无登记问题。请通过左侧表单直接录入检查结果。
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                      {issues.slice(0, 20).map(issue => (
                        <div key={issue.issueId} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <RiskBadge riskLevel={issue.riskLevel} />
                                <span className="font-bold text-slate-800 truncate">{issue.title}</span>
                              </div>
                              <div className="mt-1 text-xs text-slate-500 flex flex-wrap gap-x-3">
                                <span>{issue.branchName || issue.branchId || '--'}</span>
                                <span>登记人: {issue.createdBy || '--'}</span>
                                <span>时间: {formatDateTime(issue.createdAt)}</span>
                              </div>
                              {issue.description && (
                                <div className="mt-1 text-xs text-slate-600 line-clamp-2">{issue.description}</div>
                              )}
                            </div>
                            <Badge variant="outline" className="bg-white text-[10px] shrink-0">{issue.status}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'materials' && (
          <div className="p-6 animate-in fade-in duration-300 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-800 text-base">辅助材料补充与历史记录</h3>
                <p className="text-xs text-slate-500 mt-1">
                  材料审阅已降为辅助能力，主要检查工作建议线下完成。系统仅展示最新有效提交及历史记录。
                </p>
              </div>
              <Button variant="outline" disabled className="border-slate-200 text-slate-500 bg-slate-50 shadow-sm">
                <Bell className="w-4 h-4 mr-2" /> EKP 催办待接入
              </Button>
            </div>

            {materialRows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                当前计划暂无材料要求。
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="px-5 py-3 w-44">被查机构</th>
                      <th className="px-5 py-3">材料要求</th>
                      <th className="px-5 py-3 w-40 text-center">截止日期</th>
                      <th className="px-5 py-3 w-40 text-center">最新提交状态</th>
                      <th className="px-5 py-3 w-44 text-center">最后提交/审阅</th>
                      <th className="px-5 py-3 w-56 pl-6">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {materialRows.map(row => {
                      const submissionId = row.submission?.evidenceSubmissionId ?? row.submission?.id;
                      const isReviewing = Boolean(submissionId && reviewingSubmissionId === submissionId);
                      return (
                        <tr key={row.id} className="hover:bg-slate-50/50 transition-colors align-top">
                          <td className="px-5 py-3.5 font-medium text-slate-700">{row.targetLabel}</td>
                          <td className="px-5 py-3.5 text-slate-700">
                            <div className="font-semibold">{row.requirement.title}</div>
                            <div className="text-xs text-slate-500 mt-1 max-w-xl whitespace-normal">{row.requirement.description}</div>
                            {row.status === 'REJECTED' && row.submission?.hqFeedback ? (
                              <div className="mt-2 rounded border border-rose-100 bg-rose-50 px-2 py-1 text-xs text-rose-700 whitespace-normal">
                                退回原因：{row.submission.hqFeedback}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-5 py-3.5 text-center text-slate-500 text-sm">{row.requirement.dueDate}</td>
                          <td className="px-5 py-3.5 text-center"><StatusBadge status={row.status} /></td>
                          <td className="px-5 py-3.5 text-center text-slate-500 text-sm">
                            {formatDateTime(row.submission?.reviewedAt ?? row.submission?.submitTime)}
                          </td>
                          <td className="px-5 py-3.5 pl-6">
                            {row.status === 'SUBMITTED' && row.submission ? (
                              <Button
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                                onClick={() => { if (onEnterWorkspace) onEnterWorkspace(); }}
                              >
                                <Eye className="w-3.5 h-3.5 mr-1" /> 去工作台审阅
                              </Button>
                            ) : row.status === 'PENDING' ? (
                              <Button size="sm" variant="outline" disabled className="text-slate-500 border-slate-200">
                                <Bell className="w-3.5 h-3.5 mr-1" /> 催办待接入
                              </Button>
                            ) : (
                              <span className="text-xs text-slate-400">无需操作</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'papers' && (
          <div className="p-6 animate-in fade-in duration-300 space-y-5">
            <div className="bg-blue-50/50 border border-blue-100 text-blue-700 p-3 rounded-md text-sm flex items-start shadow-sm">
              <FileText className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
              <span>现场底稿已接入真实 working paper API：先通过 /api/files 上传附件，再保存底稿记录并从 execution detail 回读。</span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
              <div className="font-bold text-slate-800 text-sm">新增现场底稿</div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <input
                  value={workingPaperTitle}
                  onChange={(event) => setWorkingPaperTitle(event.target.value)}
                  placeholder="底稿标题，例如：现场访谈记录"
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
                />
                <input
                  type="file"
                  onChange={(event) => setWorkingPaperFile(event.target.files?.[0] ?? null)}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>
              <textarea
                value={workingPaperProcedure}
                onChange={(event) => setWorkingPaperProcedure(event.target.value)}
                placeholder="检查程序/步骤"
                className="w-full min-h-[72px] rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
              />
              <textarea
                value={workingPaperRecord}
                onChange={(event) => setWorkingPaperRecord(event.target.value)}
                placeholder="情况记录说明"
                className="w-full min-h-[90px] rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
              />
              <Button
                onClick={handleCreateWorkingPaper}
                disabled={isCreatingWorkingPaper || !inspectionPlanId}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Upload className="w-4 h-4 mr-2" /> 保存现场底稿
              </Button>
            </div>
            {workingPapers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                当前计划暂无现场底稿。请上传附件并保存底稿；真实 API 失败时不会本地伪造成功。
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="px-5 py-3">底稿名称</th>
                      <th className="px-5 py-3 w-36">被查机构</th>
                      <th className="px-5 py-3 w-32">检查人</th>
                      <th className="px-5 py-3 w-32">状态</th>
                      <th className="px-5 py-3 w-36">附件</th>
                      <th className="px-5 py-3 w-40">更新时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {workingPapers.map(paper => (
                      <tr key={paper.workingPaperId ?? paper.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3.5 text-slate-700 font-medium">{paper.title}</td>
                        <td className="px-5 py-3.5 text-slate-600">{paper.targetOrgName || paper.branchId || '--'}</td>
                        <td className="px-5 py-3.5 text-slate-600">{paper.inspector || '--'}</td>
                        <td className="px-5 py-3.5 text-slate-600">{paper.result || '--'}</td>
                        <td className="px-5 py-3.5 text-slate-500 text-xs">{(paper.fileIds ?? []).length ? `${(paper.fileIds ?? []).length} 个` : '无'}</td>
                        <td className="px-5 py-3.5 text-slate-500">{paper.updateTime || '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      <Dialog open={Boolean(rejectTarget)} onOpenChange={(open) => { if (!open) { setRejectTarget(null); setRejectReason(''); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>退回材料并要求分支重传</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <label className="text-sm font-bold text-slate-700 block">退回原因 *</label>
            <textarea
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              className="w-full min-h-[120px] rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400"
              placeholder="请填写分支可见的退回原因，例如缺少签字、文件不清晰、材料不完整等。"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setRejectTarget(null); setRejectReason(''); }}>取消</Button>
            <Button className="bg-rose-600 hover:bg-rose-700 text-white" onClick={handleReject} disabled={!rejectReason.trim() || Boolean(rejectTarget && reviewingSubmissionId === (rejectTarget.evidenceSubmissionId ?? rejectTarget.id))}>
              确认退回
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
