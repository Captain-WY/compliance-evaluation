import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { 
  ClipboardList, 
  Plus, 
  Search, 
  Filter, 
  CheckCircle2, 
  Clock, 
  FileText, 
  Paperclip,
  UploadCloud,
  X,
  AlertTriangle,
  Lightbulb,
  Loader2
} from 'lucide-react';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { API_MODE, assessmentApi, fileApi } from '../../services/api';

type DailyLedgerStatus = 'DRAFT' | 'AVAILABLE' | 'USED_IN_REPORTING' | 'DELETED' | 'UNLINKED' | 'LINKED' | 'ARCHIVED';

interface DailyEvent {
  id: string;
  date: string;
  title: string;
  tags: string;
  status: DailyLedgerStatus;
  files: number;
  description: string;
  fileIds: string[];
}

const initialDailyEvents: DailyEvent[] = [
  { id: 'EVT-001', date: '2026-04-25', title: '营业部代销产品风险测评自查', tags: '未关联指标', status: 'UNLINKED', files: 0, description: '', fileIds: [] },
  { id: 'EVT-002', date: '2026-04-22', title: '发现并上报疑似客户异常交易线索', tags: 'AML-01 反洗钱', status: 'LINKED', files: 1, description: '发现可疑交易并上报', fileIds: [] },
  { id: 'EVT-003', date: '2026-04-10', title: '组织全员开展防范非法集资宣讲会', tags: 'EDU-01 合规宣导', status: 'ARCHIVED', files: 2, description: '已完成全体员工的防范非法集资宣讲', fileIds: [] }
];

const indicatorOptions = [
  { value: 'EDU-01', label: 'EDU-01 合规宣导及培训次数' },
  { value: 'AML-01', label: 'AML-01 大额及可疑交易报送及时率' },
  { value: 'EMP-01', label: 'EMP-01 员工违规代客理财排查' },
  { value: 'NONE', label: '无 (仅留存记录)' }
];

const normalizeLedgerItems = (data: any): any[] => {
  if (Array.isArray(data)) return data;
  return data?.items ?? [];
};

const categoryLabel = (category: string | undefined) => {
  if (!category || category === 'GENERAL') return '未关联指标';
  const option = indicatorOptions.find(item => item.value === category);
  return option?.label ?? category;
};

const toDailyEvent = (item: any): DailyEvent => {
  const attachments = Array.isArray(item?.attachments) ? item.attachments : [];
  return {
    id: item?.ledgerEntryId ?? item?.id ?? `LEDGER-${Date.now()}`,
    date: item?.occurredDate ?? item?.date ?? '',
    title: item?.title ?? '',
    tags: categoryLabel(item?.category),
    status: item?.status ?? 'AVAILABLE',
    files: attachments.length,
    description: item?.description ?? '',
    fileIds: attachments.map((attachment: any) => attachment.fileId).filter(Boolean),
  };
};

export default function BranchDailyComplianceLedger() {
  const [dailyEvents, setDailyEvents] = useState(initialDailyEvents);
  const [isLoading, setIsLoading] = useState(API_MODE === 'real');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  // Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'add' | 'edit' | 'view'>('add');
  const [selectedRecord, setSelectedRecord] = useState<DailyEvent | null>(null);

  // Filter state
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Dialog state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const [formData, setFormData] = useState({
    date: '2026-04-26',
    title: '',
    indicator: '',
    description: ''
  });
  const [fileIds, setFileIds] = useState<string[]>([]);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(dailyEvents.length / pageSize));
  const firstRecord = dailyEvents.length ? 1 : 0;
  const lastRecord = Math.min(dailyEvents.length, pageSize);

  const loadDailyLedger = async () => {
    if (API_MODE !== 'real') {
      setDailyEvents(initialDailyEvents);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const page = await assessmentApi.getDailyLedger({ pageSize: 100 });
      setDailyEvents(normalizeLedgerItems(page).map(toDailyEvent));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '日常台账加载失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadDailyLedger();
  }, []);

  // Action handlers
  const openDrawer = (mode: 'add' | 'edit' | 'view', record?: DailyEvent) => {
    setDrawerMode(mode);
    if (record) {
      setSelectedRecord(record);
      // Pre-fill form
      const ind = indicatorOptions.find(o => o.label.includes(record.tags))?.value || 'NONE';
      setFormData({
        date: record.date,
        title: record.title,
        indicator: ind === 'NONE' ? '' : ind,
        description: record.description || ''
      });
      setFileIds(record.fileIds);
      setFileNames(record.fileIds);
    } else {
      setSelectedRecord(null);
      setFormData({ date: '2026-04-26', title: '', indicator: '', description: '' });
      setFileIds([]);
      setFileNames([]);
    }
    setIsDrawerOpen(true);
  };

  const confirmDelete = (record: DailyEvent) => {
    setSelectedRecord(record);
    setIsDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedRecord) return;
    try {
      if (API_MODE === 'real') {
        await assessmentApi.deleteDailyLedger(selectedRecord.id);
      }
      setDailyEvents(dailyEvents.filter(e => e.id !== selectedRecord.id));
      toast.success("删除成功");
      setIsDeleteDialogOpen(false);
      setSelectedRecord(null);
    } catch (err) {
      toast.error("删除失败", { description: err instanceof Error ? err.message : "请稍后重试" });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-amber-600 border border-amber-200 bg-amber-50">🟡 草稿</span>;
      case 'AVAILABLE':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-blue-600 border border-blue-200 bg-blue-50">🔵 可用</span>;
      case 'USED_IN_REPORTING':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-emerald-600 border border-emerald-200 bg-emerald-50">🟢 已用于填报</span>;
      case 'DELETED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-slate-500 border border-slate-200 bg-slate-50">⚪ 已删除</span>;
      case 'UNLINKED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-slate-500 border border-slate-200 bg-slate-50">⚪ 未调用</span>;
      case 'LINKED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-blue-600 border border-blue-200 bg-blue-50">🔵 已挂载</span>;
      case 'ARCHIVED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-emerald-600 border border-emerald-200 bg-emerald-50">🟢 已归档</span>;
      default:
        return null;
    }
  };

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const uploaded = await fileApi.uploadFile(file);
      const uploadedId = uploaded.fileId ?? uploaded.id;
      setFileIds(prev => [...prev, uploadedId]);
      setFileNames(prev => [...prev, uploaded.fileName ?? file.name]);
      toast.success("上传成功", { description: "附件已通过真实文件接口上传。" });
    } catch (err) {
      toast.error("上传失败", { description: err instanceof Error ? err.message : "请稍后重试" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.title || !formData.date) return;
    setIsSaving(true);
    
    try {
      const payload = {
        title: formData.title,
        occurredDate: formData.date,
        category: formData.indicator || 'GENERAL',
        description: formData.description,
        fileIds,
      };

      if (drawerMode === 'add') {
        if (API_MODE === 'real') {
          const created = await assessmentApi.createDailyLedger(payload);
          setDailyEvents(prev => [toDailyEvent(created), ...prev]);
        } else {
          const created = await assessmentApi.createDailyLedger(payload);
          setDailyEvents(prev => [toDailyEvent(created), ...prev]);
        }
        toast.success('已安全存入日常合规证据库。');
      } else if (drawerMode === 'edit' && selectedRecord) {
        const updatedEvent = await assessmentApi.updateDailyLedger(selectedRecord.id, payload);
        setDailyEvents(prev => prev.map(evt => evt.id === selectedRecord.id ? toDailyEvent(updatedEvent) : evt));
        toast.success('修改已保存');
      }

      setIsDrawerOpen(false);
      setFormData({ date: '2026-04-26', title: '', indicator: '', description: '' });
      setFileIds([]);
      setFileNames([]);
    } catch (err) {
      toast.error("保存失败", { description: err instanceof Error ? err.message : "请稍后重试" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 p-6 overflow-hidden" data-testid="p1-ledger-page">
      
      {/* Top Summary Banner */}
      <div className="mb-6 bg-blue-50 border border-blue-100 rounded-lg p-4 flex items-start justify-between shadow-sm">
        <div className="flex gap-3">
          <Lightbulb className="w-5 h-5 text-blue-500 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-blue-800">日常合规证据库 (Daily Evidence Drive)</h3>
            <p className="text-sm text-blue-600 mt-1">在此记录的日常履职事项与佐证材料，可在周期性“考核数据填报”时一键提取，极大减轻期末集中填报的负担。</p>
          </div>
        </div>
        <div className="text-sm font-medium text-slate-500 bg-white px-3 py-1.5 rounded-md border border-slate-200 shrink-0 ml-4">
          本年度已累计登记: <span className="text-blue-600 font-bold">{dailyEvents.length}</span> 项
        </div>
      </div>
      {loadError && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {loadError}
        </div>
      )}

      {/* Main Ledger Area */}
      <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <h2 className="text-sm font-bold text-slate-800 flex items-center">
            <ClipboardList className="w-4 h-4 mr-2 text-indigo-600" />
            日常合规履职台账
          </h2>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                data-testid="p1-ledger-search"
                type="text" 
                placeholder="搜索事件摘要/指标"
                className="pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500/50 outline-none w-64"
              />
            </div>
            
            <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
              <PopoverTrigger
                data-testid="p1-ledger-filter"
                className="flex items-center px-3 py-1.5 bg-white border border-slate-300 text-slate-600 text-sm font-medium rounded-md hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <Filter className="w-4 h-4 mr-2" />
                筛选
              </PopoverTrigger>
              <PopoverContent className="w-80 p-4" align="end">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-slate-800">挂载状态 (Usage Status)</h4>
                    <select data-testid="p1-ledger-status-filter" className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/50 bg-white">
                      <option>全部</option>
                      <option>⚪ 未调用</option>
                      <option>🔵 已挂载</option>
                      <option>🟢 已归档</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-slate-800">时间范围 (Time Range)</h4>
                    <select data-testid="p1-ledger-date-filter" className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/50 bg-white">
                      <option>本月</option>
                      <option>本季度</option>
                      <option>本年度</option>
                      <option>自定义</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-4 pt-2 border-t border-slate-100">
                  <button data-testid="p1-ledger-filter-reset" onClick={() => setIsFilterOpen(false)} className="px-3 py-1.5 bg-slate-100 text-slate-600 text-sm font-medium rounded-md hover:bg-slate-200 transition-colors">重置</button>
                  <button data-testid="p1-ledger-filter-apply" onClick={() => setIsFilterOpen(false)} className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 transition-colors">应用筛选</button>
                </div>
              </PopoverContent>
            </Popover>

            <button 
              data-testid="p1-ledger-create"
              onClick={() => openDrawer('add')}
              className="flex items-center px-4 py-1.5 bg-indigo-600 text-white text-sm font-bold rounded-md hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              新增日常履职登记
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="h-full min-h-64 flex items-center justify-center text-sm text-slate-500">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              正在加载真实日常台账...
            </div>
          ) : (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider sticky top-0 z-10 shadow-[0_1px_rgba(226,232,240,1)]">
                <tr>
                  <th className="px-5 py-3">发生日期 (Date)</th>
                  <th className="px-5 py-3">事件摘要 (Title)</th>
                  <th className="px-5 py-3">业务标签/指标 (Tags)</th>
                  <th className="px-5 py-3">挂载状态 (Usage Status)</th>
                  <th className="px-5 py-3 text-center">佐证材料 (Materials)</th>
                  <th className="px-5 py-3 text-center">操作 (Action)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dailyEvents.map((evt) => {
                  const isMutable = ['DRAFT', 'AVAILABLE', 'UNLINKED'].includes(evt.status);
                  return (
                    <tr key={evt.id} data-testid={`p1-ledger-row-${evt.id}`} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-4 font-medium text-slate-700 font-mono text-xs">{evt.date}</td>
                      <td className="px-5 py-4">
                        <span className="font-bold text-slate-800">{evt.title}</span>
                      </td>
                      <td className="px-5 py-4">
                        {evt.tags === '未关联指标' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-slate-500 bg-slate-100 border border-slate-200">
                            {evt.tags}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-100">
                            {evt.tags}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {getStatusBadge(evt.status)}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="inline-flex items-center text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                          <Paperclip className="w-3.5 h-3.5 mr-1" /> {evt.files} 份
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        {isMutable ? (
                          <div className="flex items-center justify-center gap-2">
                             <button data-testid={`p1-ledger-edit-${evt.id}`} onClick={() => openDrawer('edit', evt)} className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors">编辑</button>
                             <button data-testid={`p1-ledger-delete-${evt.id}`} onClick={() => confirmDelete(evt)} className="text-xs font-bold text-rose-600 hover:text-rose-800 transition-colors">删除</button>
                          </div>
                        ) : (
                          <button data-testid={`p1-ledger-view-${evt.id}`} onClick={() => openDrawer('view', evt)} className="text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors">查看明细</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50/50">
          <span className="text-sm text-slate-500">显示第 {firstRecord} 至 {lastRecord} 项，共 {dailyEvents.length} 项记录</span>
          <div className="flex items-center gap-1">
            <button className="px-3 py-1.5 text-sm font-medium text-slate-500 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50" disabled>上一页</button>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map(page => (
              <button
                key={page}
                className={`px-3 py-1.5 text-sm font-medium border rounded-md ${
                  page === 1
                    ? 'text-white bg-indigo-600 border-indigo-600'
                    : 'text-slate-600 bg-white border-slate-300 hover:bg-slate-50'
                }`}
                disabled={page === 1}
              >
                {page}
              </button>
            ))}
            <button className="px-3 py-1.5 text-sm font-medium text-slate-500 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50" disabled={totalPages <= 1}>下一页</button>
          </div>
        </div>
      </div>

      {/* Slide-in Drawer for New Event */}
      <AnimatePresence>
        {isDrawerOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDrawerOpen(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 transition-opacity"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 280 }}
              className="fixed inset-y-0 right-0 w-full max-w-md md:max-w-xl bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200"
              data-testid="p1-ledger-drawer"
            >
              <div className="px-6 py-5 border-b border-slate-200 bg-slate-50 shrink-0 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-800 flex items-center">
                    {drawerMode === 'view' ? (
                      <>
                        <ClipboardList className="w-5 h-5 mr-2 text-indigo-600" />
                        履职记录明细
                      </>
                    ) : (
                      <>
                        <Plus className="w-5 h-5 mr-2 text-indigo-600" />
                        新增/编辑履职登记
                      </>
                    )}
                  </h2>
                  {drawerMode !== 'view' && (
                    <p className="text-xs text-slate-500 mt-1 font-medium max-w-sm leading-relaxed">
                      将日常工作成果存入您的专属证据库。无需总部审核，随时可改，期末填报时可直接一键调取，极大降低集中填报压力。
                    </p>
                  )}
                </div>
                <button 
                  data-testid="p1-ledger-drawer-close"
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
                <div className="space-y-6">
                  
                  {/* Field 1: Date */}
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">事件发生日期 <span className="text-rose-500">*</span></label>
                    <input 
                      data-testid="p1-ledger-date-input"
                      type="date" 
                      value={formData.date}
                      onChange={(e) => setFormData({...formData, date: e.target.value})}
                      disabled={drawerMode === 'view'}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/50 outline-none disabled:bg-slate-50 disabled:text-slate-500"
                    />
                  </div>

                  {/* Field 2: Title */}
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">事件名称 <span className="text-rose-500">*</span></label>
                    <input 
                      data-testid="p1-ledger-title-input"
                      type="text" 
                      placeholder="一句话描述履职事项 (如：2026年Q1网点合规宣贯培训)"
                      value={formData.title}
                      onChange={(e) => setFormData({...formData, title: e.target.value})}
                      disabled={drawerMode === 'view'}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/50 outline-none disabled:bg-slate-50 disabled:text-slate-500"
                    />
                  </div>

                  {/* Field 3: Linked Indicator */}
                  <div className="space-y-2 bg-slate-50/50 p-4 rounded-xl border border-slate-200">
                    <label className="text-sm font-bold text-slate-700 flex items-center">
                      关联考核指标
                    </label>
                    <select 
                      data-testid="p1-ledger-indicator-select"
                      value={formData.indicator}
                      onChange={(e) => setFormData({...formData, indicator: e.target.value})}
                      disabled={drawerMode === 'view'}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/50 outline-none bg-white font-medium disabled:bg-slate-50 disabled:text-slate-500"
                    >
                      <option value="">请选择挂钩的指标 (可选)</option>
                      {indicatorOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    {drawerMode !== 'view' && (
                      <p className="text-xs text-slate-500 font-medium leading-relaxed mt-2">
                        选填。现在标注指标可方便期末自动匹配，若不确定可暂不选择。
                      </p>
                    )}
                  </div>

                  {/* Field 4: Description */}
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">详细过程说明</label>
                    <textarea 
                      data-testid="p1-ledger-description-input"
                      rows={4}
                      placeholder="详细描述该事件的发生背景、执行过程和取得成效..."
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      disabled={drawerMode === 'view'}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/50 outline-none resize-none disabled:bg-slate-50 disabled:text-slate-500"
                    ></textarea>
                  </div>

                  {/* Field 5: Upload Zone */}
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">现场/凭证照片上传</label>
                    {drawerMode === 'view' ? (
                      <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 flex flex-col gap-2">
                        {(selectedRecord?.files ?? 0) > 0 ? Array.from({ length: selectedRecord?.files ?? 0 }).map((_, i) => (
                           <div key={i} className="flex items-center gap-2 text-sm text-blue-600 cursor-pointer hover:underline">
                            <Paperclip className="w-4 h-4"/> 
                            宣贯培训签到表_{i+1}.pdf
                          </div>
                        )) : (
                          <span className="text-sm text-slate-500">无附件材料</span>
                        )}
                      </div>
                    ) : (
                      <label className="border-2 border-dashed border-slate-300 rounded-xl p-8 flex flex-col items-center justify-center bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer group" data-testid="p1-ledger-upload-zone">
                        <div className="w-10 h-10 bg-white rounded-full shadow-sm flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                          {isUploading ? <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" /> : <UploadCloud className="w-5 h-5 text-indigo-500" />}
                        </div>
                        <p className="text-sm font-bold text-slate-700 mb-1">{isUploading ? '上传中...' : '点击或拖拽文件至此区域'}</p>
                        <p className="text-xs text-slate-500 font-medium">支持 PDF, JPG/PNG 格式，单文件不超过 10MB</p>
                        <input
                          data-testid="p1-ledger-file-input"
                          type="file"
                          className="hidden"
                          disabled={isUploading}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void handleFileUpload(file);
                            event.currentTarget.value = '';
                          }}
                        />
                      </label>
                    )}
                    {fileNames.length > 0 && drawerMode !== 'view' && (
                      <div className="mt-3 space-y-1">
                        {fileNames.map((name, index) => (
                          <div key={`${name}-${index}`} className="flex items-center text-xs text-slate-600">
                            <Paperclip className="w-3.5 h-3.5 mr-1.5 text-indigo-500" />
                            <span className="truncate">{name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              </div>

              {/* Actions Footer */}
              <div className="px-6 py-4 border-t border-slate-200 bg-white shadow-[0_-4px_6px_-1px_rgb(0,0,0,0.05)] shrink-0 flex justify-end gap-3">
                {drawerMode === 'view' ? (
                  <button 
                    data-testid="p1-ledger-view-close"
                    onClick={() => setIsDrawerOpen(false)}
                    className="px-6 py-2 border border-slate-300 bg-white text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition-colors"
                  >
                    关闭
                  </button>
                ) : (
                  <>
                    <button 
                      data-testid="p1-ledger-cancel"
                      onClick={() => setIsDrawerOpen(false)}
                      className="px-4 py-2 border border-slate-300 bg-white text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition-colors"
                    >
                      取消
                    </button>
                    <button 
                      data-testid="p1-ledger-save"
                      onClick={handleSave}
                      disabled={!formData.title || !formData.date || isSaving}
                      className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSaving ? '保存中...' : drawerMode === 'edit' ? '保存修改' : '保存至证据库'}
                    </button>
                  </>
                )}
              </div>

            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除此记录？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后无法恢复。未挂载的记录删除不会影响任何考核。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" size="default">取消</AlertDialogCancel>
            <AlertDialogAction data-testid="p1-ledger-confirm-delete" onClick={handleDelete} className="bg-rose-600 text-white hover:bg-rose-700">删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
