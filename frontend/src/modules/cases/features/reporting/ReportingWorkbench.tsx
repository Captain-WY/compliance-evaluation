
import React, { useEffect, useState } from 'react';
import { Case } from '../../types';
import {
  listReportingTasks,
  updateReportingTaskStatus,
  listComplianceAlerts,
  handleComplianceAlert,
  downloadTaskFiles,
  type ReportingTaskRecord,
  type ComplianceAlertRecord,
} from '../../services/case';
import { getCases } from '../../services/case';
import {
  FileBarChart, CheckCircle2, Clock, FileText, Loader2, Send, AlertTriangle,
  Megaphone, Plus, Download, Zap, Lock, Eye, X, UserCheck,
  Archive, FileSpreadsheet, History, MessageSquare,
  AlertCircle,
} from 'lucide-react';
import Button from '../../components/ui/Button';

// ── Sub-Component: Rejection Modal ──────────────────────────────────────────

interface RejectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string, suggestion: string) => void;
  isProcessing: boolean;
}

const RejectionModal: React.FC<RejectionModalProps> = ({ isOpen, onClose, onConfirm, isProcessing }) => {
  const [reason, setReason] = useState('');
  const [suggestion, setSuggestion] = useState('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-red-50 px-6 py-4 border-b border-red-100 flex justify-between items-center">
          <h3 className="font-bold text-red-800 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" /> 驳回任务 (Reject Task)
          </h3>
          <button onClick={onClose} className="text-red-400 hover:text-red-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600">您正在驳回该报送任务。为了帮助发起人修正，请务必填写驳回原因。</p>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">驳回原因（必填）</label>
            <textarea
              className="w-full border border-slate-300 rounded p-2 text-sm h-24 focus:ring-2 focus:ring-red-500 outline-none"
              placeholder="例如：金额数据与财务报表不符..."
              value={reason}
              onChange={e => setReason(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">修改建议（可选）</label>
            <textarea
              className="w-full border border-slate-300 rounded p-2 text-sm h-16 focus:ring-2 focus:ring-red-500 outline-none"
              placeholder="例如：请核对2月28日的利息计提..."
              value={suggestion}
              onChange={e => setSuggestion(e.target.value)}
            />
          </div>
        </div>
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isProcessing}>取消</Button>
          <Button
            onClick={() => onConfirm(reason, suggestion)}
            isLoading={isProcessing}
            disabled={!reason.trim()}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            确认驳回
          </Button>
        </div>
      </div>
    </div>
  );
};

// ── Sub-Component: Report Preview Modal ─────────────────────────────────────

interface ReportPreviewModalProps {
  task: ReportingTaskRecord;
  caseRows: Case[];
  onClose: () => void;
  onAction: (action: 'APPROVE' | 'REJECT' | 'DOWNLOAD') => void;
  isProcessing: boolean;
}

const ReportPreviewModal: React.FC<ReportPreviewModalProps> = ({ task, caseRows, onClose, onAction, isProcessing }) => {
  const isExcel = !task.taskName.includes('公告') && !task.taskName.includes('披露');
  const [activeTab, setActiveTab] = useState<'PREVIEW' | 'HISTORY'>('PREVIEW');

  const previewRows = caseRows.slice(0, 5);

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isExcel ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'}`}>
              {isExcel ? <FileSpreadsheet className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                {task.taskName}
                {task.cycleValue && (
                  <span className="text-xs font-normal text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                    {task.cycleValue} 期
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                <span className="flex items-center gap-1">
                  {task.snapshotId ? <Lock className="w-3 h-3 text-brand-500" /> : <AlertTriangle className="w-3 h-3 text-amber-500" />}
                  {task.snapshotId ? `基于快照: ${task.snapshotId.slice(0, 8)}...` : '基于实时数据 (预览)'}
                </span>
                <span>•</span>
                <span>创建人: {task.createdBy || '—'}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="bg-slate-200/50 p-1 rounded-lg flex text-xs font-bold text-slate-600">
              <button
                onClick={() => setActiveTab('PREVIEW')}
                className={`px-3 py-1.5 rounded transition-all flex items-center gap-2 ${activeTab === 'PREVIEW' ? 'bg-white shadow text-brand-600' : 'hover:bg-slate-200'}`}
              >
                <Eye className="w-3 h-3" /> 内容预览
              </button>
              <button
                onClick={() => setActiveTab('HISTORY')}
                className={`px-3 py-1.5 rounded transition-all flex items-center gap-2 ${activeTab === 'HISTORY' ? 'bg-white shadow text-brand-600' : 'hover:bg-slate-200'}`}
              >
                <History className="w-3 h-3" /> 状态记录
              </button>
            </div>
            <div className="h-6 w-px bg-slate-300"></div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-2 rounded hover:bg-slate-100">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden bg-slate-100 flex justify-center relative">
          {activeTab === 'PREVIEW' ? (
            <div className="w-full h-full p-6 flex justify-center overflow-auto">
              <div className="bg-white shadow-sm border border-slate-300 w-full min-h-full rounded-sm">
                <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-bold">{task.taskName}</span>
                  {task.reportUrl ? (
                    <span className="text-emerald-600 font-medium">· 已生成报告文件</span>
                  ) : (
                    <span className="text-amber-600 font-medium">· 草稿预览（报告待生成）</span>
                  )}
                </div>
                <table className="w-full text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-500 font-medium">
                    <tr>
                      <th className="w-10 border border-slate-200 p-1 bg-slate-100 text-center">#</th>
                      <th className="border border-slate-200 p-2">案号</th>
                      <th className="border border-slate-200 p-2">案件名称</th>
                      <th className="border border-slate-200 p-2">阶段</th>
                      <th className="border border-slate-200 p-2 text-right">涉案金额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, idx) => (
                      <tr key={row.id}>
                        <td className="border border-slate-200 p-1 text-center text-slate-400">{idx + 1}</td>
                        <td className="border border-slate-200 p-2 font-mono">{row.code}</td>
                        <td className="border border-slate-200 p-2">{row.title}</td>
                        <td className="border border-slate-200 p-2">{row.stage}</td>
                        <td className="border border-slate-200 p-2 text-right font-mono">
                          ¥{(row.regulatoryAttrs?.amountNoInterest || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    {previewRows.length === 0 && (
                      <tr><td colSpan={5} className="p-8 text-center text-slate-400">暂无关联案件数据</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-3xl p-8 overflow-y-auto">
              <div className="relative border-l-2 border-slate-200 pl-8 space-y-6">
                <div className="relative">
                  <div className="absolute -left-[41px] top-0 w-6 h-6 rounded-full border-4 border-white shadow-sm bg-slate-300"></div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-sm text-slate-800">创建任务</span>
                      <span className="text-xs text-slate-400 font-mono">{task.createdAt?.slice(0, 10)}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">By {task.createdBy || '—'}</p>
                  </div>
                </div>
                <div className="text-center">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="font-bold">当前状态：</span>
                    <span className={`px-2 py-0.5 rounded font-bold ${
                      task.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' :
                      task.status === 'PENDING_APPROVAL' ? 'bg-indigo-50 text-indigo-700' :
                      task.status === 'CANCELLED' ? 'bg-red-50 text-red-600' :
                      'bg-slate-100 text-slate-600'
                    }`}>{task.statusName}</span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-4 text-center">
                <MessageSquare className="w-3 h-3 inline mr-1" />详细审批日志将在正式审批流接入后展示
              </p>
            </div>
          )}
        </div>

        <div className="bg-white border-t border-slate-200 px-6 py-4 flex justify-between items-center shrink-0">
          <Button variant="ghost" onClick={() => onAction('DOWNLOAD')}>
            <Download className="w-4 h-4 mr-2" /> 下载底稿文件
          </Button>
          <div className="flex gap-3">
            {task.status === 'PENDING_APPROVAL' ? (
              <>
                <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => onAction('REJECT')} isLoading={isProcessing}>
                  驳回修改
                </Button>
                <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => onAction('APPROVE')} isLoading={isProcessing}>
                  <UserCheck className="w-4 h-4 mr-2" /> 确认审批通过
                </Button>
              </>
            ) : task.status === 'DATA_PREP' ? (
              <Button className="bg-brand-600" onClick={() => onAction('APPROVE')} isLoading={isProcessing}>
                <Send className="w-4 h-4 mr-2" /> 提交审批
              </Button>
            ) : (
              <Button variant="secondary" onClick={onClose}>关闭</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main Workbench Component ─────────────────────────────────────────────────

interface ReportingWorkbenchProps {
  onCreateTask: () => void;
  onRiskConversion: (defId: string) => void;
}

const ReportingWorkbench: React.FC<ReportingWorkbenchProps> = ({ onCreateTask, onRiskConversion }) => {
  const [tasks, setTasks] = useState<ReportingTaskRecord[]>([]);
  const [alerts, setAlerts] = useState<ComplianceAlertRecord[]>([]);
  const [caseRows, setCaseRows] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'HISTORY'>('ACTIVE');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const [previewTask, setPreviewTask] = useState<ReportingTaskRecord | null>(null);
  const [rejectionModal, setRejectionModal] = useState<{ isOpen: boolean; task: ReportingTaskRecord | null }>({ isOpen: false, task: null });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // D94: getDisclosureTasks → listComplianceAlerts (PENDING)
      const [taskList, alertList, cases] = await Promise.all([
        listReportingTasks(),
        listComplianceAlerts({ status: 'PENDING' }),
        getCases(),
      ]);
      setTasks(taskList);
      setAlerts(alertList.filter(a => a.status === 'PENDING'));
      setCaseRows(cases);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (
    task: ReportingTaskRecord,
    targetStatus: ReportingTaskRecord['status'],
    comment?: string,
  ) => {
    setProcessingId(task.taskId);
    try {
      await updateReportingTaskStatus(task.taskId, targetStatus, comment);
      await loadData();
    } finally {
      setProcessingId(null);
    }
  };

  // D94: 告警豁免 → handleComplianceAlert DISMISS
  const handleAlertDismiss = async (alert: ComplianceAlertRecord) => {
    if (!window.confirm('确认将此合规告警标记为"豁免"？\n此操作将被记录在合规日志中。')) return;
    setProcessingId(alert.alertId);
    try {
      await handleComplianceAlert({ alertId: alert.alertId, action: 'DISMISS', notes: '工作台豁免' });
      await loadData();
    } finally {
      setProcessingId(null);
    }
  };

  // D94: 生成披露任务 → 打开向导（无规则预选，用户从规则列表手动选择）
  const handleCreateDisclosure = (_alert: ComplianceAlertRecord) => {
    onRiskConversion('');
  };

  const handleRejectConfirm = async (reason: string, suggestion: string) => {
    if (!rejectionModal.task) return;
    const fullComment = `${reason}${suggestion ? `\n【修改建议】${suggestion}` : ''}`;
    setProcessingId(rejectionModal.task.taskId);
    try {
      await updateReportingTaskStatus(rejectionModal.task.taskId, 'DATA_PREP', fullComment);
      setRejectionModal({ isOpen: false, task: null });
      setPreviewTask(null);
      await loadData();
    } finally {
      setProcessingId(null);
    }
  };

  const handleModalAction = async (action: 'APPROVE' | 'REJECT' | 'DOWNLOAD') => {
    if (!previewTask) return;

    if (action === 'DOWNLOAD') {
      setProcessingId(previewTask.taskId);
      try {
        const result = await downloadTaskFiles(previewTask.taskId);
        if (result?.reportUrl) {
          window.open(result.reportUrl, '_blank');
        } else {
          alert('报告文件尚未生成，请先执行"定稿渲染"后再下载。');
        }
      } finally {
        setProcessingId(null);
      }
      return;
    }

    if (action === 'REJECT') {
      setRejectionModal({ isOpen: true, task: previewTask });
      return;
    }

    // APPROVE: DATA_PREP → PENDING_APPROVAL; PENDING_APPROVAL → APPROVED
    const targetStatus: ReportingTaskRecord['status'] =
      previewTask.status === 'DATA_PREP' ? 'PENDING_APPROVAL' : 'APPROVED';
    await handleStatusChange(previewTask, targetStatus);
    setPreviewTask(null);
  };

  const renderProgressBar = (status: ReportingTaskRecord['status']) => {
    const steps: ReportingTaskRecord['status'][] = ['DATA_PREP', 'PENDING_APPROVAL', 'APPROVED'];
    const current = steps.indexOf(status) + 1;
    const label: Record<string, string> = {
      DATA_PREP: '数据准备中',
      PENDING_APPROVAL: '审批中',
      APPROVED: '已审批',
      CANCELLED: '已取消',
    };
    if (status === 'CANCELLED') {
      return (
        <div className="flex items-center gap-2 mt-1.5">
          <div className="h-1.5 w-6 rounded-full bg-slate-300"></div>
          <span className="text-[10px] text-slate-500 font-bold bg-slate-100 px-1.5 rounded border border-slate-200">已取消</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 mt-1.5">
        {[1, 2, 3].map(step => (
          <div key={step} className={`h-1.5 w-6 rounded-full transition-colors ${step <= current ? 'bg-brand-500' : 'bg-slate-200'}`}></div>
        ))}
        <span className="text-[10px] text-slate-400 ml-2 font-medium">{label[status] ?? status}</span>
      </div>
    );
  };

  const filteredTasks = tasks.filter(t =>
    activeTab === 'ACTIVE' ? t.status !== 'APPROVED' && t.status !== 'CANCELLED' : t.status === 'APPROVED',
  );

  if (loading) return (
    <div className="p-12 text-center text-slate-400">
      <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />数据同步中...
    </div>
  );

  return (
    <div className="space-y-6">
      {previewTask && (
        <ReportPreviewModal
          task={previewTask}
          caseRows={caseRows}
          onClose={() => setPreviewTask(null)}
          onAction={handleModalAction}
          isProcessing={processingId === previewTask.taskId}
        />
      )}
      <RejectionModal
        isOpen={rejectionModal.isOpen}
        onClose={() => setRejectionModal({ isOpen: false, task: null })}
        onConfirm={handleRejectConfirm}
        isProcessing={!!processingId}
      />

      {/* 风险雷达 (D94: ComplianceAlertRecord 替代 DisclosureTask) */}
      {alerts.length > 0 && (
        <div className="bg-red-50/60 border border-red-100 rounded-xl p-4 animate-in slide-in-from-top-2">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-red-800">
              <div className="bg-red-100 p-1 rounded animate-pulse">
                <Zap className="w-4 h-4 text-red-600" />
              </div>
              <h3 className="font-bold text-sm">风险雷达监测 (Risk Radar)</h3>
              <span className="text-xs bg-white border border-red-200 text-red-700 px-2 py-0.5 rounded-full font-mono">{alerts.length} 待研判</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {alerts.map(alert => (
              <div key={alert.alertId} className="bg-white p-3 rounded-lg border border-red-100 shadow-sm hover:shadow-md transition-shadow group">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                      alert.alertLevel === 'CRITICAL' ? 'bg-red-600 text-white border-red-600' : 'bg-orange-50 text-orange-700 border-orange-200'
                    }`}>
                      {alert.alertLevelName || alert.alertLevel}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">{alert.createdAt.slice(0, 10)}</span>
                  </div>
                </div>
                <h4 className="text-sm font-bold text-slate-800 mb-1 line-clamp-1 group-hover:text-brand-600 transition-colors" title={alert.caseTitle}>
                  {alert.caseTitle}
                </h4>
                <p className="text-xs text-slate-500 line-clamp-2 min-h-[2.5em] mb-3 bg-slate-50 p-1.5 rounded">
                  {alert.alertMessage}
                </p>
                <div className="flex gap-2 pt-2 border-t border-slate-50">
                  <button
                    onClick={() => handleAlertDismiss(alert)}
                    disabled={processingId === alert.alertId}
                    className="flex-1 text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-50 py-1.5 rounded flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
                  >
                    <X className="w-3 h-3" /> 豁免
                  </button>
                  <button
                    onClick={() => handleCreateDisclosure(alert)}
                    className="flex-[2] text-xs bg-red-600 text-white hover:bg-red-700 py-1.5 rounded flex items-center justify-center gap-1 font-bold shadow-sm transition-colors"
                  >
                    <Megaphone className="w-3 h-3" /> 生成披露任务
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 任务列表工具栏 */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            onClick={() => setActiveTab('ACTIVE')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === 'ACTIVE' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Clock className="w-4 h-4" /> 进行中
            <span className="bg-slate-200 text-slate-600 px-1.5 rounded-full text-xs">
              {tasks.filter(t => t.status !== 'APPROVED' && t.status !== 'CANCELLED').length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === 'HISTORY' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Archive className="w-4 h-4" /> 已审批归档
          </button>
        </div>
        <Button onClick={onCreateTask} className="shadow-sm">
          <Plus className="w-4 h-4 mr-2" /> 发起报送任务
        </Button>
      </div>

      {/* 任务列表 */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden min-h-[400px]">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 w-1/3">任务名称 / 周期</th>
              <th className="px-6 py-4">数据源</th>
              <th className="px-6 py-4">填报进度</th>
              <th className="px-6 py-4 text-center">预览</th>
              <th className="px-6 py-4 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredTasks.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-16 text-center text-slate-400">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 mx-auto">
                    <FileBarChart className="w-8 h-8 opacity-20" />
                  </div>
                  <p>当前列表无数据</p>
                </td>
              </tr>
            ) : filteredTasks.map(task => (
              <tr key={task.taskId} className="hover:bg-slate-50 transition-colors group">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-lg shadow-sm border ${
                      task.taskName.includes('临时') || task.taskName.includes('公告')
                        ? 'bg-orange-50 border-orange-100 text-orange-600'
                        : 'bg-blue-50 border-blue-100 text-blue-600'
                    }`}>
                      {task.taskName.includes('临时') || task.taskName.includes('公告')
                        ? <Megaphone className="w-5 h-5" />
                        : <FileText className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 text-sm">{task.taskName}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {task.cycleValue && (
                          <span className="text-xs font-mono bg-slate-100 px-1.5 rounded text-slate-500 border border-slate-200">
                            {task.cycleValue}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400">By {task.createdBy || '—'}</span>
                      </div>
                    </div>
                  </div>
                </td>

                <td className="px-6 py-4">
                  {task.snapshotId ? (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
                      <Lock className="w-3 h-3" />
                      <span>快照已锁定</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs text-amber-700 font-medium">
                      <AlertTriangle className="w-3 h-3" />
                      <span>实时数据</span>
                    </div>
                  )}
                  {task.dueDate && (
                    <div className="text-[10px] text-slate-400 mt-1">截止: {task.dueDate}</div>
                  )}
                </td>

                <td className="px-6 py-4">{renderProgressBar(task.status)}</td>

                <td className="px-6 py-4 text-center">
                  <button
                    className="text-slate-400 hover:text-brand-600 p-1.5 rounded transition-colors group-hover:bg-slate-100"
                    title="查看/下载底稿"
                    onClick={() => setPreviewTask(task)}
                  >
                    {task.reportUrl ? <FileSpreadsheet className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </td>

                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end items-center gap-2">
                    {task.status === 'DATA_PREP' && (
                      <Button size="sm" onClick={() => handleStatusChange(task, 'PENDING_APPROVAL')} isLoading={processingId === task.taskId}>
                        <Send className="w-3 h-3 mr-1" /> 提交审批
                      </Button>
                    )}
                    {task.status === 'PENDING_APPROVAL' && (
                      <Button size="sm" onClick={() => setPreviewTask(task)} className="bg-indigo-600 hover:bg-indigo-700 shadow-sm">
                        <UserCheck className="w-3 h-3 mr-1" /> 审核 / 审批
                      </Button>
                    )}
                    {task.status === 'APPROVED' && (
                      <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> 已审批
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ReportingWorkbench;
