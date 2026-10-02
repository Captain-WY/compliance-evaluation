import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, DatabaseBackup, LineChart as LineChartIcon, Search } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { StableChartContainer } from '@/components/charts/StableChartContainer';
import AssessmentScoreCheck from './AssessmentScoreCheck';
import { API_MODE, assessmentApi } from '../../services/api';
import type { AssessmentResult } from '../../types';

type LoadState = 'loading' | 'ready' | 'empty' | 'error' | 'hybrid-disabled';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;

  return (
    <div className="bg-white border border-slate-200 p-3 rounded-lg shadow-md">
      <p className="font-bold text-slate-800 mb-1">{label}</p>
      <p className="text-blue-600 font-bold text-sm">得分: {data.score} 分</p>
      {data.rank ? <p className="text-slate-500 text-xs mt-1">评级: {data.rank}</p> : null}
    </div>
  );
};

const statusBadge = (result: AssessmentResult) => {
  if (result.isDisputed) {
    return <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">申诉处理中</Badge>;
  }
  return <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50">{result.category || '真实结果'}</Badge>;
};

export default function AssessmentRecordsDashboard() {
  const [results, setResults] = useState<AssessmentResult[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [showScoreCheck, setShowScoreCheck] = useState(false);
  const [selectedAssessment, setSelectedAssessment] = useState<{ id: string, name: string, isLocked: boolean, resultId?: string } | null>(null);
  const [chartType, setChartType] = useState('all');
  const [timeRange, setTimeRange] = useState('all');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const isDemoMode = API_MODE === 'mock';

  useEffect(() => {
    if (API_MODE === 'hybrid') {
      setResults([]);
      setLoadState('hybrid-disabled');
      return;
    }

    let cancelled = false;
    setLoadState('loading');
    assessmentApi.getAssessmentResults()
      .then(items => {
        if (cancelled) return;
        setResults(items);
        setChartType('all');
        setLoadState(items.length > 0 ? 'ready' : 'empty');
      })
      .catch(() => {
        if (!cancelled) {
          setResults([]);
          setLoadState('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleResults = useMemo(() => {
    if (chartType === 'appealed') return results.filter(result => result.isDisputed);
    if (chartType !== 'all') return results.filter(result => result.id === chartType);
    return results;
  }, [chartType, results]);

  const currentData = useMemo(
    () => visibleResults.map(result => ({
      id: result.id,
      name: result.indicatorName,
      score: result.systemScore,
      rank: result.category,
    })),
    [visibleResults],
  );

  const handleOpenCheck = (id: string, name: string, isLocked: boolean, resultId?: string) => {
    setSelectedAssessment({ id, name, isLocked, resultId });
    setShowScoreCheck(true);
  };

  const statusMessage = {
    loading: '正在加载后端考核结果...',
    ready: '',
    empty: '当前没有真实考核结果记录。',
    error: '考核结果加载失败，未展示静态历史记录样例。',
    'hybrid-disabled': 'Hybrid 模式不展示 P1 assessment result 样例数据；请切换 real 模式查看后端结果。',
  }[loadState];

  if (showScoreCheck && selectedAssessment) {
    return (
      <AssessmentScoreCheck
        isLocked={selectedAssessment.isLocked}
        assessmentName={selectedAssessment.name}
        resultId={selectedAssessment.resultId}
        onBack={() => setShowScoreCheck(false)}
      />
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto pb-24" data-testid="p1-assessment-records-page">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">考核成绩与档案 (My Assessment Records)</h2>
        <p className="text-sm text-slate-500 mt-1">查看后端返回的考核成绩，核对当期得分并进入真实成绩明细。</p>
      </div>

      {isDemoMode ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          当前为显式 mock 模式，页面仅用于演示；real/hybrid 模式不会使用静态历史记录样例。
        </div>
      ) : null}

      {statusMessage ? (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {statusMessage}
        </div>
      ) : null}

      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm mb-6">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 mb-6">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-800 flex items-center text-base">
              <LineChartIcon className="w-5 h-5 mr-2 text-blue-600" />
              历史成绩趋势分析
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">查看范围:</span>
              <Tabs value={timeRange} onValueChange={setTimeRange} className="h-8">
                <TabsList className="bg-slate-100 p-0.5 h-8">
                  <TabsTrigger value="1y" data-testid="p1-assessment-range-1y" className="text-xs px-3 h-7">近1年</TabsTrigger>
                  <TabsTrigger value="3y" data-testid="p1-assessment-range-3y" className="text-xs px-3 h-7">近3年</TabsTrigger>
                  <TabsTrigger value="all" data-testid="p1-assessment-range-all" className="text-xs px-3 h-7">全部</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex p-1 bg-slate-50 rounded-lg border border-slate-200">
              <Button
                variant="ghost"
                size="sm"
                data-testid="p1-assessment-type-comprehensive"
                onClick={() => setChartType('all')}
                className={chartType === 'all' ? 'bg-white shadow-sm text-blue-600 text-xs font-bold px-4' : 'text-slate-600 text-xs px-4 hover:bg-slate-100'}
              >
                全部真实结果
              </Button>
              <Button
                variant="ghost"
                size="sm"
                data-testid="p1-assessment-type-aml"
                onClick={() => setChartType('appealed')}
                className={chartType === 'appealed' ? 'bg-white shadow-sm text-blue-600 text-xs font-bold px-4' : 'text-slate-600 text-xs px-4 hover:bg-slate-100'}
              >
                申诉/异议记录
              </Button>
            </div>

            <Popover open={isSearchOpen} onOpenChange={setIsSearchOpen}>
              <PopoverTrigger data-testid="p1-assessment-search-trigger" className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-md border border-dashed border-slate-300 bg-white px-3 text-xs font-medium text-slate-500 ring-offset-white transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 lg:ml-auto">
                <Search className="w-3.5 h-3.5 mr-2" />
                {chartType !== 'all' && chartType !== 'appealed'
                  ? results.find(result => result.id === chartType)?.indicatorName || '真实结果'
                  : '搜索真实考核结果...'}
              </PopoverTrigger>
              <PopoverContent className="w-[320px] p-0" align="end">
                <Command>
                  <CommandInput placeholder="输入机构或结果名称搜索..." data-testid="p1-assessment-search-input" />
                  <CommandList>
                    <CommandEmpty>未找到相关考核结果</CommandEmpty>
                    <CommandGroup>
                      {results.map(result => (
                        <CommandItem
                          key={result.id}
                          value={`${result.indicatorName} ${result.category} ${result.id}`}
                          onSelect={() => {
                            setChartType(result.id);
                            setIsSearchOpen(false);
                          }}
                        >
                          <LineChartIcon className="mr-2 h-4 w-4 text-blue-500 opacity-70" />
                          <span>{result.indicatorName}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="h-[250px] w-full mt-4">
          {currentData.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-sm">
              <DatabaseBackup className="w-8 h-8 mb-2 opacity-20" />
              暂无真实历史考核数据
            </div>
          ) : (
            <StableChartContainer>
              <AreaChart data={currentData}>
                <defs>
                  <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} dy={10} />
                <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} dx={-10} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="score" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorScore)" activeDot={{ r: 6, stroke: '#2563eb', strokeWidth: 2, fill: '#fff' }} />
              </AreaChart>
            </StableChartContainer>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold">考核结果 (Assessment Result)</th>
                <th className="px-6 py-4 font-semibold">总得分 (Score)</th>
                <th className="px-6 py-4 font-semibold">核对截止日 (Deadline)</th>
                <th className="px-6 py-4 font-semibold">状态 (Status)</th>
                <th className="px-6 py-4 font-semibold text-right">操作 (Action)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleResults.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                    暂无真实考核结果记录
                  </td>
                </tr>
              ) : (
                visibleResults.map(result => (
                  <tr key={result.id} className="hover:bg-slate-50/50 transition-colors" data-testid={`p1-assessment-row-${result.id}`}>
                    <td className="px-6 py-4 font-medium text-slate-900">
                      <div>{result.indicatorName}</div>
                      <div className="text-xs text-slate-400 mt-1">{result.id}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-bold text-blue-600">{result.systemScore}</span> / {result.maxScore}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-slate-400">后端未返回核对截止日</div>
                    </td>
                    <td className="px-6 py-4">
                      {statusBadge(result)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        size="sm"
                        data-testid={`p1-assessment-open-${result.id}`}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={() => handleOpenCheck(result.id, result.indicatorName, false, result.id)}
                      >
                        去核对明细 <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
