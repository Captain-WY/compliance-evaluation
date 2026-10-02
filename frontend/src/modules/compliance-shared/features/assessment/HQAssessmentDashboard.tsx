import React, { useEffect, useState } from 'react';
import { Building2, Activity, BarChart3, AlertTriangle, Trophy, Search, FileSearch, History, ChevronRight } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import AssessmentScoreCheck from './AssessmentScoreCheck';
import AssessmentRecordsDashboard from './AssessmentRecordsDashboard';
import { API_MODE, assessmentApi } from '../../services/api';

type LoadState = 'loading' | 'ready' | 'empty' | 'error' | 'hybrid-disabled';

type LeaderboardRow = {
  id?: string;
  rank?: number | null;
  name?: string;
  score?: number | null;
  status?: string | null;
  statusClass?: string;
  scoreClass?: string;
  rankClass?: string;
  children?: LeaderboardRow[];
};

const formatNumber = (value: number | null | undefined, digits = 1) =>
  value == null ? '--' : value.toFixed(digits);

const formatInteger = (value: number | null | undefined) =>
  value == null ? '--' : String(value);

const flattenRows = (rows: LeaderboardRow[]): LeaderboardRow[] =>
  rows.flatMap(row => [row, ...flattenRows(row.children ?? [])]);

const isConfirmedStatus = (status: string | null | undefined): boolean | null => {
  if (!status) return null;
  const normalized = status.toUpperCase();
  return normalized.includes('CONFIRMED')
    || normalized.includes('PUBLISHED')
    || normalized.includes('FINALIZED')
    || normalized.includes('ARCHIVED')
    || status.includes('已确认')
    || status.includes('已归档');
};

const scoreBands = [
  { key: 'A', label: 'A级', range: '90-100', tone: 'bg-emerald-400', match: (score: number) => score >= 90 },
  { key: 'B', label: 'B级', range: '80-89.9', tone: 'bg-blue-400', match: (score: number) => score >= 80 && score < 90 },
  { key: 'C', label: 'C级', range: '70-79.9', tone: 'bg-amber-400', match: (score: number) => score >= 70 && score < 80 },
  { key: 'D', label: 'D级', range: '<70', tone: 'bg-rose-400', match: (score: number) => score < 70 },
];

function EmptyMiniPanel({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center">
      <div className="text-sm font-bold text-slate-700">{title}</div>
      <div className="text-xs text-slate-500 mt-1 leading-relaxed">{message}</div>
    </div>
  );
}

export default function HQAssessmentDashboard() {
  const [drawerContent, setDrawerContent] = useState<'none' | 'scorecard' | 'history'>('none');
  const [selectedBranch, setSelectedBranch] = useState<{id: string, name: string} | null>(null);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardRow[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');

  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const toggleRow = (id: string) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  useEffect(() => {
    if (API_MODE === 'hybrid') {
      setLeaderboardData([]);
      setLoadState('hybrid-disabled');
      return;
    }

    let cancelled = false;
    setLoadState('loading');
    assessmentApi.getLeaderboardData()
      .then(items => {
        if (!cancelled) {
          setLeaderboardData(items);
          setLoadState(items.length > 0 ? 'ready' : 'empty');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLeaderboardData([]);
          setLoadState('error');
        }
      })
    return () => {
      cancelled = true;
    };
  }, []);

  const allRows = flattenRows(leaderboardData);
  const scoreValues = allRows.map(row => row.score).filter((score): score is number => score != null);
  const averageScore = scoreValues.length
    ? scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length
    : null;
  const statusSignals = allRows.map(row => isConfirmedStatus(row.status));
  const confirmedCount = allRows.length > 0 && statusSignals.every(status => status != null)
    ? statusSignals.filter(Boolean).length
    : null;
  const confirmationProgress = confirmedCount == null || allRows.length === 0
    ? null
    : Math.round((confirmedCount / allRows.length) * 100);
  const distribution = scoreBands.map(band => {
    const count = scoreValues.filter(band.match).length;
    const percent = scoreValues.length ? Math.round((count / scoreValues.length) * 100) : 0;
    return { ...band, count, percent };
  });

  const statusMessage = {
    loading: '正在加载后端考核榜单读模型...',
    ready: '',
    empty: '后端考核概览未返回榜单记录，页面不展示静态榜单或样例指标。',
    error: '考核榜单读模型加载失败，未展示任何样例兜底。',
    'hybrid-disabled': 'Hybrid 模式不展示总部考核大盘样例数据；请切换 real 模式查看后端读模型。',
  }[loadState];

  const isDemoMode = API_MODE === 'mock';

  return (
    <div className="w-full" data-testid="p1-dashboard-page">
      {/* Page Header & Global Selector */}
      <h2 className="text-xl font-bold text-slate-900 flex items-center mb-4">
        <Building2 className="w-5 h-5 mr-2 text-blue-600" /> 总部全景考核大盘
      </h2>
      
      <div className="flex items-center gap-4 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
        <span className="text-sm font-bold text-slate-700 ml-2">数据范围:</span>
        <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">
          后端考核概览默认范围
        </Badge>
        <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">
          周期筛选待真实读模型接入
        </Badge>
      </div>

      {isDemoMode ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          当前为显式 mock 模式，页面仅用于演示；real/hybrid 模式不会使用这些样例作为生产数据。
        </div>
      ) : null}

      {statusMessage ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {statusMessage}
        </div>
      ) : null}

      {/* Executive Mini-BI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 mb-8">
        
        {/* Card 1: Global KPI & Progress */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="text-sm font-bold text-slate-500 mb-4 flex items-center">
            <Activity className="w-4 h-4 mr-1"/> 全网考核概况
          </div>
          <div className="flex justify-between items-end mb-4">
            <div>
              <div className="text-3xl font-black text-blue-600">
                {formatNumber(averageScore)}<span className="text-sm font-normal text-slate-400 ml-1">分 (平均)</span>
              </div>
              <div className="text-xs text-slate-500 mt-1">较上期差值未由 read-model 返回</div>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-slate-700">
                {formatInteger(confirmedCount)}<span className="text-sm font-normal text-slate-400"> / {allRows.length} 家</span>
              </div>
              <div className="text-xs text-slate-500 mt-1">已确认归档进度</div>
            </div>
          </div>
          {confirmationProgress == null ? (
            <EmptyMiniPanel title="确认进度不可计算" message="后端榜单记录未完整返回确认状态字段。" />
          ) : (
            <Progress value={confirmationProgress} className="h-2" />
          )}
        </div>

        {/* Card 2: Score Distribution */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="text-sm font-bold text-slate-500 flex items-center">
            <BarChart3 className="w-4 h-4 mr-1"/> 成绩分布画像
          </div>
          {scoreValues.length === 0 ? (
            <div className="mt-4">
              <EmptyMiniPanel title="暂无分布数据" message="后端榜单未返回可计算的得分字段。" />
            </div>
          ) : (
            <div className="space-y-3 mt-4">
              {distribution.map((band) => (
                <div key={band.key} className="flex items-center text-sm">
                  <div className="w-20 text-slate-600 font-medium">
                    {band.label} <span className="text-xs text-slate-400">({band.range})</span>
                  </div>
                  <div className="flex-1 ml-2">
                    <div className={`${band.tone} h-2 rounded-full`} style={{ width: `${band.percent}%` }} />
                  </div>
                  <div className="w-8 text-right font-bold">{band.count}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Card 3: Top Risk Hotspots */}
        <div className="bg-white border border-rose-100 rounded-xl p-5 shadow-sm bg-gradient-to-br from-white to-rose-50/30">
          <div className="text-sm font-bold text-rose-600 mb-3 flex items-center">
            <AlertTriangle className="w-4 h-4 mr-1"/> 全网共性失血点 Top 3
          </div>
          <EmptyMiniPanel
            title="风险热点未接入"
            message="AssessmentResultAggregateReadModel 未返回共性扣分热点字段，生产模式不展示本地 Top 3 样例。"
          />
        </div>

      </div>

      {/* Leaderboard Table Container */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
          <h3 className="font-bold text-slate-800 flex items-center">
            <Trophy className="w-4 h-4 mr-2 text-amber-500"/> 分支机构考核榜单 (Leaderboard)
          </h3>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400"/>
              <Input disabled placeholder="后端搜索待接入" className="pl-9 w-[200px] bg-white h-9" data-testid="p1-dashboard-search" />
            </div>
            <Button variant="outline" disabled className="h-9 text-slate-500" data-testid="p1-dashboard-status-filter">
              状态筛选待接入
            </Button>
          </div>
        </div>

        {/* Table Content */}
        <div className="w-full">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-medium">排名 (Rank)</th>
                <th className="px-6 py-4 font-medium">机构名称 (Branch)</th>
                <th className="px-6 py-4 font-medium">最终得分 (Score)</th>
                <th className="px-6 py-4 font-medium">状态 (Status)</th>
                <th className="px-6 py-4 font-medium text-right">操作 (Action)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadState === 'loading' ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-500">
                    正在加载分支机构考核榜单...
                  </td>
                </tr>
              ) : leaderboardData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-500">
                    暂无榜单数据
                  </td>
                </tr>
              ) : leaderboardData.map((region, regionIndex) => {
                const regionId = region.id ?? `leaderboard-region-${regionIndex + 1}`;
                const children = region.children ?? [];
                return (
                <React.Fragment key={regionId}>
                  {/* Level 1: Regional Branch */}
                  <tr 
                    data-testid={`p1-dashboard-region-row-${regionId}`}
                    className="hover:bg-slate-100 transition-colors bg-slate-50/50 cursor-pointer"
                    onClick={() => toggleRow(regionId)}
                  >
                    <td className="px-6 py-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold border ${region.rankClass ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        {formatInteger(region.rank)}
                      </div>
                    </td>
                    <td className="px-6 py-3 font-bold text-slate-800 flex items-center gap-1">
                      <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${expandedRows[regionId] ? 'rotate-90' : ''}`} />
                      {region.name ?? regionId}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`font-bold text-lg ${region.scoreClass ?? 'text-slate-500'}`}>{formatNumber(region.score)}</span>
                    </td>
                    <td className="px-6 py-3">
                      <Badge variant="outline" className={region.statusClass ?? 'text-slate-600 border-slate-200'}>{region.status ?? '--'}</Badge>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex justify-end">
                        <span className="text-xs text-slate-400 italic">汇总层级 (Aggregated)</span>
                      </div>
                    </td>
                  </tr>

                  {/* Level 2: Business Departments (Children) */}
                  {expandedRows[regionId] && children.map((child, childIndex) => {
                    const childId = child.id ?? `${regionId}-child-${childIndex + 1}`;
                    return (
                    <tr key={childId} data-testid={`p1-dashboard-branch-row-${childId}`} className="hover:bg-slate-50 transition-colors bg-white">
                      <td className="px-6 py-3">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center font-medium bg-slate-100 text-slate-500 text-xs ml-1">
                          {formatInteger(child.rank)}
                        </div>
                      </td>
                      <td className="px-6 py-3 font-medium text-slate-600 pl-8 relative">
                        <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-200"></div>
                        <div className="absolute left-3 top-1/2 w-3 h-px bg-slate-200"></div>
                        {child.name ?? childId}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`font-bold text-base ${child.scoreClass ?? 'text-slate-500'}`}>{formatNumber(child.score)}</span>
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant="outline" className={child.statusClass ?? 'text-slate-600 border-slate-200'}>{child.status ?? '--'}</Badge>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex gap-2 justify-end">
                          <Button variant="outline" size="sm" data-testid={`p1-dashboard-scorecard-${childId}`} className="text-blue-600 border-blue-200 hover:bg-blue-50 h-7 text-xs" onClick={(e) => { e.stopPropagation(); setDrawerContent('scorecard'); setSelectedBranch({ id: childId, name: child.name ?? childId }); }}>
                            <FileSearch className="w-3 h-3 mr-1"/> 阅卷/成绩单
                          </Button>
                          <Button variant="ghost" size="sm" data-testid={`p1-dashboard-history-${childId}`} className="text-slate-500 hover:text-blue-600 h-7 text-xs" onClick={(e) => { e.stopPropagation(); setDrawerContent('history'); setSelectedBranch({ id: childId, name: child.name ?? childId }); }}>
                            <History className="w-3 h-3 mr-1"/> 历史档案
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );})}
                </React.Fragment>
              );})}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drill-down Drawer (Sheet) */}
      <Sheet open={drawerContent !== 'none'} onOpenChange={(open) => { if (!open) setDrawerContent('none'); }}>
        <SheetContent 
          side="right" 
          className="!w-[90vw] !max-w-[1000px] sm:!max-w-[800px] xl:!max-w-[1000px] bg-slate-50 p-0 flex flex-col border-l border-slate-200"
          style={{ maxWidth: '60vw', width: '1000px' }}
        >
          <SheetHeader className="p-6 bg-white border-b border-slate-200 shrink-0 sticky top-0 z-20 shadow-sm">
            <SheetTitle className="text-lg font-bold text-slate-800">
              {selectedBranch?.name} - 后端读模型范围 {drawerContent === 'scorecard' ? '考核成绩档案 (Scorecard)' : '历史考核趋势 (History)'}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
            {drawerContent === 'scorecard' && (
              <AssessmentScoreCheck isLocked={true} onBack={() => setDrawerContent('none')} />
            )}
            {drawerContent === 'history' && (
              <AssessmentRecordsDashboard />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
