import React, { useEffect, useState, useCallback } from 'react';
import {
  listSnapshots,
  getSnapshotDownloadUrl,
  type SnapshotRecord,
} from '../../services/case';
import {
  Camera, Download, RefreshCw, ChevronLeft, ChevronRight,
  Lock, FileText, AlertCircle,
} from 'lucide-react';
import Button from '../../components/ui/Button';

type TypeFilter = 'ALL' | 'FINANCIAL' | 'COMPLIANCE';

const PAGE_SIZE = 20;

const TYPE_BADGE: Record<string, string> = {
  FINANCIAL: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  COMPLIANCE: 'bg-brand-50 text-brand-700 border-brand-100',
};

const STATUS_BADGE: Record<string, string> = {
  GENERATING: 'bg-amber-50 text-amber-600 border-amber-100',
  LOCKED: 'bg-slate-100 text-slate-600 border-slate-200',
  DRAFT: 'bg-sky-50 text-sky-600 border-sky-100',
  FINAL: 'bg-emerald-50 text-emerald-700 border-emerald-100',
};

const formatFileSize = (bytes: number | null): string => {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const SnapshotBrowser: React.FC = () => {
  const [items, setItems] = useState<SnapshotRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  const load = useCallback(async (p: number, t: TypeFilter) => {
    setLoading(true);
    const res = await listSnapshots({
      snapshotType: t === 'ALL' ? null : t,
      page: p,
      pageSize: PAGE_SIZE,
    });
    setItems(res.items);
    setTotal(res.total);
    setLoading(false);
  }, []);

  useEffect(() => {
    load(page, typeFilter);
  }, [page, typeFilter, load]);

  const handleFilterChange = (t: TypeFilter) => {
    setTypeFilter(t);
    setPage(1);
  };

  const handleDownload = async (item: SnapshotRecord) => {
    if (item.snapshotType === 'FINANCIAL') return;
    setDownloading(item.snapshotId);
    const result = await getSnapshotDownloadUrl({
      snapshotId: item.snapshotId,
      snapshotType: item.snapshotType,
    });
    setDownloading(null);
    if (result?.downloadUrl) {
      window.open(result.downloadUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const FILTER_TABS: { key: TypeFilter; label: string }[] = [
    { key: 'ALL', label: '全部' },
    { key: 'FINANCIAL', label: '财务快照' },
    { key: 'COMPLIANCE', label: '合规快照' },
  ];

  return (
    <div className="space-y-5">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Camera className="w-5 h-5 text-brand-600" />
            数据快照浏览器
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">快照由系统定期生成 · 共 {total} 条</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load(page, typeFilter)} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {/* 类型筛选 */}
      <div className="flex gap-1 border-b border-slate-200">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => handleFilterChange(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              typeFilter === tab.key ? 'text-brand-600' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
            {typeFilter === tab.key && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600 rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {/* 列表 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">加载中...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <Camera className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">暂无快照记录</p>
            <p className="text-xs text-slate-400 mt-1">快照由系统在每个报告期结束后自动生成</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {/* 表头 */}
            <div className="px-5 py-2.5 bg-slate-50 grid grid-cols-12 gap-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
              <span className="col-span-4">快照名称</span>
              <span className="col-span-2">类型</span>
              <span className="col-span-1">状态</span>
              <span className="col-span-2">报告期</span>
              <span className="col-span-1 text-right">文件大小</span>
              <span className="col-span-2 text-right">创建时间</span>
            </div>

            {items.map(item => (
              <div
                key={item.snapshotId}
                className="px-5 py-3.5 grid grid-cols-12 gap-4 items-center hover:bg-slate-50/60 transition-colors"
              >
                {/* 名称 + 下载 */}
                <div className="col-span-4 flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="text-sm font-medium text-slate-800 truncate" title={item.snapshotName}>
                    {item.snapshotName}
                  </span>
                  {item.lockedAt && (
                    <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-label={`锁定于 ${item.lockedAt.slice(0,10)}`} />
                  )}
                </div>

                {/* 类型 */}
                <div className="col-span-2">
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded border ${TYPE_BADGE[item.snapshotType] ?? 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                    {item.snapshotTypeName || item.snapshotType}
                  </span>
                </div>

                {/* 状态 */}
                <div className="col-span-1">
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded border ${STATUS_BADGE[item.status] ?? 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                    {item.statusName || item.status}
                  </span>
                </div>

                {/* 报告期 */}
                <div className="col-span-2 text-xs text-slate-500">
                  {item.period ?? item.snapshotDate?.slice(0, 10) ?? '—'}
                </div>

                {/* 文件大小 */}
                <div className="col-span-1 text-xs text-slate-500 text-right">
                  {item.snapshotType === 'FINANCIAL' ? (
                    <span className="text-slate-400 italic text-[11px]">无文件</span>
                  ) : formatFileSize(item.fileSize)}
                </div>

                {/* 创建时间 + 下载按钮 */}
                <div className="col-span-2 flex items-center justify-end gap-2">
                  <span className="text-xs text-slate-400 font-mono">
                    {item.createdAt.slice(0, 10)}
                  </span>
                  {item.snapshotType === 'COMPLIANCE' ? (
                    <button
                      onClick={() => handleDownload(item)}
                      disabled={downloading === item.snapshotId}
                      className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors disabled:opacity-40"
                      title="下载快照文件"
                    >
                      {downloading === item.snapshotId ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                    </button>
                  ) : (
                    <span title="财务快照无实体文件" className="p-1.5 text-slate-200 cursor-default">
                      <AlertCircle className="w-4 h-4" />
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 分页 */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>第 {page} / {totalPages} 页，共 {total} 条</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded border border-slate-200 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded border border-slate-200 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 说明 */}
      <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
        财务快照为汇总数值记录，无实体文件；合规快照包含导出文件，可下载（有效期 15 分钟）。
      </p>
    </div>
  );
};

export default SnapshotBrowser;
