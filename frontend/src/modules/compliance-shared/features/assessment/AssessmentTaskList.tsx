import React, { useEffect, useState } from 'react';
import { ArrowRight, AlertCircle, Play, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { API_MODE, assessmentApi } from '../../services/api';
import type { ReportingTask } from '../../types';

interface AssessmentTaskListProps {
  onEnterTask: (taskId: string) => void;
}

export default function AssessmentTaskList({ onEnterTask }: AssessmentTaskListProps) {
  const [tasks, setTasks] = useState<ReportingTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    assessmentApi.getReportingTasks()
      .then(items => {
        if (!cancelled) {
          setTasks(items);
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const demoTasks = tasks.length ? tasks : [];
  const showStaticDemo = API_MODE !== 'real' && !isLoading && demoTasks.length === 0;

  return (
    <div className="p-6 max-w-5xl mx-auto h-full flex flex-col">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">待填报考核任务 (My Assessment Tasks)</h2>
        <p className="text-sm text-slate-500 mt-1">请在截止日期前完成以下考核方案的数据填报与佐证材料上传。</p>
      </div>

      <div className="space-y-4">
        {isLoading && (
          <div className="bg-white border border-slate-200 rounded-xl p-8 flex items-center justify-center text-slate-500">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            正在加载真实考核填报任务...
          </div>
        )}
        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-5 text-sm text-rose-700">
            {error}
          </div>
        )}
        {!isLoading && !error && demoTasks.map(task => (
          <div key={task.id} data-testid={`reporting-task-row-${task.id}`} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <Badge variant="outline" className={task.status === 'SUBMITTED' ? 'text-emerald-600 border-emerald-200 bg-emerald-50' : 'text-amber-600 border-amber-200 bg-amber-50'}>
                  {task.status === 'SUBMITTED' ? '已提交' : '待填报'}
                </Badge>
                <h3 className="font-bold text-slate-800 text-lg">{task.indicatorName}</h3>
              </div>
              <div className="text-sm text-slate-500">{task.description}</div>
            </div>
            <div className="md:w-48 flex justify-end">
              <Button data-testid={`reporting-task-item-${task.id}`} onClick={() => onEnterTask(task.id)} className="bg-blue-600 hover:bg-blue-700 text-white w-full md:w-auto">
                进入填报 <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        ))}
        {!isLoading && !error && demoTasks.length > 0 && null}
        {!isLoading && !error && demoTasks.length === 0 && !showStaticDemo && (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
            当前账号暂无可填报的考核任务。
          </div>
        )}
        {showStaticDemo && (
          <>
        {/* Task A (In Progress) */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Left Section */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">🟡 填报中</Badge>
              <h3 className="font-bold text-slate-800 text-lg">2026年Q1营业部综合考核</h3>
            </div>
            <div className="text-sm text-slate-500">
              共 15 项指标 | 已填写 <span className="font-bold text-slate-700">5</span> 项
            </div>
          </div>

          {/* Middle Section */}
          <div className="md:w-64">
            <div className="bg-slate-50 px-4 py-2 rounded-lg border border-slate-200 text-sm">
              <div className="text-slate-500 mb-1">填报截止时间</div>
              <div className="font-bold text-slate-800">
                2026-05-15 18:00
                <span className="text-amber-600 ml-2">(剩余 7 天)</span>
              </div>
            </div>
          </div>

          {/* Right Section */}
          <div className="md:w-48 flex justify-end">
            <Button onClick={() => onEnterTask('task-a')} className="bg-blue-600 hover:bg-blue-700 text-white w-full md:w-auto">
              继续填报 <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>

        {/* Task B (Returned/Urgent) */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Left Section */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <Badge variant="outline" className="text-rose-600 border-rose-200 bg-rose-50">🔴 被退回</Badge>
              <h3 className="font-bold text-slate-800 text-lg">2026年反洗钱专项排查</h3>
            </div>
            <div className="text-sm text-slate-500">
              共 8 项指标 | 已填写 <span className="font-bold text-slate-700">8</span> 项
            </div>
          </div>

          {/* Middle Section */}
          <div className="md:w-64">
            <div className="bg-slate-50 px-4 py-2 rounded-lg border border-slate-200 text-sm">
              <div className="text-slate-500 mb-1">填报截止时间</div>
              <div className="font-bold text-slate-800">
                2026-05-10 12:00
                <span className="text-rose-600 ml-2">(剩余 2 天)</span>
              </div>
            </div>
          </div>

          {/* Right Section */}
          <div className="md:w-48 flex justify-end">
            <Button onClick={() => onEnterTask('task-b')} variant="destructive" className="w-full md:w-auto">
              修改并重新提交 <AlertCircle className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>

        {/* Task C (Pending Start) */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Left Section */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <Badge variant="outline" className="text-slate-500 border-slate-200 bg-slate-50">⚪ 待启动</Badge>
              <h3 className="font-bold text-slate-800 text-lg">2026年上半年度从业人员考核</h3>
            </div>
            <div className="text-sm text-slate-500">
              共 10 项指标 | 已填写 <span className="font-bold text-slate-700">0</span> 项
            </div>
          </div>

          {/* Middle Section */}
          <div className="md:w-64">
            <div className="bg-slate-50 px-4 py-2 rounded-lg border border-slate-200 text-sm">
              <div className="text-slate-500 mb-1">填报截止时间</div>
              <div className="font-bold text-slate-800">
                2026-06-30 18:00
                <span className="text-slate-500 ml-2">(剩余 53 天)</span>
              </div>
            </div>
          </div>

          {/* Right Section */}
          <div className="md:w-48 flex justify-end">
            <Button onClick={() => onEnterTask('task-c')} variant="outline" className="border-blue-600 text-blue-600 hover:bg-blue-50 w-full md:w-auto">
              开始填报 <Play className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
