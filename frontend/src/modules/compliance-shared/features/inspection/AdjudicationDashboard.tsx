import React, { useState, useEffect, useMemo } from 'react';
import { Scale, Building2, Gavel, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { inspectionApi } from '../../services/api';

interface AppealListItem {
  appealId?: string;
  id?: string;
  issueId?: string;
  branchName?: string;
  reason?: string;
  status?: string;
  submittedAt?: string;
  issue?: {
    title?: string;
    riskLevel?: string;
    issueCode?: string;
    inspectionPlanId?: string;
  };
}

interface PlanItem {
  id?: string;
  inspectionPlanId?: string;
  title?: string;
}

interface AdjudicationDashboardProps {
  onEnterConsole?: (inspectionPlanId: string, isArchived: boolean) => void;
}

export default function AdjudicationDashboard({ onEnterConsole }: AdjudicationDashboardProps) {
  const [appeals, setAppeals] = useState<AppealListItem[]>([]);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      inspectionApi.getAppeals({ pageSize: '100' }),
      inspectionApi.getPlans({ pageSize: 100 }),
    ])
      .then(([appealsData, plansData]) => {
        setAppeals((appealsData as any)?.items ?? []);
        setPlans((plansData as any)?.items ?? []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch adjudication data', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadData();
  }, []);

  const planTitleMap = useMemo(() => {
    const map: Record<string, string> = {};
    plans.forEach(plan => {
      const pid = plan.inspectionPlanId ?? plan.id;
      if (pid) map[pid] = plan.title ?? pid;
    });
    return map;
  }, [plans]);

  const projectGroups = useMemo<Record<string, AppealListItem[]>>(() => {
    const groups: Record<string, AppealListItem[]> = {};
    appeals.forEach(appeal => {
      const planId = appeal.issue?.inspectionPlanId ?? 'UNKNOWN';
      if (!groups[planId]) groups[planId] = [];
      groups[planId].push(appeal);
    });
    return groups;
  }, [appeals]);

  const projectRows = useMemo(() => {
    return Object.keys(projectGroups).map(planId => {
      const items = projectGroups[planId];
      const pendingCount = items.filter(
        item => item.status === 'SUBMITTED' || item.status === 'UNDER_ADJUDICATION'
      ).length;
      const branchSet = new Set(items.map(item => item.branchName).filter(Boolean));
      const isArchived = pendingCount === 0;
      return {
        planId,
        title: planTitleMap[planId] ?? planId,
        pendingCount,
        totalCount: items.length,
        branchCount: branchSet.size,
        isArchived,
      };
    });
  }, [projectGroups, planTitleMap]);

  const totalPendingProjects = projectRows.filter(r => !r.isArchived).length;
  const totalPendingDefects = projectRows.reduce((sum, r) => sum + r.pendingCount, 0);
  const totalBranchCount = new Set(appeals.map(a => a.branchName).filter(Boolean)).size;

  return (
    <div className="w-full h-full p-6 bg-slate-50 overflow-y-auto">
      {/* 1. Page Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-800 flex items-center">
          <Scale className="w-6 h-6 mr-2 text-indigo-600" /> 申辩与裁决中心
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          处理各分支机构提交的缺陷申辩，进行最终的证据复核与定性裁决。
        </p>
      </div>

      {/* 2. Summary Metric Cards */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex items-center">
          <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mr-4">
            <AlertCircle className="w-6 h-6 text-slate-500" />
          </div>
          <div>
            <div className="text-slate-500 text-sm font-bold">待处理项目</div>
            <div className="text-3xl font-bold text-slate-800 mt-1">
              {totalPendingProjects} <span className="text-xs font-normal text-slate-500">个</span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex items-center">
          <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mr-4">
            <Building2 className="w-6 h-6 text-slate-500" />
          </div>
          <div>
            <div className="text-slate-500 text-sm font-bold">待裁决机构总数</div>
            <div className="text-3xl font-bold text-slate-800 mt-1">
              {totalBranchCount} <span className="text-xs font-normal text-slate-500">家</span>
            </div>
          </div>
        </div>

        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 shadow-sm flex items-center">
          <div className="w-12 h-12 bg-indigo-100/50 rounded-full flex items-center justify-center mr-4">
            <Gavel className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <div className="text-indigo-600 text-sm font-bold">待裁决缺陷总数</div>
            <div className="text-3xl font-bold text-indigo-900 mt-1">
              {totalPendingDefects} <span className="text-xs font-normal text-indigo-500">项</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Full-Width Data Table */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
            <tr>
              <th className="px-6 py-4">项目名称</th>
              <th className="px-6 py-4 w-40">涉及机构</th>
              <th className="px-6 py-4 w-64">当前状态</th>
              <th className="px-6 py-4 w-40">待裁决缺陷</th>
              <th className="px-6 py-4 w-48 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-500">加载中...</td>
              </tr>
            ) : projectRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-500">暂无申辩与裁决任务</td>
              </tr>
            ) : (
              projectRows.map(row => (
                <tr key={row.planId} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-700">{row.title}</div>
                    <div className="text-xs text-slate-400 mt-1">{row.planId}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center text-sm text-slate-600">
                      <Building2 className="w-4 h-4 mr-1 text-slate-400" /> {row.branchCount} 家
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {!row.isArchived ? (
                      <div className="flex gap-2">
                        <Badge variant="outline" className="bg-rose-50 text-rose-600 border-rose-200">
                          待裁决
                        </Badge>
                      </div>
                    ) : (
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> 裁决已完结
                      </Badge>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-slate-600 font-medium">
                      {row.pendingCount} / {row.totalCount} 项
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {!row.isArchived ? (
                      <Button
                        className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                        onClick={() => onEnterConsole?.(row.planId, false)}
                      >
                        <Gavel className="w-4 h-4 mr-2" /> 进入裁决工作台
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        className="text-slate-500 border-slate-200 hover:bg-slate-50"
                        onClick={() => onEnterConsole?.(row.planId, true)}
                      >
                        <ArrowRight className="w-4 h-4 mr-2" /> 查看归档
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-sm text-slate-500">
          <span>共 {projectRows.length} 个项目</span>
        </div>
      </div>
    </div>
  );
}
