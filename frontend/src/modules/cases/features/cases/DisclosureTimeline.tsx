
import React, { useEffect, useState } from 'react';
import { getComplianceDisclosures, type HistoricalDisclosure } from '../../services/case';
import { Megaphone, FileText, CheckCircle2, AlertTriangle } from 'lucide-react';

interface DisclosureTimelineProps {
  caseId: string;
}

const MATERIAL_TYPE_STYLE: Record<string, string> = {
  '临时公告': 'bg-red-50 text-red-600 border-red-100',
  '重大事项专报': 'bg-orange-50 text-orange-600 border-orange-100',
};

const getMaterialTypeStyle = (type: string): string =>
  MATERIAL_TYPE_STYLE[type] ?? 'bg-blue-50 text-blue-600 border-blue-100';

const DisclosureTimeline: React.FC<DisclosureTimelineProps> = ({ caseId }) => {
  const [items, setItems] = useState<HistoricalDisclosure[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggered, setTriggered] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const result = await getComplianceDisclosures(caseId);
        setTriggered(result.disclosureTriggered);
        setReason(result.disclosureReason);
        setItems(result.items);
      } catch {
        // apiClient 拦截器已 toast.error
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [caseId]);

  if (loading) return <div className="text-slate-400 text-xs p-4">加载披露历史...</div>;

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-5">
      <div className="mb-4">
        <h4 className="font-bold text-slate-800 flex items-center gap-2 mb-3">
          <Megaphone className="w-5 h-5 text-brand-600" /> 对外披露历史
        </h4>

        {/* 信披义务触发状态 */}
        <div className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
          triggered
            ? 'bg-red-50 border-red-200 text-red-700'
            : 'bg-slate-100 border-slate-200 text-slate-500'
        }`}>
          {triggered
            ? <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            : <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-500" />}
          <span>
            {triggered
              ? `触发信披义务${reason ? `：${reason}` : ''}`
              : '当前未触发信息披露义务'}
          </span>
        </div>
      </div>

      <div className="relative border-l-2 border-slate-200 ml-3 space-y-6 pl-6 py-2">
        {items.length === 0 ? (
          <p className="text-sm text-slate-400">暂无对外披露记录</p>
        ) : (
          items.map(item => (
            <div key={item.id} className="relative">
              <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full bg-white border-2 border-brand-500 z-10" />
              <div className="bg-white border border-slate-200 p-3 rounded-lg hover:border-brand-300 transition-colors shadow-sm">
                <div className="flex justify-between items-start mb-1">
                  <span className="text-xs font-mono text-slate-400">
                    {item.disclosureDate ?? '—'}
                  </span>
                  {item.materialType && (
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${getMaterialTypeStyle(item.materialType)}`}>
                      {item.materialType}
                    </span>
                  )}
                </div>
                {item.reportingPeriod && (
                  <p className="text-xs text-slate-600 mb-2 leading-relaxed">
                    {item.reportingPeriod}
                  </p>
                )}
                <div className="flex items-center justify-end text-xs border-t border-slate-50 pt-2">
                  <span className="flex items-center gap-1 text-emerald-600 font-medium">
                    <FileText className="w-3 h-3" />
                    {item.disclosureStatusName ?? item.disclosureStatus}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default DisclosureTimeline;
