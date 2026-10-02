
import React, { useEffect, useState } from 'react';
import {
  getCases,
  listGovernanceIssues,
  triggerGovernanceScan,
  ignoreGovernanceIssue,
  type DataQualityIssueRecord,
} from '../../services/case';
import {
  AlertOctagon, AlertTriangle, CheckCircle2, ShieldAlert, ShieldCheck,
  Search, RefreshCw, X, Activity, Loader2,
} from 'lucide-react';
import Button from '../../components/ui/Button';

type SeverityFilter = 'ALL' | 'BLOCKER' | 'WARNING';
type StatusFilter = 'PENDING' | 'ALL';

const SEVERITY_BADGE: Record<string, string> = {
  BLOCKER: 'bg-red-50 text-red-700 border-red-100',
  WARNING: 'bg-amber-50 text-amber-700 border-amber-100',
};

const SnapshotManager: React.FC = () => {
  const [issues, setIssues] = useState<DataQualityIssueRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING');
  const [searchQuery, setSearchQuery] = useState('');

  // Ignore modal
  const [ignoreTarget, setIgnoreTarget] = useState<DataQualityIssueRecord | null>(null);
  const [ignoreReason, setIgnoreReason] = useState('');
  const [ignoring, setIgnoring] = useState(false);

  // Live preview counts
  const [caseCount, setCaseCount] = useState<number | null>(null);

  const loadIssues = async () => {
    setLoading(true);
    try {
      const data = await listGovernanceIssues({
        severity: severityFilter === 'ALL' ? null : severityFilter,
        status: statusFilter === 'ALL' ? null : statusFilter,
      });
      setIssues(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIssues();
    getCases().then(c => setCaseCount(c.length)).catch(() => setCaseCount(null));
  }, [severityFilter, statusFilter]);

  const handleTriggerScan = async () => {
    setScanning(true);
    try {
      await triggerGovernanceScan();
      await new Promise(r => setTimeout(r, 1200));
      await loadIssues();
    } finally {
      setScanning(false);
    }
  };

  const handleIgnore = async () => {
    if (!ignoreTarget || !ignoreReason.trim()) return;
    setIgnoring(true);
    try {
      await ignoreGovernanceIssue(ignoreTarget.issueId, ignoreReason);
      setIgnoreTarget(null);
      setIgnoreReason('');
      await loadIssues();
    } finally {
      setIgnoring(false);
    }
  };

  const filtered = issues.filter(issue => {
    if (!searchQuery) return true;
    return issue.caseCode.includes(searchQuery) || issue.description.includes(searchQuery);
  });

  const blockerCount = issues.filter(i => i.severity === 'BLOCKER' && i.status === 'PENDING').length;
  const warningCount = issues.filter(i => i.severity === 'WARNING' && i.status === 'PENDING').length;
  const pendingCount = issues.filter(i => i.status === 'PENDING').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center bg-slate-900 text-white p-6 rounded-xl shadow-md">
        <div>
          <h3 className="text-xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-brand-400" /> 数据质量治理 (Data Governance)
          </h3>
          <p className="text-slate-400 text-sm mt-1">
            扫描在办案件数据的逻辑矛盾与字段缺失，BLOCKER 级异常必须在报送前清零。
          </p>
        </div>
        <Button onClick={handleTriggerScan} disabled={scanning}
          className="bg-brand-500 hover:bg-brand-400 text-white border-none shadow-lg shadow-brand-900/50">
          {scanning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          {scanning ? '扫描中...' : '触发全量扫描'}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`p-5 rounded-xl border shadow-sm ${blockerCount > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">BLOCKER 阻断项</p>
              <p className={`text-3xl font-bold mt-1 ${blockerCount > 0 ? 'text-red-600' : 'text-slate-800'}`}>{blockerCount}</p>
              <p className="text-xs text-slate-400 mt-1">必须清零才可报送</p>
            </div>
            <div className={`p-3 rounded-xl ${blockerCount > 0 ? 'bg-red-100' : 'bg-slate-100'}`}>
              <AlertOctagon className={`w-6 h-6 ${blockerCount > 0 ? 'text-red-600' : 'text-slate-400'}`} />
            </div>
          </div>
        </div>

        <div className="p-5 rounded-xl border border-amber-200 bg-amber-50 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase text-amber-600">WARNING 警告项</p>
              <p className="text-3xl font-bold mt-1 text-amber-700">{warningCount}</p>
              <p className="text-xs text-amber-500 mt-1">可豁免，需记录原因</p>
            </div>
            <div className="p-3 rounded-xl bg-amber-100">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">扫描覆盖案件</p>
              <p className="text-3xl font-bold mt-1 text-slate-800">{caseCount ?? '--'}</p>
              <p className="text-xs text-slate-400 mt-1">全量在办案件</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-100">
              <Activity className="w-6 h-6 text-slate-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2">
          {(['ALL', 'BLOCKER', 'WARNING'] as SeverityFilter[]).map(f => (
            <button key={f} onClick={() => setSeverityFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                severityFilter === f
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
              }`}>
              {f === 'ALL' ? '全部' : f}
            </button>
          ))}
          <div className="w-px bg-slate-200 mx-1" />
          <button onClick={() => setStatusFilter(s => s === 'PENDING' ? 'ALL' : 'PENDING')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
              statusFilter === 'PENDING'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
            }`}>
            {statusFilter === 'PENDING' ? '仅待处理' : '包含已处理'}
          </button>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="检索案号或异常描述..."
            className="pl-8 pr-4 py-1.5 text-xs border border-slate-300 rounded-md focus:ring-2 focus:ring-brand-500 outline-none w-56"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)} />
        </div>
      </div>

      {/* Issues Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin opacity-30" />
            加载数据质量问题...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2 opacity-60" />
            <p className="text-slate-500 font-medium">
              {pendingCount === 0 ? '数据质量良好，无待处理异常' : '无匹配的数据质量问题'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-medium text-slate-600 text-xs">严重度</th>
                  <th className="px-4 py-3 font-medium text-slate-600 text-xs">案号</th>
                  <th className="px-4 py-3 font-medium text-slate-600 text-xs w-1/2">异常描述</th>
                  <th className="px-4 py-3 font-medium text-slate-600 text-xs">类型</th>
                  <th className="px-4 py-3 font-medium text-slate-600 text-xs">状态</th>
                  <th className="px-4 py-3 font-medium text-slate-600 text-xs">发现时间</th>
                  <th className="px-4 py-3 font-medium text-slate-600 text-xs">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(issue => (
                  <tr key={issue.issueId} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${SEVERITY_BADGE[issue.severity] ?? ''}`}>
                        {issue.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{issue.caseCode || '-'}</td>
                    <td className="px-4 py-3 text-slate-800 font-medium text-xs leading-relaxed">{issue.description}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{issue.issueType}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                        issue.status === 'PENDING' ? 'bg-slate-100 text-slate-600 border-slate-200' :
                        issue.status === 'RESOLVED' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                        'bg-slate-100 text-slate-400 border-slate-200'
                      }`}>{issue.statusName || issue.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 font-mono">{issue.createdAt.slice(0, 10)}</td>
                    <td className="px-4 py-3">
                      {issue.status === 'PENDING' && issue.severity === 'WARNING' && (
                        <button
                          onClick={() => { setIgnoreTarget(issue); setIgnoreReason(''); }}
                          className="text-xs text-slate-500 hover:text-amber-600 underline">
                          豁免
                        </button>
                      )}
                      {issue.severity === 'BLOCKER' && issue.status === 'PENDING' && (
                        <span className="text-[10px] text-red-500 font-bold">不可豁免</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Ignore Modal */}
      {ignoreTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-[480px] overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-600" /> 豁免 WARNING 异常
              </h3>
              <button onClick={() => setIgnoreTarget(null)}><X className="w-5 h-5 text-slate-400 hover:text-slate-600" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800">
                {ignoreTarget.description}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">豁免原因（必填，写入审计日志）</label>
                <textarea
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm resize-none h-20 focus:ring-2 focus:ring-brand-500 outline-none"
                  placeholder="请说明忽略该警告的理由..."
                  value={ignoreReason}
                  onChange={e => setIgnoreReason(e.target.value)}
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setIgnoreTarget(null)}>取消</Button>
              <Button onClick={handleIgnore} disabled={!ignoreReason.trim() || ignoring}>
                {ignoring ? '提交中...' : '确认豁免'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SnapshotManager;
