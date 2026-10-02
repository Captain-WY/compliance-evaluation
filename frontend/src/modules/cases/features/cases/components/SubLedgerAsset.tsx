import React, { useEffect, useState } from 'react';
import { listPreservations, type AssetPreservationRecord } from '../../../services/case';
import { Shield, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

interface SubLedgerAssetProps {
  caseId: string;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(amount);
};

const SubLedgerAsset: React.FC<SubLedgerAssetProps> = ({ caseId }) => {
  const [records, setRecords] = useState<AssetPreservationRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    listPreservations(caseId).then(data => {
      setRecords(data);
    }).finally(() => setLoading(false));
  }, [caseId]);

  if (loading) return <div className="p-4 text-center text-slate-400 text-xs">加载财产保全记录...</div>;

  const totalValuation = records.filter(r => r.effectiveStatus === 'ACTIVE').reduce((sum, r) => sum + r.estimatedValue, 0);
  const expiringSoonCount = records.filter(r => r.isExpiringSoon).length;

  const getStatusBadge = (status: string, statusName: string) => {
    switch (status) {
      case 'ACTIVE':
        return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100"><CheckCircle className="w-3 h-3" /> {statusName || '保全中'}</span>;
      case 'RELEASED':
        return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">{statusName || '已解除'}</span>;
      case 'REALIZED':
        return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100"><Clock className="w-3 h-3" /> {statusName || '已变现'}</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-100">{statusName || status}</span>;
    }
  };

  return (
    <div className="space-y-6 relative">
      {records.length === 0 ? (
        <div className="p-8 text-center border-2 border-dashed border-slate-100 rounded-lg bg-slate-50">
          <Shield className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">暂无财产保全记录</p>
        </div>
      ) : (
        <>
          {/* Summary Bar */}
          <div className="flex gap-4 mb-2">
            <div className="flex-1 bg-emerald-50 border border-emerald-100 p-3 rounded-lg flex items-center justify-between">
              <span className="text-xs text-emerald-700 font-medium">已查封资产总估值</span>
              <span className="text-lg font-bold text-emerald-800 font-mono">{formatCurrency(totalValuation)}</span>
            </div>
            {expiringSoonCount > 0 && (
              <div className="flex-1 bg-amber-50 border border-amber-100 p-3 rounded-lg flex items-center justify-between">
                <span className="text-xs text-amber-700 font-medium flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> 30天内到期保全
                </span>
                <span className="text-lg font-bold text-amber-800 font-mono">{expiringSoonCount}</span>
              </div>
            )}
          </div>

          {/* Ledger Table */}
          <div className="overflow-hidden border border-slate-200 rounded-lg shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 font-medium text-slate-600">查控措施类别</th>
                  <th className="px-3 py-2 font-medium text-slate-600">财产类别</th>
                  <th className="px-3 py-2 font-medium text-slate-600 w-1/4">财产线索详细信息</th>
                  <th className="px-3 py-2 font-medium text-slate-600 text-right">预估残值/冻结金额</th>
                  <th className="px-3 py-2 font-medium text-slate-600">查封起始日</th>
                  <th className="px-3 py-2 font-medium text-slate-600 text-red-600 font-bold">查封到期日(重要)</th>
                  <th className="px-3 py-2 font-medium text-slate-600">状态</th>
                  <th className="px-3 py-2 font-medium text-slate-600">执行法院/裁定书</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {records.map(record => {
                  const isExpired = record.daysUntilExpiry <= 0 && record.effectiveStatus === 'ACTIVE';
                  return (
                    <tr key={record.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-600 font-medium">{record.preservationTypeName}</td>
                      <td className="px-3 py-2 text-slate-600">{record.assetTypeName}</td>
                      <td className="px-3 py-2 text-slate-800 font-medium truncate max-w-xs" title={record.assetName}>
                        {record.assetName}
                      </td>
                      <td className="px-3 py-2 text-slate-900 font-mono text-right">
                        ¥{(record.estimatedValue / 10000).toFixed(2)}万
                      </td>
                      <td className="px-3 py-2 text-slate-600 font-mono">{record.startDate || '-'}</td>
                      <td className={`px-3 py-2 font-mono font-bold ${isExpired ? 'text-red-600 bg-red-50' : record.isExpiringSoon ? 'text-amber-600 bg-amber-50' : 'text-slate-600'}`}>
                        {record.expireDate || '-'}
                        {record.isExpiringSoon && <span className="ml-1 text-[10px] bg-amber-100 text-amber-700 px-1 rounded">即将到期</span>}
                        {isExpired && <span className="ml-1 text-[10px] bg-red-100 text-red-700 px-1 rounded">已过期</span>}
                      </td>
                      <td className="px-3 py-2">
                        {getStatusBadge(record.effectiveStatus, record.effectiveStatusName)}
                      </td>
                      <td className="px-3 py-2 text-slate-500 text-[10px]">
                        <div>{record.executionCourt || '-'}</div>
                        <div className="font-mono text-slate-400">{record.ownerPartyName || '-'}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default SubLedgerAsset;
