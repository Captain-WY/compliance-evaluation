import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  FilterX, 
  ArrowUpDown,
  Calendar,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  LayoutTemplate,
  BellRing,
  Eye,
  CheckCircle2,
  Download,
  Send
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { issueApi } from '../../services/api';
import type { IssueLedgerPage } from '../../services/mock/issueLedger';

const generateMonthCalendar = (year: number, month: number) => {
  const startDate = new Date(year, month, 1);
  const startDay = startDate.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const days = [];
  
  for (let i = startDay - 1; i >= 0; i--) {
     days.push({ day: daysInPrevMonth - i, isCurrentMonth: false, date: new Date(year, month - 1, daysInPrevMonth - i) });
  }
  
  for (let i = 1; i <= daysInMonth; i++) {
     days.push({ day: i, isCurrentMonth: true, date: new Date(year, month, i) });
  }

  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
     days.push({ day: i, isCurrentMonth: false, date: new Date(year, month + 1, i) });
  }

  const weeks = [];
  for (let i = 0; i < 42; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
};

const isSameDay = (param1: Date, param2: Date) => {
  return param1.getFullYear() === param2.getFullYear() &&
         param1.getMonth() === param2.getMonth() &&
         param1.getDate() === param2.getDate();
};

const CustomDateRangePicker = ({ date, setDate, onClose }: { date: { from?: Date, to?: Date }, setDate: (d: { from?: Date, to?: Date }) => void, onClose: () => void }) => {
  const [currentMonthDate, setCurrentMonthDate] = useState(date.from || new Date());
  const [tempDate, setTempDate] = useState<{from?: Date, to?: Date}>(date);

  const handlePrevMonth = () => setCurrentMonthDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentMonthDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 1));

  const handleDateClick = (clickedDate: Date) => {
    if (!tempDate.from || (tempDate.from && tempDate.to)) {
       setTempDate({ from: clickedDate, to: undefined });
    } else {
       if (clickedDate < tempDate.from) {
          setTempDate({ from: clickedDate, to: tempDate.from });
       } else {
          setTempDate({ from: tempDate.from, to: clickedDate });
       }
    }
  };

  const handleConfirm = () => {
    setDate(tempDate);
    onClose();
  };

  const renderMonth = (year: number, month: number, title: string) => {
    const weeks = generateMonthCalendar(year, month);
    return (
      <div className="space-y-4 w-full">
        <div className="flex items-center justify-between pt-1 relative">
          {title === 'left' ? (
            <button onClick={handlePrevMonth} className="h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 flex items-center justify-center rounded-md border border-slate-200 hover:bg-slate-100 transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
          ) : <div className="w-7 h-7"></div>}
          
          <div className="text-sm font-medium">
            {new Date(year, month).toLocaleString('en-US', { month: 'long' })} {year}
          </div>
          
          {title === 'right' ? (
            <button onClick={handleNextMonth} className="h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 flex items-center justify-center rounded-md border border-slate-200 hover:bg-slate-100 transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : <div className="w-7 h-7"></div>}
        </div>
        <table className="w-full border-collapse space-y-1">
          <thead>
            <tr className="flex w-full">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day, idx) => (
                <th key={idx} className="text-slate-500 rounded-md w-9 font-normal text-[0.8rem]">{day}</th>
              ))}
            </tr>
          </thead>
          <tbody className="flex flex-col space-y-1 mt-2">
            {weeks.map((week, wIdx) => (
              <tr key={wIdx} className="flex w-full mt-1">
                {week.map((d, dIdx) => {
                  if (!d.isCurrentMonth) {
                     return <td key={dIdx} className="w-9 h-9 p-0 text-center text-sm"><div className="h-9 w-9 text-slate-300 flex items-center justify-center">{d.day}</div></td>;
                  }
                  
                  const isSelectedStart = tempDate.from && isSameDay(d.date, tempDate.from);
                  const isSelectedEnd = tempDate.to && isSameDay(d.date, tempDate.to);
                  const isSelected = isSelectedStart || isSelectedEnd;
                  const isBetween = tempDate.from && tempDate.to && d.date > tempDate.from && d.date < tempDate.to;

                  return (
                    <td key={dIdx} className="w-9 h-9 p-0 text-center text-sm relative">
                      {isBetween && <div className="absolute inset-0 bg-indigo-50"></div>}
                      {isSelectedStart && tempDate.to && <div className="absolute inset-0 bg-indigo-50 right-0 left-1/2"></div>}
                      {isSelectedEnd && tempDate.from && <div className="absolute inset-0 bg-indigo-50 left-0 right-1/2"></div>}
                      
                      <div 
                        onClick={() => handleDateClick(d.date)}
                        className={`h-9 w-9 flex items-center justify-center relative rounded-md cursor-pointer transition-colors ${
                          isSelected ? 'bg-indigo-600 text-white font-medium hover:bg-indigo-700' : 
                          isBetween ? 'text-slate-900 font-medium' : 
                          'text-slate-900 hover:bg-slate-100'
                        }`}
                      >
                        {d.day}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const nextMonthDate = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 1);

  return (
    <div className="flex flex-col">
      <div className="p-3 flex space-x-4">
        {renderMonth(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), 'left')}
        {renderMonth(nextMonthDate.getFullYear(), nextMonthDate.getMonth(), 'right')}
      </div>
      <div className="border-t border-slate-200 p-3 bg-slate-50 rounded-b-lg flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onClose} className="text-slate-600 bg-white shadow-sm border-slate-200">取消</Button>
        <Button size="sm" onClick={handleConfirm} className="bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm">应用范围</Button>
      </div>
    </div>
  );
};

export default function IssueLedgerTable({
  onNavigateToWorkspace,
  initialFilters,
}: {
  onNavigateToWorkspace?: (isReadOnly: boolean, issueId: string) => void;
  initialFilters?: Record<string, string>;
}) {
  const [issueData, setIssueData] = useState<IssueLedgerPage>({
    totalRecords: 0,
    currentPage: 1,
    pageSize: 10,
    records: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [date, setDate] = useState<{from?: Date, to?: Date}>({ from: new Date(2026, 4, 1), to: new Date(2026, 4, 10) });
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const drilldownFilterKey = JSON.stringify(initialFilters ?? {});

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    issueApi.getIssueLedgerPage(initialFilters)
      .then(page => {
        if (!cancelled) setIssueData(page);
      })
      .catch(error => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : '问题台账加载失败');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [drilldownFilterKey]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedRowKeys(issueData.records.map(r => r.issueId));
    } else {
      setSelectedRowKeys([]);
    }
  };

  const handleSelectRow = (id: string) => {
    setSelectedRowKeys(prev => 
      prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]
    );
  };

  const handleBatchDispatch = () => {
    toast.success(`✅ 成功向 ${selectedRowKeys.length} 个责任部门下发整改通知单`);
    setSelectedRowKeys([]);
  };

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case 'HIGH':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">高风险</span>;
      case 'MEDIUM':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">中风险</span>;
      case 'LOW':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">低风险</span>;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING_RECTIFICATION':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">待整改</span>;
      case 'RECTIFYING':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">整改中</span>;
      case 'PENDING_VERIFICATION':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">待核实</span>;
      case 'CLOSED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">已销号</span>;
      default:
        return null;
    }
  };

  const pageSize = Math.max(issueData.pageSize || 0, issueData.records.length || 1);
  const totalPages = Math.max(1, Math.ceil(issueData.totalRecords / pageSize));
  const firstRecord = issueData.records.length ? (issueData.currentPage - 1) * pageSize + 1 : 0;
  const lastRecord = issueData.records.length ? firstRecord + issueData.records.length - 1 : 0;

  return (
    <div className="flex flex-col h-full relative">
      
      {/* Advanced Filter Bar */}
      <div className="bg-white px-6 py-4 rounded-t-xl border border-slate-200 border-b-0 flex flex-wrap gap-4 items-end shadow-sm z-10 relative">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">搜索提取</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-sm"
              placeholder="搜索问题..."
            />
          </div>
        </div>

        <div className="w-40">
          <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">风险等级</label>
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white shadow-sm font-medium text-slate-700"
          >
            <option value="ALL">全部风险</option>
            <option value="HIGH">高风险</option>
            <option value="MEDIUM">中风险</option>
            <option value="LOW">低风险</option>
          </select>
        </div>

        <div className="w-40">
          <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">状态</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white shadow-sm font-medium text-slate-700"
          >
            <option value="ALL">全部状态</option>
            <option value="PENDING_RECTIFICATION">待整改</option>
            <option value="RECTIFYING">整改中</option>
            <option value="PENDING_VERIFICATION">待核实</option>
            <option value="CLOSED">已销号</option>
          </select>
        </div>
        
        <div className="w-40">
          <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">责任部门</label>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white shadow-sm font-medium text-slate-700"
          >
            <option value="ALL">全部部门</option>
            <option value="上海分公司">上海分公司</option>
            <option value="自营投资部">自营投资部</option>
          </select>
        </div>

        <div className="w-[280px]">
           <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">发现时间范围</label>
           <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
             <PopoverTrigger onClick={() => setIsDatePickerOpen(true)} className="flex h-10 w-full items-center text-sm rounded-lg border border-slate-200 bg-white px-3 py-2 text-left font-normal text-slate-600 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
               <Calendar className="mr-2 h-4 w-4 text-slate-500" /> 
               {date?.from ? (
                 date.to ? (
                   <span>
                     {date.from.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-')} - {date.to.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-')}
                   </span>
                 ) : (
                   <span>{date.from.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-')}</span>
                 )
               ) : (
                 <span className="text-slate-400">选择日期范围...</span>
               )}
             </PopoverTrigger>
             <PopoverContent className="w-auto p-0 bg-white border border-slate-200 shadow-lg rounded-lg z-50" align="start">
               <CustomDateRangePicker date={date} setDate={setDate} onClose={() => setIsDatePickerOpen(false)} />
             </PopoverContent>
           </Popover>
        </div>

        <button
          onClick={() => {}}
          className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-50 transition-colors flex items-center shadow-sm"
        >
          <FilterX className="w-4 h-4 mr-2" /> 重置
        </button>
      </div>

      {/* Data Table */}
      <div className="bg-white border border-slate-200 shadow-sm overflow-hidden flex-1 relative z-0">
        <div className="overflow-auto h-full">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold tracking-wide text-xs uppercase sticky top-0 z-10">
              <tr>
                <th scope="col" className="px-4 py-3 border-r border-slate-200/50 w-12 text-center">
                   <input 
                     type="checkbox" 
                     className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer w-4 h-4"
                     checked={selectedRowKeys.length === issueData.records.length && issueData.records.length > 0}
                     onChange={handleSelectAll}
                   />
                </th>
                <th scope="col" className="px-5 py-3 border-r border-slate-200/50">编号 & 标题</th>
                <th scope="col" className="px-5 py-3 border-r border-slate-200/50">责任部门</th>
                <th scope="col" className="px-5 py-3 border-r border-slate-200/50 cursor-pointer hover:bg-slate-100 transition-colors group">
                  <div className="flex items-center space-x-1">
                    <span>风险等级</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400 group-hover:text-slate-600" />
                  </div>
                </th>
                <th scope="col" className="px-5 py-3 border-r border-slate-200/50">状态</th>
                <th scope="col" className="px-5 py-3 border-r border-slate-200/50 cursor-pointer hover:bg-slate-100 transition-colors group">
                  <div className="flex items-center space-x-1">
                    <span>SLA 期限</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400 group-hover:text-slate-600" />
                  </div>
                </th>
                <th scope="col" className="px-5 py-3 text-center w-24">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-slate-500">
                    正在加载问题台账...
                  </td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-rose-600">
                    {loadError}
                  </td>
                </tr>
              ) : issueData.records.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-slate-500">
                    暂无问题记录
                  </td>
                </tr>
              ) : issueData.records.map((issue) => {
                const isOverdue = issue.slaDays < 0;
                const isWarning = issue.slaDays >= 0 && issue.slaDays <= 3;
                const isSelected = selectedRowKeys.includes(issue.issueId);

                return (
                  <tr 
                    key={issue.issueId} 
                    className={`transition-colors group ${
                      isSelected ? 'bg-indigo-50/50' : isOverdue && issue.status !== 'CLOSED' ? 'bg-rose-50/30 hover:bg-rose-50/60' : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <td className="px-4 py-4 text-center border-r border-slate-50">
                       <input 
                         type="checkbox" 
                         className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer w-4 h-4"
                         checked={isSelected}
                         onChange={() => handleSelectRow(issue.issueId)}
                       />
                    </td>
                    <td className="px-5 py-4 border-r border-slate-50">
                      <div className="flex flex-col">
                        <span className="text-xs text-slate-500 font-mono mb-1">{issue.issueId}</span>
                        <span className="text-sm font-bold text-slate-800 truncate max-w-[300px] xl:max-w-md" title={issue.title}>
                          {issue.title}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4 border-r border-slate-50">
                      <span className="text-sm font-medium text-slate-700">{issue.responsibleOrgName}</span>
                    </td>
                    <td className="px-5 py-4 border-r border-slate-50">
                      {getRiskBadge(issue.riskLevel)}
                    </td>
                    <td className="px-5 py-4 border-r border-slate-50">
                      {getStatusBadge(issue.status)}
                    </td>
                    <td className="px-5 py-4 border-r border-slate-50">
                      {issue.status === 'CLOSED' ? (
                        <span className="text-slate-400 text-sm font-medium">-</span>
                      ) : isOverdue ? (
                        <span className="text-rose-600 font-bold text-sm bg-rose-100 px-2 py-0.5 rounded shadow-sm border border-rose-200">
                          ⚠️ 逾期 {Math.abs(issue.slaDays)} 天
                        </span>
                      ) : isWarning ? (
                        <span className="text-amber-600 font-bold text-sm">剩余 {issue.slaDays} 天</span>
                      ) : (
                        <span className="text-slate-500 text-sm font-medium">剩余 {issue.slaDays} 天</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-center">
                       {issue.status === 'PENDING_VERIFICATION' && (
                         <Button 
                           data-testid={`verify-rectification-${issue.issueId}`}
                           size="sm" 
                           onClick={() => {
                             if (onNavigateToWorkspace) {
                               onNavigateToWorkspace(false, issue.rectificationId ?? issue.issueId);
                             }
                           }}
                           className="bg-indigo-600 hover:bg-indigo-700 text-white h-8 px-3 text-xs shadow-sm active:scale-95 transition-transform"
                         >
                           <LayoutTemplate className="w-3 h-3 mr-1.5"/> 进入工作台核实
                         </Button>
                       )}
                       {issue.status === 'PENDING_RECTIFICATION' && isOverdue && (
                         <Button
                           variant="outline"
                           size="sm"
                           onClick={() => {
                              toast.success('已下发督办提醒至相关责任部门，并同步发送站内通知。');
                            }}
                           className="border-rose-200 text-rose-600 bg-rose-50 hover:bg-rose-100 h-8 px-3 text-xs active:scale-95 transition-transform"
                         >
                           <BellRing className="w-3 h-3 mr-1.5"/> 督办提醒
                         </Button>
                       )}
                       {issue.status === 'RECTIFYING' && (
                         <Button 
                           variant="ghost" 
                           size="sm" 
                           onClick={() => {
                             if (onNavigateToWorkspace) {
                               onNavigateToWorkspace(true, issue.rectificationId ?? issue.issueId);
                             }
                           }}
                           className="text-slate-500 hover:text-indigo-600 h-8 px-3 text-xs active:scale-95 transition-transform"
                         >
                           <Eye className="w-3 h-3 mr-1.5"/> 查看案卷
                         </Button>
                       )}
                       {issue.status === 'CLOSED' && (
                         <span className="text-slate-400 text-xs flex items-center justify-center"><CheckCircle2 className="w-3.5 h-3.5"/></span>
                       )}
                       {issue.status === 'PENDING_RECTIFICATION' && !isOverdue && (
                          <button className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors inline-flex justify-center active:scale-95">
                            <MoreHorizontal className="w-5 h-5" />
                          </button>
                       )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Production Pagination */}
      <div className="bg-slate-50 border border-t-0 border-slate-200 rounded-b-xl p-4 flex flex-col sm:flex-row items-center justify-between text-sm shadow-sm gap-4">
         <div className="text-slate-500 font-medium">
           显示第 <span className="font-bold text-slate-700">{firstRecord}</span> 至 <span className="font-bold text-slate-700">{lastRecord}</span> 项，共 <span className="font-bold text-slate-700">{issueData.totalRecords}</span> 项
         </div>
         
         <div className="flex items-center space-x-1">
            <button disabled className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 shadow-sm">
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: totalPages }).map((_, index) => (
              <button
                key={index + 1}
                className={`min-w-[32px] h-[32px] rounded-lg font-medium text-sm shadow-sm ${
                  index === 0
                    ? 'bg-indigo-600 text-white font-bold'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {index + 1}
              </button>
            ))}
            <button disabled className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 shadow-sm">
              <ChevronRight className="w-4 h-4" />
            </button>
         </div>

         <div className="flex items-center space-x-2 text-slate-500 font-medium">
           <span>每页显示</span>
           <select className="border border-slate-200 bg-white rounded-md py-1 pl-2 pr-6 text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-sm text-sm">
             <option value="10">10</option>
             <option value="20">20</option>
             <option value="50">50</option>
           </select>
           <span>条</span>
         </div>
      </div>

      {/* Sticky Batch Action Bar */}
      {selectedRowKeys.length > 0 && (
        <div className="sticky bottom-0 w-full bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20">
          <div className="flex items-center text-sm text-slate-600">
             <div className="w-5 h-5 bg-indigo-100 text-indigo-700 rounded flex items-center justify-center text-xs font-bold mr-2">
               {selectedRowKeys.length}
             </div> 
             项已选择
          </div>
          <div className="flex gap-3">
             <Button variant="outline" className="border-slate-300 text-slate-700 hover:bg-slate-50">
               <Download className="w-4 h-4 mr-2"/> 批量导出 (Export)
             </Button>
             <Button variant="outline" onClick={handleBatchDispatch} className="border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100">
               <Send className="w-4 h-4 mr-2"/> 批量派发整改 (Manual Dispatch)
             </Button>
          </div>
        </div>
      )}

    </div>
  );
}
