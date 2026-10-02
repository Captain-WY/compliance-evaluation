import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CircleCheck,
  CircleDashed,
  FileCheck,
  FileSpreadsheet,
  FileText,
  Lock,
  Send,
  ShieldCheck,
  Upload,
  UploadCloud,
  X,
  Zap,
  DownloadCloud,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  DEFAULT_INSPECTION_PLAN_ID,
  fileApi,
  inspectionApi,
} from '../../services/api';
import { ApiRequestError } from '../../services/realApi';

type ReportBranchStatus = {
  branchId: string;
  branchName: string;
  confirmStatus: 'AGREED' | 'DISPUTED' | 'PENDING' | string;
  defenseStatus: 'RESOLVED' | 'PENDING' | 'NA' | string;
  issueCount?: number;
  appealCount?: number;
};

type ReportVersion = {
  reportVersionId: string;
  version?: string;
  versionNo?: string;
  name?: string;
  label?: string;
  method?: string;
  methodCode?: string;
  status?: string;
  uploader?: string;
  createdByName?: string;
  time?: string;
  createdAt?: string;
  fileAssetId?: string | null;
  fileAsset?: { fileName?: string; contentType?: string } | null;
  optimisticVersion?: number;
  downloadEnabled?: boolean;
  downloadDeferred?: boolean;
};

type ReportWorkspace = {
  inspectionPlanId: string;
  readiness: {
    score?: number;
    factConfirmed?: boolean;
    appealsResolved?: boolean;
    finalReportPresent?: boolean;
    currentPhase?: string;
    canGenerate?: boolean;
    canUpload?: boolean;
    canRelease?: boolean;
    released?: boolean;
  };
  branchStatuses: ReportBranchStatus[];
  versions: ReportVersion[];
  currentFinalVersionId?: string | null;
  currentReleasedVersionId?: string | null;
  permissions: {
    canRead?: boolean;
    canGenerate?: boolean;
    canUpload?: boolean;
    canRelease?: boolean;
    canDownload?: boolean;
    downloadDeferred?: boolean;
  };
  blockers: Array<{ code: string; message: string; severity?: string }>;
  download?: { enabled?: boolean; reason?: string; label?: string };
};

const newIdempotencyKey = (prefix: string) => {
  const randomPart = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}-${randomPart}`;
};

const errorCode = (error: unknown) =>
  error instanceof ApiRequestError ? error.code : (error as { code?: string } | undefined)?.code;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : '操作失败，请刷新后重试';

const isPdfFile = (file: File) =>
  file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

export default function ReportingWorkspace({ inspectionPlanId }: { inspectionPlanId?: string }) {
  const activeInspectionPlanId = inspectionPlanId || DEFAULT_INSPECTION_PLAN_ID;
  const [workspace, setWorkspace] = useState<ReportWorkspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isReleasing, setIsReleasing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadWorkspace = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await inspectionApi.getReportWorkspace(activeInspectionPlanId);
      setWorkspace(data as ReportWorkspace);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [activeInspectionPlanId]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  const reportBranches = workspace?.branchStatuses ?? [];
  const versions = workspace?.versions ?? [];
  const permissions = workspace?.permissions ?? {};
  const blockers = workspace?.blockers ?? [];
  const finalVersion =
    versions.find(item => item.reportVersionId === workspace?.currentFinalVersionId) ??
    versions.find(item => item.status === 'FINAL_UPLOADED' || item.status === 'RELEASED') ??
    null;

  const checklistItems = useMemo(
    () => [
      {
        label: '所有被检查机构已完成事实确认',
        completed: workspace?.readiness?.factConfirmed === true,
      },
      {
        label: '所有分支机构提交的申辩均已裁决结案',
        completed: workspace?.readiness?.appealsResolved === true,
      },
      {
        label: '已生成或上传最终版签章报告资产包',
        completed: workspace?.readiness?.finalReportPresent === true,
      },
    ],
    [workspace],
  );

  const completedCount = checklistItems.filter(item => item.completed).length;
  const readinessScore = Math.round((completedCount / checklistItems.length) * 100);

  const handleCommandError = async (err: unknown, fallback: string) => {
    if (errorCode(err) === 'IDEMPOTENCY_KEY_CONFLICT') {
      toast.error('幂等键冲突，已刷新报告工作台状态，请重新发起操作');
      await loadWorkspace();
      return;
    }
    toast.error(`${fallback}：${errorMessage(err)}`);
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      await inspectionApi.generateReportDraft(activeInspectionPlanId, {
        format: 'DOCX',
        remarks: 'Generated from current inspection facts and adjudication snapshot',
        idempotencyKey: newIdempotencyKey('report-generate'),
      });
      await loadWorkspace();
      toast.success('报告草稿已生成');
    } catch (err) {
      await handleCommandError(err, '报告草稿生成失败');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
  };

  const handleUploadSubmit = async () => {
    if (!selectedFile) {
      toast.error('请先选择要上传的报告文件');
      return;
    }
    if (!isPdfFile(selectedFile)) {
      toast.error('最终签章报告必须上传 PDF 文件');
      return;
    }
    setIsUploading(true);
    try {
      const uploaded = await fileApi.uploadFile(selectedFile);
      await inspectionApi.bindFinalReport(activeInspectionPlanId, {
        fileAssetId: uploaded.fileId,
        label: 'Final signed inspection report',
        remarks: selectedFile.name,
        idempotencyKey: newIdempotencyKey('report-bind-final'),
      });
      await loadWorkspace();
      setShowUploadModal(false);
      setSelectedFile(null);
      toast.success('最终签章报告已绑定');
    } catch (err) {
      await handleCommandError(err, '最终签章报告上传失败');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRelease = async () => {
    if (!finalVersion) {
      toast.error('请先上传并绑定最终签章报告');
      return;
    }
    setIsReleasing(true);
    try {
      await inspectionApi.releaseReport(activeInspectionPlanId, finalVersion.reportVersionId, {
        comment: 'Release final signed inspection report',
        optimisticVersion: finalVersion.optimisticVersion,
        idempotencyKey: newIdempotencyKey('report-release'),
      });
      await loadWorkspace();
      toast.success('检查报告已发布，整改流程已开启');
    } catch (err) {
      await handleCommandError(err, '报告发布失败');
    } finally {
      setIsReleasing(false);
    }
  };

  const downloadDeferred = workspace?.download?.enabled === false || permissions.downloadDeferred;
  const canGenerate = permissions.canGenerate === true && !isGenerating && !isLoading;
  const canUpload = permissions.canUpload === true && !isUploading && !isLoading;
  const canRelease = permissions.canRelease === true && readinessScore === 100 && !isReleasing;

  return (
    <div className="w-full flex justify-center animate-in fade-in duration-300">
      <div className="w-full max-w-none">
        {error && (
          <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-700 p-3.5 rounded-lg text-sm flex items-start shadow-sm">
            <AlertCircle className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {blockers.length > 0 && (
          <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 p-3.5 rounded-lg text-sm space-y-2 shadow-sm">
            {blockers.slice(0, 3).map(blocker => (
              <div key={`${blocker.code}-${blocker.message}`} className="flex items-start">
                <AlertTriangle className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
                <span className="font-medium">{blocker.message}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mb-8">
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
            <ShieldCheck className="w-5 h-5 mr-2 text-indigo-600" /> 事实确认与拦截栅栏
          </h3>

          {workspace?.readiness?.appealsResolved === false && (
            <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-700 p-3.5 rounded-lg text-sm flex items-start shadow-sm">
              <AlertCircle className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
              <span className="font-medium">部分机构申辩处理中，请前往裁决中心结案。未结案前系统将拦截最终报告发布。</span>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden w-full">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="px-6 py-4">机构名称</th>
                  <th className="px-6 py-4">确认状态</th>
                  <th className="px-6 py-4">申辩与裁决状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading && (
                  <tr>
                    <td className="px-6 py-6 text-slate-500" colSpan={3}>
                      正在加载报告工作台...
                    </td>
                  </tr>
                )}
                {!isLoading && reportBranches.length === 0 && (
                  <tr>
                    <td className="px-6 py-6 text-slate-500" colSpan={3}>
                      暂无报告工作台机构状态
                    </td>
                  </tr>
                )}
                {reportBranches.map(branch => (
                  <tr key={branch.branchId} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4 font-bold text-slate-700">{branch.branchName}</td>
                    <td className="px-6 py-4">
                      {branch.confirmStatus === 'AGREED' ? (
                        <Badge className="bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-50">
                          已确认无异议
                        </Badge>
                      ) : branch.confirmStatus === 'DISPUTED' ? (
                        <Badge className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50">
                          存在异议
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200">
                          待确认
                        </Badge>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {branch.defenseStatus === 'RESOLVED' ? (
                        <Badge className="bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-50">
                          已结案
                        </Badge>
                      ) : branch.defenseStatus === 'PENDING' ? (
                        <Badge className="bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-50">
                          申辩裁决中
                        </Badge>
                      ) : (
                        <span className="text-slate-400 text-xs">无申辩</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mb-8 p-6 bg-slate-50 border border-slate-200 rounded-lg shadow-inner w-full">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 mb-6">
            <div>
              <h3 className="text-lg font-bold text-slate-800">智能报告生产线</h3>
              <p className="text-sm text-slate-500 mt-1">
                基于工作底稿与定性裁决结果自动生成报告草稿。支持上传定稿完成审批留痕。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm font-bold h-10"
                data-testid="p2-report-generate-draft"
              >
                <Zap className={`w-4 h-4 mr-2 ${isGenerating ? 'animate-pulse' : ''}`} />
                {isGenerating ? '正在生成...' : '智能生成报告初稿'}
              </Button>
              <Button
                onClick={() => setShowUploadModal(true)}
                disabled={!canUpload}
                variant="outline"
                className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 bg-white font-bold h-10"
                data-testid="p2-report-open-upload"
              >
                <UploadCloud className="w-4 h-4 mr-2" /> 上传最终签章稿
              </Button>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden w-full">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="px-6 py-4 w-32">版本</th>
                  <th className="px-6 py-4">文件名称</th>
                  <th className="px-6 py-4 w-40">生成方式</th>
                  <th className="px-6 py-4 w-48">时间与操作人</th>
                  <th className="px-6 py-4 w-36 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!isLoading && versions.length === 0 && (
                  <tr>
                    <td className="px-6 py-6 text-slate-500" colSpan={5}>
                      暂无报告版本
                    </td>
                  </tr>
                )}
                {versions.map(version => {
                  const fileName = version.fileAsset?.fileName ?? version.name ?? version.label ?? '报告版本';
                  const isPdf = fileName.toLowerCase().endsWith('.pdf');
                  return (
                    <tr key={version.reportVersionId} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-700">
                        {version.versionNo ?? version.version}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1.5 py-1">
                          <div className="flex items-center text-sm font-medium text-slate-700">
                            {isPdf ? (
                              <FileCheck className="w-4 h-4 mr-2 text-rose-500" />
                            ) : (
                              <FileText className="w-4 h-4 mr-2 text-blue-500" />
                            )}
                            {fileName}
                          </div>
                          <div className="flex items-center text-xs font-medium text-slate-500">
                            <FileSpreadsheet className="w-4 h-4 mr-2 text-emerald-500" />
                            {version.status ?? 'DRAFT_GENERATED'}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        {version.methodCode === 'SYSTEM_GENERATED' || version.method?.includes('draft') ? (
                          <span className="flex items-center text-indigo-600 bg-indigo-50 px-2 py-1 rounded w-fit">
                            <Zap className="w-3 h-3 mr-1" /> {version.method ?? '系统生成'}
                          </span>
                        ) : (
                          version.method ?? '人工上传'
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold text-slate-700">
                            {version.createdByName ?? version.uploader ?? '-'}
                          </span>
                          <span>{version.createdAt ?? version.time ?? '-'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!version.downloadEnabled || downloadDeferred}
                          className="text-slate-500 hover:text-blue-600 disabled:text-slate-300"
                          title={workspace?.download?.label ?? 'DOWNLOAD_DEFERRED'}
                          data-testid={`p2-report-download-${version.reportVersionId}`}
                        >
                          <DownloadCloud className="w-4 h-4 mr-1" />
                          {version.downloadEnabled ? '下载资产包' : '下载暂缓'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-8 bg-slate-50 border border-slate-200 rounded-lg p-6 shadow-sm">
          <h3 className="text-base font-bold text-slate-800 flex items-center mb-6">
            <Send className="w-5 h-5 mr-2 text-indigo-600" /> 报告发布前置清单
          </h3>

          <div className="flex flex-col md:flex-row items-start justify-between mb-8 pb-6 border-b border-slate-200">
            <div className="flex-1 w-full md:mr-8 mb-6 md:mb-0">
              <ul className="space-y-4 text-sm text-slate-600">
                {checklistItems.map(item => (
                  <li
                    key={item.label}
                    className="flex items-center bg-white p-3 rounded-lg border border-slate-100 shadow-sm"
                  >
                    {item.completed ? (
                      <CircleCheck className="w-5 h-5 mr-3 text-emerald-500 shrink-0" />
                    ) : (
                      <CircleDashed className="w-5 h-5 mr-3 text-slate-300 shrink-0" />
                    )}
                    <span className={`font-medium ${item.completed ? 'text-slate-800' : 'text-slate-500'}`}>
                      {item.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="text-center bg-white p-6 rounded-lg border border-slate-200 shadow-sm min-w-[160px] flex flex-col items-center justify-center self-stretch md:self-auto">
              <div className="text-sm font-bold text-slate-500 mb-2 uppercase tracking-wide">发布就绪度</div>
              <div className={`text-5xl font-bold ${readinessScore === 100 ? 'text-emerald-500' : 'text-indigo-600'}`}>
                {readinessScore}%
              </div>
            </div>
          </div>

          <Button
            onClick={handleRelease}
            className={`w-full h-12 text-base font-bold rounded-md flex items-center justify-center transition-colors ${
              canRelease ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm' : 'bg-slate-200 text-slate-400'
            }`}
            disabled={!canRelease}
            data-testid="p2-report-release"
          >
            {canRelease ? (
              <>
                <Send className="w-5 h-5 mr-2" /> {isReleasing ? '发布中...' : '正式发布检查结果并开启整改'}
              </>
            ) : (
              <>
                <Lock className="w-5 h-5 mr-2" /> 正式发布检查结果并开启整改
              </>
            )}
          </Button>
        </div>
      </div>

      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800 flex items-center">
                <UploadCloud className="w-5 h-5 mr-2 text-indigo-600" /> 上传报告资产包
              </h3>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="关闭上传弹窗"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">报告正文 (PDF签章版)</label>
                <label className="block border-2 border-dashed border-slate-200 rounded-lg p-8 text-center hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors cursor-pointer group">
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,application/pdf"
                    onChange={handleFileSelect}
                    data-testid="p2-report-upload-input"
                  />
                  <FileCheck className="w-8 h-8 text-slate-300 group-hover:text-indigo-500 mx-auto mb-3 transition-colors" />
                  {selectedFile ? (
                    <p className="text-sm font-bold text-indigo-700 break-all">{selectedFile.name}</p>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-slate-700">点击或将文件拖曳至此</p>
                      <p className="text-xs text-slate-400 mt-1">支持 PDF 格式，最大 50MB</p>
                    </>
                  )}
                </label>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  附加底稿与证明材料 <span className="text-slate-400 font-normal">(可选)</span>
                </label>
                <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center bg-slate-50 text-slate-400">
                  <FileSpreadsheet className="w-6 h-6 mx-auto mb-2" />
                  <p className="text-sm font-medium">附加材料绑定后续按工作包扩展</p>
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <Button
                onClick={() => setShowUploadModal(false)}
                variant="ghost"
                className="text-slate-600 hover:bg-slate-200"
              >
                取消
              </Button>
              <Button
                onClick={handleUploadSubmit}
                disabled={isUploading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[120px]"
                data-testid="p2-report-confirm-upload"
              >
                {isUploading ? (
                  <>
                    <Upload className="w-4 h-4 mr-2 animate-bounce" /> 上传中...
                  </>
                ) : (
                  '确认上传并绑定'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
