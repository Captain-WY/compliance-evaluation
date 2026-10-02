import React, { useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  File,
  FileSpreadsheet,
  FileText,
  Info,
  Lock,
  UploadCloud,
  Trash2,
  Download,
  X,
  Settings2,
} from 'lucide-react';
import type { Attachment, InspectionPlan } from '../../types';
import { fileApi, inspectionApi } from '../../services/api';
import { toast } from 'sonner';

type PlanFileKey = 'notice' | 'scheme' | 'workingPaperTemplate' | 'other';

const PLAN_FILE_LABELS: Record<PlanFileKey, string> = {
  notice: '检查通知书',
  scheme: '现场检查方案',
  workingPaperTemplate: '底稿模板',
  other: '其他',
};

const PLAN_FILE_ATTACHMENT_TYPES: Record<PlanFileKey, string> = {
  notice: 'INSPECTION_NOTICE',
  scheme: 'ONSITE_INSPECTION_SCHEME',
  workingPaperTemplate: 'WORKING_PAPER_TEMPLATE',
  other: 'OTHER',
};

const getFileIcon = (fileName: string) => {
  if (fileName.endsWith('.pdf')) return <FileText className="w-4 h-4 text-rose-500 mr-2" />;
  if (fileName.endsWith('.xlsx')) return <FileSpreadsheet className="w-4 h-4 text-emerald-500 mr-2" />;
  if (fileName.endsWith('.docx')) return <FileText className="w-4 h-4 text-blue-500 mr-2" />;
  return <File className="w-4 h-4 text-slate-400 mr-2" />;
};

const formatFileSize = (value?: number) => {
  if (!value) return '大小待接入';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
};

const planDocuments = (files?: InspectionPlan['files']) =>
  (Object.entries(PLAN_FILE_LABELS) as Array<[PlanFileKey, string]>)
    .map(([key, label]) => {
      const attachment = files?.[key];
      return attachment ? { key, label: attachment.attachmentLabel || label, attachment } : null;
    })
    .filter((item): item is { key: PlanFileKey; label: string; attachment: Attachment } => Boolean(item));

const optionalPlanText = (plan: InspectionPlan | undefined, fieldNames: string[]) => {
  const rawPlan = plan as unknown as Record<string, unknown> | undefined;
  for (const fieldName of fieldNames) {
    const value = rawPlan?.[fieldName];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

const planScopedEkpEvents = (plan: InspectionPlan | undefined) => {
  const ekpFlow = plan?.ekpFlow;
  const approval = ekpFlow?.approval;
  const dispatch = ekpFlow?.dispatch;

  // Fallback to legacy single-card structure for backward compatibility
  if (!approval || !dispatch) {
    const legacyFlow = ekpFlow as unknown as Record<string, unknown> | undefined;
    const status = typeof legacyFlow?.status === 'string' ? legacyFlow.status : '';
    const events = Array.isArray(legacyFlow?.events) ? legacyFlow.events as Array<Record<string, unknown>> : [];
    const hasRecordedRuntimeEvent = events.some(event =>
      Boolean(event.integrationEventId || event.integration_event_id || event.eventId || event.event_id),
    );
    const latestEventId = typeof legacyFlow?.latestEventId === 'string' ? legacyFlow.latestEventId : '';
    if (!status || status === 'not_started' || status === 'history_seed_sample') {
      return { hasEkpEvent: false, approval: null, dispatch: null, legacy: { status, latestEventId: '', eventCount: 0 } };
    }
    return { hasEkpEvent: true, approval: null, dispatch: null, legacy: { status, latestEventId, eventCount: hasRecordedRuntimeEvent ? events.length : 0 } };
  }

  return {
    hasEkpEvent: true,
    approval,
    dispatch,
    legacy: null,
  };
};

const isPlanEditable = (plan?: InspectionPlan) => {
  const phase = plan?.currentPhase;
  return phase === 'PLAN_DRAFT' || phase === 'PLAN_SUBMITTED';
};

interface FileMaintenanceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  plan?: InspectionPlan;
  onPlanUpdate?: (plan: InspectionPlan) => void;
}

function FileMaintenanceDrawer({ isOpen, onClose, plan, onPlanUpdate }: FileMaintenanceDrawerProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const fileInputRefs = useRef<Record<PlanFileKey, HTMLInputElement | null>>({
    notice: null,
    scheme: null,
    workingPaperTemplate: null,
    other: null,
  });

  const handleUpload = async (key: PlanFileKey, file: File) => {
    if (!plan?.id || isUpdating) return;
    setIsUpdating(true);
    try {
      const uploadResult = await fileApi.uploadFile(file);
      const fileId = uploadResult?.fileId ?? uploadResult?.id;
      if (!fileId) {
        throw new Error('上传未返回有效文件标识');
      }

      const attachmentType = PLAN_FILE_ATTACHMENT_TYPES[key];
      const existingFiles = plan.files
        ? (Object.entries(plan.files) as Array<[PlanFileKey, Attachment]>)
            .filter(([k]) => k !== key)
            .map(([k, att]) => ({
              attachmentType: PLAN_FILE_ATTACHMENT_TYPES[k],
              fileId: att.fileId ?? att.id,
            }))
        : [];

      const updatedPlan = await inspectionApi.updatePlan(plan.id, {
        files: [...existingFiles, { attachmentType, fileId }],
      });

      toast.success(`${PLAN_FILE_LABELS[key]} 上传并绑定成功`);
      onPlanUpdate?.(updatedPlan);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '文件上传失败');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUnbind = async (key: PlanFileKey) => {
    if (!plan?.id || isUpdating) return;
    setIsUpdating(true);
    try {
      const existingFiles = plan.files
        ? (Object.entries(plan.files) as Array<[PlanFileKey, Attachment]>)
            .filter(([k]) => k !== key)
            .map(([k, att]) => ({
              attachmentType: PLAN_FILE_ATTACHMENT_TYPES[k],
              fileId: att.fileId ?? att.id,
            }))
        : [];

      const updatedPlan = await inspectionApi.updatePlan(plan.id, {
        files: existingFiles,
      });

      toast.success(`${PLAN_FILE_LABELS[key]} 已解绑`);
      onPlanUpdate?.(updatedPlan);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '解绑失败');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDownload = async (attachment: Attachment) => {
    const fileId = attachment.fileId ?? attachment.id;
    if (!fileId) {
      toast.error('缺少文件标识，无法下载');
      return;
    }
    try {
      const result = await fileApi.getDownloadUrl(fileId);
      const url = result?.downloadUrl ?? result?.url;
      if (url) {
        window.open(url, '_blank');
      } else {
        toast.info('下载链接未就绪，请联系管理员');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '下载失败');
    }
  };

  const editable = isPlanEditable(plan);

  const renderRow = (key: PlanFileKey) => {
    const label = PLAN_FILE_LABELS[key];
    const attachment = plan?.files?.[key];
    return (
      <div key={key} className="border-b border-slate-100 last:border-b-0 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
              {label}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {attachment && (
              <button
                onClick={() => handleDownload(attachment)}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                title="下载"
              >
                <Download className="w-3.5 h-3.5" />
                下载
              </button>
            )}
            {editable && attachment && (
              <button
                onClick={() => handleUnbind(key)}
                disabled={isUpdating}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50"
                title="解绑"
              >
                <Trash2 className="w-3.5 h-3.5" />
                解绑
              </button>
            )}
            {editable && !attachment && (
              <>
                <input
                  ref={el => { fileInputRefs.current[key] = el; }}
                  type="file"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(key, f);
                    e.target.value = '';
                  }}
                />
                <button
                  onClick={() => fileInputRefs.current[key]?.click()}
                  disabled={isUpdating}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  上传
                </button>
              </>
            )}
          </div>
        </div>
        {attachment ? (
          <div className="mt-2 flex items-center gap-2 text-sm text-slate-700">
            {getFileIcon(attachment.name)}
            <span className="max-w-[20rem] truncate font-medium">{attachment.name}</span>
            <span className="text-xs text-slate-400">{formatFileSize(attachment.fileSize)}</span>
            {attachment.uploadedBy && (
              <span className="text-xs text-slate-400">上传人: {attachment.uploadedBy}</span>
            )}
            {attachment.uploadTime && (
              <span className="text-xs text-slate-400">{attachment.uploadTime}</span>
            )}
          </div>
        ) : (
          <div className="mt-2 text-xs text-slate-400">未绑定文件</div>
        )}
      </div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            data-testid="plan-file-maintenance-drawer"
            className="fixed inset-y-0 right-0 w-[520px] bg-white shadow-2xl flex flex-col z-50 border-l border-slate-200"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0 bg-white">
              <h2 className="text-lg font-bold text-slate-800">
                检查准备文件维护
              </h2>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-2 border-b border-slate-100 bg-slate-50 shrink-0">
              <div className="text-xs text-slate-500">
                计划: {plan?.title ?? '—'} ({plan?.inspectCode ?? '—'})
              </div>
              {!editable && (
                <div className="mt-1 text-xs text-amber-600 font-medium flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  当前计划阶段为只读，仅可查看和下载，不可维护附件
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-2">
              {(['notice', 'scheme', 'workingPaperTemplate', 'other'] as PlanFileKey[]).map(renderRow)}
            </div>
            {isUpdating && (
              <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 shrink-0 flex items-center gap-2 text-sm text-slate-600">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-100 border-t-blue-600" />
                正在处理...
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default function PreparationWorkspace({
  plan,
  onPlanUpdate,
}: {
  plan?: InspectionPlan;
  onNext?: () => void;
  onPlanUpdate?: (plan: InspectionPlan) => void;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const documents = planDocuments(plan?.files);
  const confidentiality = optionalPlanText(plan, [
    'confidentialityLabel',
    'confidentiality',
    'confidentialityLevel',
  ]);
  const description = optionalPlanText(plan, ['description', 'summary', 'projectDescription']);
  const ekpSummary = planScopedEkpEvents(plan);
  const hasNewEkpCards = Boolean(ekpSummary.approval && ekpSummary.dispatch);
  const hasLegacyEkpEvent = ekpSummary.hasEkpEvent && !hasNewEkpCards;
  const editable = isPlanEditable(plan);

  const handleDownload = async (attachment: Attachment) => {
    const fileId = attachment.fileId ?? attachment.id;
    if (!fileId) {
      toast.error('缺少文件标识，无法下载');
      return;
    }
    try {
      const result = await fileApi.getDownloadUrl(fileId);
      const url = result?.downloadUrl ?? result?.url;
      if (url) {
        window.open(url, '_blank');
      } else {
        toast.info('下载链接未就绪，请联系管理员');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '下载失败');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <section>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex shrink-0 items-center gap-2 text-sm font-semibold text-slate-600">
                <Lock className="h-4 w-4 text-slate-400" />
                保密级别
              </div>
              {confidentiality ? (
                <span className="inline-flex rounded-md bg-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700">
                  {confidentiality}
                </span>
              ) : (
                <div
                  className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-500"
                  data-testid="preparation-workspace-confidentiality-empty"
                >
                  待接入
                </div>
              )}
            </div>
            <div className="flex items-start gap-3">
              <div className="flex shrink-0 items-center gap-2 text-sm font-semibold text-slate-600">
                <Info className="h-4 w-4 text-slate-400" />
                项目简述
              </div>
              <div
                className="min-h-10 flex-1 rounded-md border border-dashed border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed text-slate-600"
                data-testid={description ? 'preparation-workspace-description' : 'preparation-workspace-description-empty'}
              >
                {description || '暂无数据'}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-4 text-base font-bold text-slate-800">关键联控流程 (EKP)</h3>
        {hasNewEkpCards ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Card A: 检查方案审批 */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-emerald-100 bg-emerald-50">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">检查方案审批</h4>
                    <p className="text-xs text-slate-500 mt-0.5">流程单号: {ekpSummary.approval!.flowId}</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="inline-block rounded bg-emerald-50 px-2 py-1 text-sm font-medium text-emerald-600">
                  {ekpSummary.approval!.label}
                </span>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
                <span className="text-xs text-slate-400">更新时间: {ekpSummary.approval!.updatedAt}</span>
                <button
                  onClick={() => toast.info('即将跳转至企业内部 EKP 系统...')}
                  className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  查看 EKP 流程单 <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Card B: 检查通知下发 */}
            <div className="relative overflow-hidden rounded-xl border border-amber-200 bg-white p-5 shadow-sm flex flex-col justify-between">
              <div className="absolute -right-4 -top-4 h-16 w-16 rounded-bl-full bg-amber-50" />
              <div className="relative z-10 flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-amber-100 bg-amber-50">
                    <Clock className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">检查通知下发</h4>
                    <p className="text-xs text-amber-600/70 mt-0.5">{ekpSummary.dispatch!.label}</p>
                  </div>
                </div>
              </div>
              <div className="relative z-10 flex items-center justify-between">
                <span className="inline-block rounded bg-amber-50 px-2 py-1 text-sm font-medium text-amber-700">
                  {ekpSummary.dispatch!.progressText}
                </span>
              </div>
              <div className="relative z-10 mt-4 flex items-center justify-between border-t border-amber-100 pt-4">
                <span className="text-xs text-amber-500/70">更新时间: {ekpSummary.dispatch!.updatedAt}</span>
                <button
                  onClick={() => toast.info('催办通知已发送')}
                  className="inline-flex items-center rounded-md bg-amber-500 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600"
                >
                  催办签收 (Remind)
                </button>
              </div>
            </div>
          </div>
        ) : hasLegacyEkpEvent ? (
          <div
            className="rounded-lg border border-emerald-200 bg-white p-5 shadow-sm"
            data-testid="preparation-workspace-ekp-plan-scoped"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-emerald-100 bg-emerald-50">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">本系统已记录联控事件</h4>
                  <p className="mt-0.5 text-xs text-slate-500">状态: {ekpSummary.legacy?.status}</p>
                </div>
              </div>
              <span className="rounded bg-emerald-50 px-2 py-1 text-sm font-medium text-emerald-700">
                {ekpSummary.legacy?.latestEventId || `${ekpSummary.legacy?.eventCount} 条事件`}
              </span>
            </div>
          </div>
        ) : (
          <div
            className="rounded-lg border border-dashed border-slate-300 bg-white p-6"
            data-testid="preparation-workspace-ekp-empty"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50">
                <Clock className="h-5 w-5 text-slate-400" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-800">未发起</h4>
                <p className="mt-1 text-sm text-slate-500">
                  暂无当前计划的 EKP 流程数据
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <h3 className="text-base font-bold text-slate-800">检查准备文件清单</h3>
          {editable ? (
            <button
              onClick={() => setDrawerOpen(true)}
              data-testid="preparation-workspace-file-maintenance-btn"
              className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-100 transition-colors"
            >
              <Settings2 className="w-3.5 h-3.5" />
              维护文件
            </button>
          ) : (
            <span className="inline-flex w-fit items-center rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500">
              只读展示
            </span>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {documents.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full whitespace-nowrap text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                  <tr>
                    <th className="px-5 py-3">文件名称</th>
                    <th className="w-32 px-5 py-3 text-center">分类</th>
                    <th className="w-52 px-5 py-3 text-center">大小 / 上传人</th>
                    <th className="w-32 px-5 py-3 text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100" data-testid="preparation-workspace-plan-files">
                  {documents.map(({ key, label, attachment }) => (
                    <tr key={key} className="transition-colors hover:bg-slate-50/50">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center font-medium text-slate-700">
                          {getFileIcon(attachment.name)}
                          <span className="max-w-[24rem] truncate">{attachment.name || attachment.fileId || attachment.id}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="inline-flex rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                          {label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <span className="text-xs font-medium text-slate-900">{formatFileSize(attachment.fileSize)}</span>
                          {attachment.uploadedBy && (
                            <span className="mt-0.5 text-[11px] text-slate-500">{attachment.uploadedBy}</span>
                          )}
                          <span className="mt-0.5 max-w-[12rem] truncate font-mono text-[11px] text-slate-400">
                            {attachment.fileId ?? attachment.id}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleDownload(attachment)}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                            title="下载"
                          >
                            <Download className="w-3.5 h-3.5" />
                            下载
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div
              className="flex items-center justify-center gap-2 px-5 py-8 text-center text-sm text-slate-500"
              data-testid="preparation-workspace-files-empty"
            >
              <AlertCircle className="h-4 w-4 text-slate-400" />
              暂无当前计划的准备文件
            </div>
          )}
        </div>
      </section>

      <FileMaintenanceDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        plan={plan}
        onPlanUpdate={onPlanUpdate}
      />

      <div className="mt-8 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
        阶段流转以详情头部的后端 allowedActions 为准。
      </div>
    </div>
  );
}
