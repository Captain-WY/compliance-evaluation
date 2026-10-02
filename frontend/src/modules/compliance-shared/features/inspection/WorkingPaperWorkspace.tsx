import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  FolderOpen,
  LoaderCircle,
  RefreshCw,
  Save,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { fileApi, inspectionApi } from '../../services/api';
import type { InspectionPlan, RiskLevel, WorkingPaper, WorkingPaperResult } from '../../types';

type WorkingPaperWorkspaceProps = {
  inspectionPlanId?: string;
  plan?: InspectionPlan;
  onBack?: () => void;
};

const RESULT_OPTIONS: Array<{ value: WorkingPaperResult; label: string }> = [
  { value: 'DRAFT', label: '草稿' },
  { value: 'RECORDED', label: '已记录' },
  { value: 'NEEDS_FOLLOWUP', label: '需跟进' },
  { value: 'ISSUE_CANDIDATE', label: '问题候选' },
  { value: 'CLOSED', label: '已关闭' },
];

const resultLabel = (value?: string) =>
  RESULT_OPTIONS.find(option => option.value === value)?.label ?? value ?? '--';

const paperId = (paper: WorkingPaper) => paper.workingPaperId ?? paper.id;

export default function WorkingPaperWorkspace({
  inspectionPlanId,
  plan,
  onBack,
}: WorkingPaperWorkspaceProps) {
  const [papers, setPapers] = useState<WorkingPaper[]>([]);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [executionRecord, setExecutionRecord] = useState('');
  const [result, setResult] = useState<WorkingPaperResult>('RECORDED');
  const [newTitle, setNewTitle] = useState('');
  const [newProcedure, setNewProcedure] = useState('');
  const [newRecord, setNewRecord] = useState('');
  const [newFile, setNewFile] = useState<File | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [issueTitle, setIssueTitle] = useState('');
  const [issueRiskLevel, setIssueRiskLevel] = useState<RiskLevel>('MEDIUM');
  const [issueDescription, setIssueDescription] = useState('');
  const [issueBasisRule, setIssueBasisRule] = useState('');
  const [isCreatingIssue, setIsCreatingIssue] = useState(false);
  const [createdIssueId, setCreatedIssueId] = useState<string | null>(null);

  const targetPlanId = inspectionPlanId ?? plan?.id;

  const loadPapers = useCallback(async () => {
    if (!targetPlanId) {
      setPapers([]);
      setSelectedPaperId(null);
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const nextPapers = await inspectionApi.getWorkingPapers(targetPlanId);
      setPapers(nextPapers);
      setSelectedPaperId(current => {
        if (current && nextPapers.some(paper => paperId(paper) === current)) {
          return current;
        }
        return nextPapers[0] ? paperId(nextPapers[0]) : null;
      });
    } catch (error) {
      setPapers([]);
      setSelectedPaperId(null);
      setLoadError(error instanceof Error ? error.message : '底稿列表加载失败');
    } finally {
      setIsLoading(false);
    }
  }, [targetPlanId]);

  useEffect(() => {
    loadPapers();
  }, [loadPapers]);

  const selectedPaper = useMemo(
    () => papers.find(paper => paperId(paper) === selectedPaperId) ?? null,
    [papers, selectedPaperId],
  );

  useEffect(() => {
    if (!selectedPaper) {
      setExecutionRecord('');
      setResult('RECORDED');
      return;
    }
    setExecutionRecord(selectedPaper.executionRecord ?? '');
    setResult((selectedPaper.result as WorkingPaperResult) || 'RECORDED');
    setIssueTitle(selectedPaper.title ?? '');
    setIssueDescription(selectedPaper.executionRecord ?? '');
    setIssueBasisRule(selectedPaper.procedure ?? '');
    setCreatedIssueId(selectedPaper.convertedIssueId ?? null);
  }, [selectedPaper]);

  const handleCreate = async () => {
    const title = newTitle.trim();
    const procedure = newProcedure.trim();
    const record = newRecord.trim();
    const targetOrgId = plan?.id ? undefined : undefined;
    const branchId = selectedPaper?.branchId ?? selectedPaper?.targetOrgId ?? papers[0]?.branchId ?? papers[0]?.targetOrgId;
    if (!targetPlanId || !title || !procedure || !record || !newFile) {
      toast.error('请填写底稿标题、检查程序、情况记录并选择附件。');
      return;
    }
    setIsCreating(true);
    try {
      const fileAsset = await fileApi.uploadFile(newFile);
      await inspectionApi.createWorkingPaper(targetPlanId, {
        paperCode: `WP-${targetPlanId}-${Date.now()}`,
        title,
        category: 'ONSITE_INTERVIEW',
        branchId: branchId || targetOrgId,
        procedure,
        executionRecord: record,
        result: 'RECORDED',
        fileIds: [fileAsset.fileId],
      });
      toast.success('底稿已通过真实 API 保存。');
      setNewTitle('');
      setNewProcedure('');
      setNewRecord('');
      setNewFile(null);
      await loadPapers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '底稿保存失败');
    } finally {
      setIsCreating(false);
    }
  };

  const handleSave = async () => {
    if (!selectedPaper) return;
    setIsSaving(true);
    try {
      await inspectionApi.updateWorkingPaperResult(paperId(selectedPaper), {
        result,
        executionRecord: executionRecord.trim(),
        fileIds: selectedPaper.fileIds ?? [],
        evidenceList: (selectedPaper.evidenceList ?? []) as string[],
      });
      toast.success('底稿记录已保存并回读。');
      await loadPapers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '底稿记录保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateIssue = async () => {
    if (!targetPlanId || !selectedPaper) return;
    const wpId = paperId(selectedPaper);
    const branchId = selectedPaper.branchId ?? selectedPaper.targetOrgId;
    const title = issueTitle.trim();
    const description = issueDescription.trim();
    const basisRule = issueBasisRule.trim();
    if (!branchId || !title || !description || !issueRiskLevel) {
      toast.error('请确认机构、问题标题、问题描述和风险等级。');
      return;
    }
    setIsCreatingIssue(true);
    try {
      const issue = await inspectionApi.createIssue({
        inspectionPlanId: targetPlanId,
        branchId,
        title,
        riskLevel: issueRiskLevel,
        description,
        basisRule,
        sourceWorkingPaperId: wpId,
        idempotencyKey: `issue-from-wp-${wpId}`,
      });
      setCreatedIssueId(issue.issueId ?? issue.id);
      toast.success(`问题已登记：${issue.issueCode ?? issue.issueId ?? issue.id}`);
      await loadPapers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '问题登记失败');
    } finally {
      setIsCreatingIssue(false);
    }
  };

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-slate-50">
      <header className="z-10 flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mr-2 text-slate-500 hover:text-slate-800" onClick={onBack}>
            <ArrowLeft className="mr-1 h-4 w-4" /> 返回检查详情
          </Button>
          <span className="mx-2 text-slate-300">|</span>
          <span className="font-bold text-slate-800">实施与底稿工作台</span>
          <Badge variant="outline" className="ml-3 bg-slate-50 text-slate-600">
            {plan?.title ?? targetPlanId ?? '未选择计划'}
          </Badge>
        </div>
        <Button variant="outline" size="sm" onClick={loadPapers} disabled={isLoading || !targetPlanId}>
          <RefreshCw className="mr-1.5 h-4 w-4" /> 刷新
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex h-full w-80 shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="flex h-12 items-center border-b border-slate-100 bg-slate-50/50 px-4 text-sm font-bold text-slate-700">
            底稿目录
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {!targetPlanId ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                未选择检查计划，无法加载底稿。
              </div>
            ) : isLoading ? (
              <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> 正在加载底稿...
              </div>
            ) : loadError ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                {loadError}
              </div>
            ) : papers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                当前计划暂无底稿。请通过右侧新增表单保存真实底稿。
              </div>
            ) : (
              papers.map(paper => (
                <button
                  key={paperId(paper)}
                  onClick={() => setSelectedPaperId(paperId(paper))}
                  className={`mb-2 w-full rounded-lg border px-3 py-3 text-left text-sm transition ${
                    selectedPaperId === paperId(paper)
                      ? 'border-blue-200 bg-blue-50 text-blue-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold">{paper.title}</div>
                      <div className="mt-1 truncate text-xs text-slate-500">{paper.paperCode}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="bg-white text-[10px]">{resultLabel(paper.result)}</Badge>
                        <Badge variant="outline" className="bg-white text-[10px]">
                          {paper.targetOrgName || paper.branchId || '目标机构'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col bg-slate-100">
          <section className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
            <div className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              {selectedPaper ? (
                <>
                  <div className="mb-4 flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
                    <div>
                      <h2 className="text-lg font-black text-slate-800">{selectedPaper.title}</h2>
                      <div className="mt-1 text-xs text-slate-500">
                        {selectedPaper.paperCode} · {selectedPaper.targetOrgName || selectedPaper.branchId || '--'} · {selectedPaper.inspector || '--'}
                      </div>
                    </div>
                    <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-50">{resultLabel(selectedPaper.result)}</Badge>
                  </div>
                  <div className="space-y-4 text-sm text-slate-700">
                    <div>
                      <div className="mb-1 font-bold text-slate-700">检查程序</div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 whitespace-pre-wrap">
                        {selectedPaper.procedure || '暂无检查程序'}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 font-bold text-slate-700">附件 fileId</div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-600">
                        {(selectedPaper.fileIds ?? []).length ? selectedPaper.fileIds?.join(' / ') : '无附件'}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 font-bold text-slate-700">情况记录说明</div>
                      <Textarea
                        value={executionRecord}
                        onChange={(event) => setExecutionRecord(event.target.value)}
                        className="min-h-[180px] resize-none bg-slate-50"
                      />
                    </div>
                    <div>
                      <div className="mb-1 font-bold text-slate-700">底稿结果</div>
                      <Select value={result} onValueChange={(value) => setResult(value as WorkingPaperResult)}>
                        <SelectTrigger className="bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RESULT_OPTIONS.map(option => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-16 text-center text-sm text-slate-500">
                  <FolderOpen className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                  请选择左侧底稿，或通过右侧新增真实底稿。
                </div>
              )}
            </div>
          </section>
        </main>

        <aside className="flex h-full w-[420px] shrink-0 flex-col border-l border-slate-200 bg-white">
          <div className="flex h-12 items-center justify-between border-b border-slate-100 bg-slate-50/50 px-5 text-sm font-bold text-slate-800">
            审核与记录
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="font-bold text-slate-800">新增现场底稿</div>
              <input
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                placeholder="底稿标题"
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400"
              />
              <input
                type="file"
                onChange={(event) => setNewFile(event.target.files?.[0] ?? null)}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <Textarea value={newProcedure} onChange={(event) => setNewProcedure(event.target.value)} placeholder="检查程序/步骤" />
              <Textarea value={newRecord} onChange={(event) => setNewRecord(event.target.value)} placeholder="情况记录说明" />
              <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" onClick={handleCreate} disabled={isCreating || !targetPlanId}>
                <Upload className="mr-2 h-4 w-4" /> 保存真实底稿
              </Button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center text-sm font-bold text-slate-800">
                <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" /> 当前底稿保存
              </div>
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleSave} disabled={!selectedPaper || isSaving}>
                <Save className="mr-2 h-4 w-4" /> 保存结果/记录
              </Button>
            </div>

            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-slate-800">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center font-bold text-indigo-900">
                  <FileText className="mr-2 h-4 w-4" /> 转化为检查问题
                </div>
                {(selectedPaper?.convertedIssueId || createdIssueId) && (
                  <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                    已登记
                  </Badge>
                )}
              </div>
              {selectedPaper?.convertedIssueId || createdIssueId ? (
                <div className="rounded-lg border border-emerald-200 bg-white p-3 text-emerald-700">
                  <div className="font-bold">当前底稿已绑定真实问题</div>
                  <div className="mt-1 font-mono text-xs">
                    {selectedPaper?.convertedIssueId ?? createdIssueId}
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    绑定状态来自 working paper readback 的 convertedIssueId / relatedIssueId。
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <input
                    value={issueTitle}
                    onChange={(event) => setIssueTitle(event.target.value)}
                    placeholder="问题标题"
                    className="w-full rounded-md border border-indigo-100 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
                    disabled={!selectedPaper}
                  />
                  <Select
                    value={issueRiskLevel}
                    onValueChange={(value) => setIssueRiskLevel(value as RiskLevel)}
                    disabled={!selectedPaper}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="HIGH">高风险</SelectItem>
                      <SelectItem value="MEDIUM">中风险</SelectItem>
                      <SelectItem value="LOW">低风险</SelectItem>
                    </SelectContent>
                  </Select>
                  <Textarea
                    value={issueDescription}
                    onChange={(event) => setIssueDescription(event.target.value)}
                    placeholder="问题描述"
                    className="min-h-[90px] bg-white"
                    disabled={!selectedPaper}
                  />
                  <Textarea
                    value={issueBasisRule}
                    onChange={(event) => setIssueBasisRule(event.target.value)}
                    placeholder="检查依据 / 制度条款"
                    className="min-h-[70px] bg-white"
                    disabled={!selectedPaper}
                  />
                  <Button
                    className="w-full bg-indigo-600 text-white hover:bg-indigo-700"
                    onClick={handleCreateIssue}
                    disabled={!selectedPaper || isCreatingIssue}
                  >
                    <FileText className="mr-2 h-4 w-4" /> 登记检查问题
                  </Button>
                  <div className="text-xs text-slate-500">
                    提交将调用真实 POST /api/inspection/issues；mock 模式不模拟成功。
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
