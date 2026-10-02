import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, UploadCloud, FileText, Trash2, FolderSearch, Sparkles, Paperclip, AlertCircle, Lock, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from 'sonner';
import { assessmentApi, fileApi } from '../../services/api';
import type { FormIndicator } from '../../services/api';
import { formatReportingSubmitError, type ReportingSubmitErrorNotice } from './reportingSubmitErrors';

interface AssessmentDataFormProps {
  onBack: () => void;
  taskId: string;
}



export default function AssessmentDataForm({ onBack, taskId }: AssessmentDataFormProps) {
  const [indicators, setIndicators] = useState<FormIndicator[]>([]);
  const [activeAnchor, setActiveAnchor] = useState<string>('IND-01');
  const [isImportSheetOpen, setIsImportSheetOpen] = useState(false);
  const [importTargetId, setImportTargetId] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState("尚未保存");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<ReportingSubmitErrorNotice | null>(null);
  const [reportingStatus, setReportingStatus] = useState<string | null>(null);

  const refreshReportingTask = useCallback(async () => {
    const [detail, items] = await Promise.all([
      assessmentApi.getReportingTaskDetail(taskId).catch(() => null),
      assessmentApi.getFormIndicators(taskId),
    ]);
    setIndicators(items);
    if (items[0]?.id) setActiveAnchor(items[0].id);
    setReportingStatus(typeof detail?.status === 'string' ? detail.status : null);
    setLoadError(null);
  }, [taskId]);

  useEffect(() => {
    let cancelled = false;
    refreshReportingTask()
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshReportingTask]);

  const handleValueChange = (id: string, val: string) => {
    setIndicators(prev => prev.map(i => i.id === id ? { ...i, value: val } : i));
  };

  const openImportSheet = (id: string) => {
    setImportTargetId(id);
    setIsImportSheetOpen(true);
  };

  const handleImport = () => {
    if (!importTargetId) return;

    setIndicators(prev => prev.map(ind => {
      if (ind.id === importTargetId) {
        // Mock UI Update Simulation
        return {
          ...ind,
          value: ind.type === 'QUALITATIVE' ? (ind.value ? ind.value + '\n[系统模拟：文本框内容已被自动补充]' : '[系统模拟：文本框内容已被自动补充]') : ind.value,
          files: [
            ...ind.files,
            { id: `LEDGER-${Date.now()}`, name: '异常交易线索筛查底稿.pdf', fromLedger: true }
          ]
        };
      }
      return ind;
    }));

    setIsImportSheetOpen(false);
    toast.success("提取成功", { description: "已将台账摘要追加至文本框，并成功挂载 1 份佐证材料。" });
  };

  const toPayloadItems = () => indicators.map(indicator => ({
    responseItemId: indicator.id,
    value: indicator.value ?? '',
    fileIds: indicator.files.map(file => file.id),
  }));

  const handleFileUpload = async (indicatorId: string, file: File) => {
    try {
      const uploaded = await fileApi.uploadFile(file);
      setIndicators(prev => prev.map(indicator => indicator.id === indicatorId
        ? {
            ...indicator,
            files: [
              ...indicator.files,
              { id: uploaded.fileId ?? uploaded.id, name: uploaded.fileName ?? file.name },
            ],
          }
        : indicator
      ));
      toast.success("上传成功", { description: "佐证材料已通过真实文件接口上传。" });
    } catch (err) {
      toast.error("上传失败", { description: err instanceof Error ? err.message : "请稍后重试" });
    }
  };

  const handleSaveDraft = async () => {
    setIsSaving(true);
    try {
      await assessmentApi.saveReportingDraft(taskId, toPayloadItems());
      setLastSavedTime(new Date().toLocaleTimeString());
      toast.success("草稿保存成功", { description: "已为您保存当前填报进度。" });
    } catch (err) {
      toast.error("草稿保存失败", { description: err instanceof Error ? err.message : "请稍后重试" });
    } finally {
      setIsSaving(false);
    }
  };

  const filledCount = indicators.filter(i => i.value && i.value.trim().length > 0).length;
  const totalCount = indicators.length;
  const progressValue = totalCount > 0 ? Math.round((filledCount / totalCount) * 100) : 0;
  const isSubmitted = reportingStatus === 'SUBMITTED' || reportingStatus === 'ACCEPTED' || reportingStatus === 'CLOSED';

  const handleSubmitReporting = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const submittedTask = await assessmentApi.submitReportingTask(taskId, toPayloadItems());
      setReportingStatus(typeof submittedTask?.status === 'string' ? submittedTask.status : 'SUBMITTED');
      try {
        await refreshReportingTask();
      } catch (refreshError) {
        toast.warning("提交已成功，状态刷新失败", {
          description: refreshError instanceof Error ? refreshError.message : "请返回任务列表后刷新确认最新状态。",
        });
      }
      setIsSubmitDialogOpen(false);
      toast.success("提交成功", { description: "考核卷已流转至下一审批环节。" });
      setTimeout(onBack, 500);
    } catch (err) {
      const notice = formatReportingSubmitError(err, indicators);
      setSubmitError(notice);
      toast.error(notice.title, { description: notice.description });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusDot = (indicator: FormIndicator) => {
    if (indicator.status === 'REJECTED') {
      return <div className="w-2 h-2 rounded-full bg-rose-500 mt-1.5 shrink-0 shadow-sm" />;
    }
    if (indicator.value && indicator.value.trim().length > 0) {
      if (indicator.type === 'QUANTITATIVE' && indicator.files.length === 0) {
        return <span className="text-[10px]">🟡</span>; // Filled but missing mandatory file
      }
      return <span className="text-[10px]">🟢</span>;
    }
    return <span className="text-[10px]">⚪</span>;
  };

  const scrollToAnchor = (id: string) => {
    setActiveAnchor(id);
    const element = document.getElementById(`indicator-${id}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="flex flex-col h-full h-[calc(100vh-4rem)] bg-slate-50 relative" data-testid="p1-reporting-page">
      {loadError && (
        <div className="m-6 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {loadError}
        </div>
      )}
      {submitError && (
        <div className="m-6 mb-0 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700" data-testid="p1-reporting-submit-error">
          <div className="font-bold">{submitError.title}</div>
          <div className="mt-1">{submitError.description}</div>
        </div>
      )}
      {/* Workspace Header (Sticky Top) */}
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center">
          <Button variant="ghost" className="mr-4" data-testid="p1-reporting-back" onClick={onBack}>
            <ChevronLeft className="w-4 h-4 mr-1"/> 返回任务列表
          </Button>
          <h2 className="text-lg font-bold">2026年Q1营业部综合考核</h2>
        </div>
        
        <div className="flex items-center gap-3 hidden md:flex">
          <div className="text-sm text-slate-500">总体进度: {progressValue}%</div>
          <Progress value={progressValue} className="w-48 h-2"/>
          <div className="text-sm font-medium text-slate-700">{filledCount} / {totalCount} 项</div>
        </div>

        <div className="text-xs font-medium bg-rose-50 text-rose-700 px-3 py-1.5 rounded-full border border-rose-200 shadow-sm">
          ⏳ 距离截止还剩 7 天
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left (Main Area - 75%) */}
        <div className="flex-1 overflow-y-auto p-8 lg:p-10 pb-32 scroll-smooth">
          <div className="max-w-4xl mx-auto space-y-6">
            {indicators.map((ind, index) => {
              const isRejected = ind.status === 'REJECTED';
              const isLocked = ind.status === 'LOCKED';
              
              return (
              <div 
                key={ind.id} 
                id={`indicator-${ind.id}`}
                data-testid={`p1-reporting-indicator-${ind.indicatorId ?? ind.id}`}
                className={
                  isRejected 
                    ? "bg-rose-50/30 border-2 border-rose-400 rounded-xl p-6 mb-6 shadow-sm hover:shadow-md transition-shadow relative"
                    : "bg-white rounded-xl border border-slate-200 p-6 mb-6 shadow-sm hover:shadow-md transition-shadow relative"
                }
              >
                {/* Common Header */}
                <div className="flex items-start gap-4 mb-4">
                  <div className="bg-slate-100 text-slate-600 w-8 h-8 rounded flex items-center justify-center font-bold text-sm shrink-0 mt-0.5">
                    {(index + 1).toString().padStart(2, '0')}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-bold text-slate-900 text-lg">{ind.title}</h3>
                      {isLocked && (
                        <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 ml-auto mr-2">
                          <Lock className="w-3 h-3 mr-1"/> 已通过锁定
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 mt-1 whitespace-pre-wrap leading-relaxed">{ind.description}</p>
                  </div>
                </div>

                {isRejected && (
                  <Alert className="mb-5 bg-rose-50 border-rose-200 text-rose-800 ml-12 w-[calc(100%-3rem)] overflow-hidden">
                    <AlertCircle className="h-4 w-4 text-rose-600" />
                    <AlertTitle className="font-bold text-rose-700">总部审核驳回意见</AlertTitle>
                    <AlertDescription className="text-sm mt-1 break-words whitespace-normal w-full overflow-hidden">
                      {ind.hqComment}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Input Area */}
                <div className="ml-12 p-5 bg-slate-50 rounded-lg border border-slate-100 flex flex-col md:flex-row gap-6">
                  <div className="flex-1">
                    {/* 自评得分输入区 (新增) */}
                    <div className="mb-5 p-3 bg-indigo-50/50 border border-indigo-100 rounded-lg flex items-center justify-between">
                      <div className="flex flex-col">
                        <label className="text-sm font-bold text-slate-700 flex items-center">
                          本项自评得分 <span className="text-rose-500 ml-1">*</span>
                        </label>
                        <span className="text-[10px] text-slate-500">请基于完成情况进行客观打分 (0-100分)</span>
                      </div>
                      <div className="flex items-center">
                        <Input 
                          data-testid={`p1-reporting-self-score-${ind.indicatorId ?? ind.id}`}
                          type="number" 
                          min="0" 
                          max="100" 
                          placeholder="0 - 100" 
                          className="w-24 text-center font-bold text-indigo-700 border-indigo-200 focus-visible:ring-indigo-500"
                          /* onChange={(e) => handleSelfScoreChange(item.id, e.target.value)} */
                        />
                        <span className="ml-2 text-sm text-slate-500 font-medium">分</span>
                      </div>
                    </div>

                    {ind.type === 'QUANTITATIVE' ? (
                      <div className="mb-4">
                        <label className="block text-sm font-bold text-slate-700 mb-2">填报数值</label>
                        <div className="flex items-center gap-2 max-w-[200px]">
                          <Input 
                            data-testid={ind.indicatorId ? `p1-reporting-value-${ind.indicatorId}` : `p1-reporting-value-${ind.id}`}
                            type="number" 
                            placeholder="0.00" 
                            className="text-lg font-bold" 
                            value={ind.value}
                            onChange={e => handleValueChange(ind.id, e.target.value)}
                            disabled={isLocked}
                            readOnly={isLocked}
                          />
                          {ind.unit && <span className="text-slate-500 font-medium">{ind.unit}</span>}
                        </div>
                        <div className="text-rose-500 text-xs mt-2 font-medium">* 填报数值必须上传佐证材料</div>
                      </div>
                    ) : (
                      <div className="mb-4">
                        <label className="block text-sm font-bold text-slate-700 mb-2">执行情况说明</label>
                        <Textarea 
                          data-testid={ind.indicatorId ? `p1-reporting-text-${ind.indicatorId}` : `p1-reporting-text-${ind.id}`}
                          placeholder="请输入本季度相关工作的开展情况、亮点与自我评价..." 
                          className="min-h-[150px] bg-white resize-y" 
                          value={ind.value}
                          onChange={e => handleValueChange(ind.id, e.target.value)}
                          disabled={isLocked}
                          readOnly={isLocked}
                        />
                        <div className="text-slate-400 text-xs mt-2">建议上传佐证材料 (选填)</div>
                      </div>
                    )}
                  </div>

                  {/* Evidence Upload */}
                  <div className={`w-full md:w-64 lg:w-72 shrink-0 border-t md:border-t-0 md:border-l border-slate-200 pt-4 md:pt-0 md:pl-6 flex flex-col ${isLocked ? 'opacity-60 pointer-events-none' : ''}`}>
                    <label className="block text-sm font-bold text-slate-700 mb-2">佐证材料 (凭证/底稿)</label>
                    <div className="flex items-center justify-between bg-blue-50/50 border border-blue-100 rounded-md p-2 mb-3">
                      <div className="text-[11px] text-blue-700 flex items-center leading-tight max-w-[60%]">
                        <Sparkles className="w-3 h-3 mr-1 text-blue-500 shrink-0"/> 
                        发现 2 条相关台账记录
                      </div>
                      <Button size="sm" variant="outline" data-testid={`p1-reporting-import-ledger-${ind.indicatorId ?? ind.id}`} className="h-6 text-xs text-blue-600 border-blue-200 hover:bg-blue-100 bg-white shrink-0 px-2" onClick={() => openImportSheet(ind.id)}>
                        <FolderSearch className="w-3 h-3 mr-1"/> 
                        从台账提取
                      </Button>
                    </div>

                    <label className="border border-dashed border-slate-300 rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100 transition-colors bg-white mb-3 text-center">
                      <UploadCloud className="w-6 h-6 text-slate-400 mb-2" />
                      <span className="text-xs font-medium text-slate-600">点击或拖拽文件上传</span>
                      <input
                        data-testid={`p1-reporting-file-${ind.indicatorId ?? ind.id}`}
                        type="file"
                        className="hidden"
                        disabled={isLocked}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void handleFileUpload(ind.id, file);
                          event.currentTarget.value = '';
                        }}
                      />
                    </label>

                    <div className="space-y-2 flex-1">
                      {ind.files.length === 0 ? (
                        <div className="text-xs text-slate-400 italic text-center">暂无附件</div>
                      ) : (
                        ind.files.map(file => (
                          <div key={file.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-2 bg-white border border-slate-200 rounded text-[11px] group">
                            <div className="flex items-center overflow-hidden flex-1">
                              <FileText className="w-3.5 h-3.5 text-blue-500 shrink-0 mr-1.5" />
                              <span className="truncate text-slate-700">{file.name}</span>
                              {file.fromLedger && (
                                <Badge variant="secondary" className="text-[9px] bg-indigo-50 text-indigo-600 ml-1.5 px-1 py-0 h-4 min-h-0 border-indigo-100 shrink-0 font-normal">来自台账</Badge>
                              )}
                            </div>
                            <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-rose-500 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0 mt-1 sm:mt-0" />
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        </div>

        {/* Right (Anchor Nav - 25%) */}
        <div className="hidden lg:block w-72 shrink-0 border-l border-slate-200 bg-slate-50/50 p-6 overflow-y-auto">
          <h4 className="text-sm font-bold text-slate-900 mb-4 sticky top-0 bg-slate-50 pb-2">快速导航 (快捷锚点)</h4>
          <div className="space-y-1">
            {indicators.map(ind => {
              const dot = getStatusDot(ind);
              const isActive = activeAnchor === ind.id;
              return (
                <button
                  key={ind.id}
                  data-testid={`p1-reporting-anchor-${ind.indicatorId ?? ind.id}`}
                  onClick={() => scrollToAnchor(ind.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-md text-sm transition-all flex items-start gap-2 ${
                    isActive 
                      ? 'bg-blue-50 text-blue-700 font-bold border border-blue-100' 
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
                  }`}
                >
                  <span className="text-xs mt-0.5">{dot}</span>
                  <span className="truncate flex-1" title={ind.title}>{ind.title}</span>
                </button>
              )
            })}
          </div>
          <div className="mt-8 p-4 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 space-y-2 shadow-sm">
            <div className="font-bold text-slate-800 mb-1">图例说明:</div>
            <div className="flex items-center gap-2 text-sm text-slate-600"><div className="w-2 h-2 rounded-full bg-rose-500"></div> 驳回需修改</div>
            <div className="flex items-center gap-2"><span>🟢</span> 已填报并符合要求</div>
            <div className="flex items-center gap-2"><span>🟡</span> 已填报但缺少必填附件</div>
            <div className="flex items-center gap-2"><span>⚪</span> 未填报</div>
          </div>
        </div>
      </div>

      {/* Footer Action Bar (Sticky Bottom) */}
      {/* Assuming a standard sidebar layout width calculation or absolute positioning, using responsive fixed bottom */}
      <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 flex justify-between items-center z-50 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
        <div className="text-sm font-medium text-slate-500">
          已填报 {filledCount} / {totalCount} 项 <span className="mx-2 text-slate-300">|</span> 上次手动保存: {lastSavedTime}
        </div>
        <div className="flex items-center">
          <Button 
            variant="outline" 
            className="mr-3 border-slate-300 text-slate-700 w-32" 
            data-testid="p1-reporting-save-draft"
            onClick={handleSaveDraft} 
            disabled={isSaving}
          >
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : null}
            {isSaving ? "保存中..." : "保存草稿"}
          </Button>
          <Button 
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 min-w-[140px]" 
            data-testid="p1-reporting-submit"
            onClick={() => {
              setSubmitError(null);
              setIsSubmitDialogOpen(true);
            }}
            disabled={isSubmitted}
          >
            {isSubmitted ? "已提交" : "提交审核"}
          </Button>
        </div>
      </div>

      <AlertDialog open={isSubmitDialogOpen} onOpenChange={(open) => {
        if (!isSubmitting) setIsSubmitDialogOpen(open);
      }}>
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle>确认提交审核？</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600 mt-2">
              当前进度：<strong className="text-slate-800">{filledCount} / {totalCount} 项</strong> 已填报。
              <br/>
              提交后该考核卷将进入审核流程，<span className="text-rose-500 font-bold">您将无法再进行修改</span>。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {submitError && (
            <Alert className="mt-4 bg-rose-50 border-rose-200 text-rose-800" data-testid="p1-reporting-submit-dialog-error">
              <AlertCircle className="h-4 w-4 text-rose-600" />
              <AlertTitle className="font-bold text-rose-700">{submitError.title}</AlertTitle>
              <AlertDescription className="text-sm mt-1 break-words">
                {submitError.description}
              </AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel variant="outline" size="default" disabled={isSubmitting}>取消</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="p1-reporting-confirm-submit"
              disabled={isSubmitting}
              onClick={(e) => {
                e.preventDefault(); // Prevent modal from closing immediately
                void handleSubmitReporting();
              }}
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : null}
              {isSubmitting ? "提交中..." : "确认提交"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={isImportSheetOpen} onOpenChange={setIsImportSheetOpen}>
        <SheetContent className="sm:max-w-[450px] bg-slate-50 flex flex-col h-full">
          <SheetHeader>
            <SheetTitle>提取日常履职记录</SheetTitle>
            <SheetDescription>选择要导入到当前指标的台账内容与附件。</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 mt-4 flex-1 overflow-y-auto">
            <div className="flex items-start gap-3 p-3 bg-white border border-slate-200 rounded-lg hover:border-blue-300 transition-colors">
              <Checkbox id="ledger-1" className="mt-1" />
              <div>
                <label htmlFor="ledger-1" className="text-sm font-bold text-slate-800 cursor-pointer">发现并上报疑似客户异常交易线索</label>
                <div className="text-xs text-slate-500 mt-1">2026-04-22 | <Paperclip className="w-3 h-3 inline"/> 1 份附件</div>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-white border border-slate-200 rounded-lg hover:border-blue-300 transition-colors">
              <Checkbox id="ledger-2" className="mt-1" />
              <div>
                <label htmlFor="ledger-2" className="text-sm font-bold text-slate-800 cursor-pointer">配合公安机关完成客户信息协查</label>
                <div className="text-xs text-slate-500 mt-1">2026-04-10 | <Paperclip className="w-3 h-3 inline"/> 3 份附件</div>
              </div>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-200 shrink-0">
            <Button className="w-full bg-blue-600 hover:bg-blue-700" data-testid="p1-reporting-confirm-import-ledger" onClick={handleImport}>确认提取 (导入 1 项)</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
