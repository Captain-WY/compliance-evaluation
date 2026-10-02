import React, { useState, useEffect } from 'react';
import {
  getClueDetail,
  closeClue,
  prepareClueForCase,
  type ClueRecord,
  type CluePrefillData,
} from '../../services/case';
import Button from '../../components/ui/Button';
import {
  ArrowLeft, AlertTriangle, ShieldCheck, FileText, ArrowRight,
  Loader2, Building2, DollarSign, User, Tag, Clock,
} from 'lucide-react';
import NewCaseForm from '../cases/NewCaseForm';

interface ClueDetailProps {
  clueId: string;
  onBack: () => void;
  onCaseCreated: () => void | Promise<void>;
}

const STATUS_STYLE: Record<string, string> = {
  NEW: 'bg-red-50 text-red-700 border-red-100',
  FOLLOWING: 'bg-amber-50 text-amber-700 border-amber-100',
  CONVERTED: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  REJECTED: 'bg-slate-100 text-slate-500 border-slate-200',
  CLOSED: 'bg-slate-100 text-slate-500 border-slate-200',
};

const SOURCE_LABEL: Record<string, string> = {
  EMAIL: '智能收件箱转入',
  MANUAL: '手工录入',
  API: '业务系统推送',
};

const ClueDetail: React.FC<ClueDetailProps> = ({ clueId, onBack, onCaseCreated }) => {
  const [clue, setClue] = useState<ClueRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [prefill, setPrefill] = useState<CluePrefillData | null>(null);

  useEffect(() => {
    getClueDetail(clueId).then(data => {
      setClue(data);
      setLoading(false);
    });
  }, [clueId]);

  const handleClose = async (targetStatus: 'REJECTED' | 'CLOSED') => {
    if (!clue) return;
    const reason = window.prompt(
      targetStatus === 'REJECTED' ? '请填写驳回原因：' : '请填写关闭原因（可选）：',
    );
    if (reason === null) return; // cancelled
    setClosing(true);
    const ok = await closeClue(clue.clueId, targetStatus, reason || undefined);
    setClosing(false);
    if (ok) onBack();
  };

  const handleConvert = async () => {
    if (!clue) return;
    setPreparing(true);
    const data = await prepareClueForCase(clue.clueId);
    setPreparing(false);
    if (!data) {
      alert('获取预填数据失败，请重试。');
      return;
    }
    setPrefill(data);
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
      </div>
    );
  }

  if (!clue) {
    return (
      <div className="p-12 text-center text-slate-400">
        <p>线索不存在或已被删除。</p>
        <Button variant="ghost" size="sm" onClick={onBack} className="mt-4">返回列表</Button>
      </div>
    );
  }

  // 转立案：展示 NewCaseForm
  if (prefill) {
    return (
      <NewCaseForm
        initialData={{
          title: prefill.prefillData.caseName,
          clueId: prefill.prefillData.sourceClueId,
          businessLine: prefill.prefillData.businessLine,
          estimatedAmount: prefill.prefillData.estimatedAmount,
        }}
        onCancel={() => setPrefill(null)}
        onSuccess={async () => {
          setPrefill(null);
          await onCaseCreated();
        }}
      />
    );
  }

  const isActive = clue.status === 'NEW' || clue.status === 'FOLLOWING';

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="text-slate-500 mb-2">
        <ArrowLeft className="w-4 h-4 mr-1" /> 返回列表
      </Button>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-slate-50 px-8 py-6 border-b border-slate-100 flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded border ${STATUS_STYLE[clue.status] ?? 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                {clue.statusName}
              </span>
              <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                {SOURCE_LABEL[clue.sourceType] ?? clue.sourceTypeName}
              </span>
              <span className="text-xs text-slate-400 font-mono">{clue.clueId.slice(0, 8)}…</span>
            </div>
            <h2 className="text-xl font-bold text-slate-800 max-w-3xl">{clue.clueTitle}</h2>
          </div>
          <div className="text-right text-sm text-slate-500">
            <div className="flex items-center gap-1 mb-1"><Clock className="w-3.5 h-3.5" /> {clue.createdAt.slice(0, 10)}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 divide-x divide-slate-100">
          {/* Left: 基础信息 */}
          <div className="p-8 space-y-5">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <FileText className="w-5 h-5 text-slate-400" /> 线索基础信息
            </h3>

            {clue.description && (
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase">情况描述</label>
                <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{clue.description}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1">
                  <User className="w-3 h-3" /> 对方当事人
                </label>
                <p className="text-sm text-slate-700 mt-1">{clue.opponentName || '—'}</p>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1">
                  <Building2 className="w-3 h-3" /> 所属业务线
                </label>
                <p className="text-sm text-slate-700 mt-1">{clue.businessLine || '—'}</p>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1">
                <DollarSign className="w-3 h-3" /> 预估金额
              </label>
              <p className="text-lg font-bold font-mono text-brand-600 mt-1">
                {clue.estimatedAmount != null
                  ? `¥ ${clue.estimatedAmount.toLocaleString()} ${clue.currency}`
                  : '—'}
              </p>
            </div>

            {clue.closedReason && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <label className="text-xs font-bold text-slate-400 uppercase">关闭原因</label>
                <p className="text-sm text-slate-600 mt-1">{clue.closedReason}</p>
              </div>
            )}
          </div>

          {/* Right: 智能研判 */}
          <div className="p-8 bg-brand-50/10 space-y-5">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-brand-500" /> 研判与处置
            </h3>

            {/* AI 摘要 stub 说明 */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs text-slate-500 space-y-1">
              <p className="font-bold text-slate-600">AI 智能分析</p>
              <p>线索 AI 摘要与风险评估将在 Legal Brain (S17) 接入后自动生成。</p>
              <p className="flex items-center gap-1 text-amber-600">
                <AlertTriangle className="w-3 h-3" /> 当前为 Stub 占位，请人工研判。
              </p>
            </div>

            {clue.convertedCaseId && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <p className="text-xs font-bold text-emerald-700 mb-1">已转立案</p>
                <p className="text-xs text-slate-600 font-mono">案件ID: {clue.convertedCaseId}</p>
              </div>
            )}

            {/* 操作区 */}
            <div className="pt-4 border-t border-slate-100 space-y-3">
              {isActive && (
                <>
                  <Button
                    className="w-full"
                    onClick={handleConvert}
                    isLoading={preparing}
                  >
                    <ArrowRight className="w-4 h-4 mr-2" /> 转立案登记
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 text-amber-600 border-amber-200 hover:bg-amber-50"
                      onClick={() => handleClose('REJECTED')}
                      isLoading={closing}
                    >
                      驳回无效
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 text-slate-600"
                      onClick={() => handleClose('CLOSED')}
                      isLoading={closing}
                    >
                      关闭线索
                    </Button>
                  </div>
                </>
              )}
              {!isActive && (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Tag className="w-4 h-4" />
                  线索已处于终态（{clue.statusName}），无法继续操作。
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClueDetail;
