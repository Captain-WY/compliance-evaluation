import React, { useEffect, useMemo, useState } from 'react';
import { assessmentApi, API_MODE } from '../../services/api';
import type { AssessmentResult } from '../../types';
import {
  CheckCircle2,
  ChevronLeft,
  Clock,
  FileText,
  Info,
  Lock,
  Megaphone,
  MessageSquareWarning,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

interface AssessmentScoreCheckProps {
  isLocked?: boolean;
  assessmentName?: string;
  resultId?: string;
  onBack?: () => void;
}

type AssessmentResultExtension = AssessmentResult & {
  ekpStatus: 'DRAFT' | 'PROCESSING' | 'APPROVED' | 'REJECTED';
  requestedScore?: number;
  appealReason?: string;
};

const appealActionTitle = '成绩申诉需真实扣分项、附件上传和状态语义完整绑定；当前清理包不启用本地申诉成功。';
const confirmUnavailableTitle = '仅 real API 模式且当前选中记录绑定真实 AssessmentResult.id 时可提交成绩确认；不会执行本地确认或归档。';

const toScoreCheckResult = (result: AssessmentResult): AssessmentResultExtension => ({
  ...result,
  ekpStatus: result.isDisputed ? 'PROCESSING' : 'DRAFT',
});

export default function AssessmentScoreCheck({
  isLocked = false,
  assessmentName = "2026年度分公司综合考核",
  resultId,
  onBack,
}: AssessmentScoreCheckProps) {
  const [results, setResults] = useState<AssessmentResultExtension[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const loadResults = async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      const items = await assessmentApi.getAssessmentResults();
      setResults(items.map(toScoreCheckResult));
    } catch (err) {
      setResults([]);
      setActionError(err instanceof Error ? err.message : '考核成绩加载失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadResults();
  }, []);

  const selectedResult = useMemo(
    () => resultId ? results.find(result => result.id === resultId) : undefined,
    [resultId, results]
  );
  const confirmableResultId = selectedResult?.id;

  const totalMaxScore = useMemo(() => results.reduce((acc, curr) => acc + curr.maxScore, 0), [results]);
  const totalSystemScore = useMemo(() => results.reduce((acc, curr) => acc + curr.systemScore, 0), [results]);
  const hasAppealsProcessing = selectedResult?.ekpStatus === 'PROCESSING';
  const canConfirmResult = API_MODE === 'real' && Boolean(confirmableResultId) && !hasAppealsProcessing && !isConfirming;

  const handleFinalConfirm = async () => {
    if (!canConfirmResult || !confirmableResultId) return;
    setIsConfirming(true);
    setActionError(null);
    try {
      await assessmentApi.confirmResult(confirmableResultId, '分支用户确认成绩无异议');
      setIsConfirmDialogOpen(false);
      await loadResults();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '成绩确认失败');
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className={`flex flex-col h-full relative ${!isLocked ? 'pb-24' : 'pb-8'}`} data-testid="p1-score-check-page">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between shrink-0 mb-6 rounded-b-xl shadow-sm">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            data-testid="p1-score-check-back"
            className="text-slate-500 hover:text-slate-800 -ml-2 border border-transparent hover:bg-slate-100"
            onClick={onBack}
          >
            <ChevronLeft className="w-4 h-4 mr-1"/> 返回
          </Button>
          <h2 className="text-xl font-bold text-slate-900">考核成绩核对 <span className="text-sm font-normal text-slate-400 ml-2">(Assessment Score Check)</span></h2>
        </div>

        <div className="mt-4 md:mt-0 text-sm font-medium text-slate-600 bg-slate-100/80 border border-slate-200 px-4 py-1.5 rounded-full flex items-center">
          <FileText className="w-4 h-4 mr-2 text-slate-400"/>
          {assessmentName}
        </div>
      </div>

      <div className="mx-6">
        {isLocked ? (
          <div className="bg-slate-100 border border-slate-200 p-4 rounded-lg flex items-start gap-3 mb-6 opacity-80">
            <Lock className="w-5 h-5 text-slate-500 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-slate-700">历史考核档案 (Read-only Archive)</h3>
              <p className="text-sm text-slate-500 mt-1">本期考核成绩已完成档案锁定。当前页面为历史快照，无法发起申诉或修改成绩。</p>
            </div>
          </div>
        ) : (
          <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg flex items-start gap-3 mb-6">
            <Info className="w-5 h-5 text-blue-500 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-blue-800">成绩核对期</h3>
              <p className="text-sm text-blue-600 mt-1">请仔细核对本期考核的最终得分与扣分明细。如无异议，可提交成绩确认；扣分申诉入口需在真实附件和扣分项绑定完成后开放。</p>
            </div>
          </div>
        )}

        {actionError && (
          <div className="mb-6 rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700" data-testid="p1-score-check-action-error">
            {actionError}
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm mb-6 flex flex-col md:flex-row md:items-center justify-between mx-6 relative overflow-hidden">
        {isLocked && (
          <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none flex flex-col items-center rotate-12">
            <div className="border-4 border-slate-800 text-slate-800 font-black text-4xl p-2 rounded tracking-widest">已归档</div>
          </div>
        )}
        <div className="space-y-1 mb-4 md:mb-0 relative z-10">
          <div className="text-lg font-bold text-slate-800">{assessmentName}</div>
          <div className="text-sm text-slate-500">考核对象: 当前登录机构 | API 模式: {API_MODE}</div>
        </div>
        <div className="flex items-center gap-6 relative z-10">
          <div className="text-right">
            <div className="text-sm text-slate-500 mb-1">本期总得分</div>
            <div className="text-4xl font-black text-blue-600">
              {isLoading && results.length === 0 ? '--' : totalSystemScore}<span className="text-xl text-slate-400 font-normal"> / {totalMaxScore || '--'}</span>
            </div>
          </div>
          <div className="h-12 w-px bg-slate-200"></div>
          <div className="text-right">
            <div className="text-sm text-slate-500 mb-1">累计扣分</div>
            <div className="text-2xl font-bold text-rose-500">
              {totalMaxScore ? `-${totalMaxScore - totalSystemScore} 分` : '--'}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-6 mb-8 space-y-4">
        {isLoading && results.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            加载考核成绩中
          </div>
        )}

        {!isLoading && results.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            暂无可核对的考核成绩
          </div>
        )}

        {results.map((result) => {
          const isDeducted = result.systemScore < result.maxScore && result.ekpStatus !== 'APPROVED';
          const isPerfect = result.systemScore === result.maxScore || result.ekpStatus === 'APPROVED';

          if (isPerfect) {
            return (
              <div key={result.id} data-testid={`p1-score-check-result-${result.id}`} className={`bg-slate-50/50 border border-slate-100 rounded-xl p-4 mb-4 ${isLocked ? 'opacity-70' : 'opacity-80 hover:opacity-100'} transition-opacity`}>
                <div className="flex justify-between items-center">
                  <h3 className="font-medium text-slate-700">{result.indicatorName}</h3>
                  <Badge variant="outline" className="text-emerald-600 bg-emerald-50 border-emerald-200">
                    <CheckCircle2 className="w-3 h-3 mr-1"/> 满分通过 ({result.systemScore}/{result.maxScore})
                  </Badge>
                </div>
              </div>
            );
          }

          return (
            <div key={result.id} data-testid={`p1-score-check-result-${result.id}`} className={`bg-rose-50/30 border-2 border-rose-300 rounded-xl p-6 mb-4 relative shadow-sm ${isLocked ? 'opacity-80' : ''}`}>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg text-slate-800">{result.indicatorName}</h3>
                  <span className="text-xs font-medium text-slate-500">{result.category}</span>
                </div>
                <div className="text-rose-600 font-bold text-xl text-right">
                  得分: {result.systemScore} <span className="text-sm font-normal text-slate-500">/ {result.maxScore} 分</span>
                </div>
              </div>

              <div className="bg-white border border-rose-200 p-4 rounded-md mt-4 text-sm text-rose-800">
                <div className="font-bold mb-1 flex items-center">
                  <MessageSquareWarning className="w-4 h-4 mr-1"/> 总部扣分原因:
                </div>
                {result.deductionReason || '系统判定扣分'}
              </div>

              {!isLocked ? (
                <div className="flex justify-end mt-4 pt-4 border-t border-rose-100">
                  {result.ekpStatus === 'PROCESSING' ? (
                     <Button variant="secondary" disabled data-testid={`p1-score-check-appeal-processing-${result.id}`} className="bg-blue-50 text-blue-600 border-transparent">
                       <Clock className="w-4 h-4 mr-2"/> 申诉处理中
                     </Button>
                  ) : (
                     <Button variant="outline" disabled title={appealActionTitle} data-testid={`p1-score-check-appeal-${result.id}`} className="text-slate-400 border-slate-200 bg-white shadow-sm">
                       <Megaphone className="w-4 h-4 mr-2"/> 发起申诉 (Appeal)
                     </Button>
                  )}
                </div>
              ) : (
                <div className="mt-4 pt-2 border-t border-rose-100/50">
                   <div className="text-xs text-slate-400 italic text-right">核对期已结束，申诉通道已关闭</div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!isLocked && (
        <div className="fixed bottom-0 left-0 lg:left-64 right-0 bg-white border-t border-slate-200 p-4 flex justify-between items-center z-50 shadow-md">
          <div className="text-sm text-slate-600">当前总得分: <span className="font-bold text-lg text-blue-600">{totalSystemScore}</span> / {totalMaxScore || '--'} 分</div>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 disabled:bg-slate-200 disabled:text-slate-500"
            data-testid="p1-score-check-final-confirm"
            onClick={() => setIsConfirmDialogOpen(true)}
            disabled={!canConfirmResult}
            title={!canConfirmResult ? confirmUnavailableTitle : undefined}
          >
            <CheckCircle2 className="w-4 h-4 mr-2"/> 无异议，确认成绩
          </Button>
        </div>
      )}

      {!isLocked && (
        <AlertDialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认本期考核最终成绩？</AlertDialogTitle>
              <AlertDialogDescription>
                确认后，本期成绩将记录为分支已确认状态；最终归档仍由已接受的结果归档流程处理。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel variant="outline" size="default">再看看</AlertDialogCancel>
              <AlertDialogAction
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                data-testid="p1-score-check-confirm-archive"
                disabled={!canConfirmResult}
                onClick={() => void handleFinalConfirm()}
              >
                {isConfirming ? '提交中' : '确认成绩'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
