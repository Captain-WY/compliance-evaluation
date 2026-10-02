import React, { useEffect, useState } from 'react';
import { Users, Star, Plus, Search, LayoutGrid, List as ListIcon } from 'lucide-react';
import Button from '../../components/ui/Button';
import VendorDetailDrawer from './VendorDetailDrawer';
import VendorForm from './VendorForm';
import { listVendors, type VendorRecord } from '../../services/case';

interface VendorListProps {
  onSelect?: (vendor: VendorRecord) => void;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  BACKUP: 'bg-amber-50 text-amber-700 border-amber-200',
  BLACKLISTED: 'bg-red-50 text-red-700 border-red-200',
};

const VendorList: React.FC<VendorListProps> = ({ onSelect }) => {
  const [vendors, setVendors] = useState<VendorRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedFirmId, setSelectedFirmId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'GRID' | 'LIST'>('LIST');
  const [isCreating, setIsCreating] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [filterStatus]);

  const load = async () => {
    setLoading(true);
    const result = await listVendors({
      keyword: searchQuery || null,
      cooperationStatus: filterStatus,
      pageSize: 100,
    });
    setVendors(result.items);
    setTotal(result.total);
    setLoading(false);
  };

  const handleSearch = () => load();

  const filteredVendors = vendors.filter(v =>
    !searchQuery ||
    v.firmName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleVendorClick = (vendor: VendorRecord) => {
    if (onSelect) {
      onSelect(vendor);
    } else {
      setSelectedFirmId(vendor.firmId);
    }
  };

  const handleCreateSuccess = () => {
    setIsCreating(false);
    load();
  };

  if (isCreating) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 bg-white shrink-0">
          <h2 className="text-xl font-bold text-slate-800">新建律所档案</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <VendorForm
            mode="CREATE"
            onSave={handleCreateSuccess}
            onCancel={() => setIsCreating(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-slate-200 bg-white shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-800">律所库</h1>
          <p className="text-sm text-slate-500 mt-0.5">共 {total} 家合作律所</p>
        </div>
        <Button onClick={() => setIsCreating(true)}>
          <Plus className="w-4 h-4 mr-1" /> 新增律所
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex gap-3 px-6 py-3 bg-white border-b border-slate-100 shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
            placeholder="搜索律所名称..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
        </div>

        <select
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 focus:ring-2 focus:ring-brand-500 outline-none"
          value={filterStatus ?? ''}
          onChange={e => setFilterStatus(e.target.value || null)}
        >
          <option value="">全部状态</option>
          <option value="ACTIVE">合作中</option>
          <option value="BACKUP">候选库</option>
          <option value="BLACKLISTED">黑名单</option>
        </select>

        <div className="flex border border-slate-200 rounded-lg overflow-hidden ml-auto">
          <button
            onClick={() => setViewMode('LIST')}
            className={`p-2 ${viewMode === 'LIST' ? 'bg-brand-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
          >
            <ListIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('GRID')}
            className={`p-2 ${viewMode === 'GRID' ? 'bg-brand-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-400">加载中...</div>
        ) : filteredVendors.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400">
            <Users className="w-12 h-12 mb-3 text-slate-200" />
            <p>暂无律所数据</p>
          </div>
        ) : viewMode === 'LIST' ? (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">律所名称</th>
                  <th className="px-4 py-3 text-left">合作状态</th>
                  <th className="px-4 py-3 text-left">评级</th>
                  <th className="px-4 py-3 text-right">在职律师</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredVendors.map(v => (
                  <tr
                    key={v.firmId}
                    onClick={() => handleVendorClick(v)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-brand-100 rounded-lg flex items-center justify-center text-sm font-bold text-brand-600 shrink-0">
                          {v.firmName.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">{v.firmName}</p>
                          {v.unifiedSocialCreditCode && (
                            <p className="text-xs text-slate-400">{v.unifiedSocialCreditCode}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded border font-medium ${STATUS_COLORS[v.cooperationStatus] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                        {v.cooperationStatusName}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {v.ratingLevelName ? (
                        <span className="flex items-center gap-1 text-amber-600">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          {v.ratingLevelName}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700 font-medium">{v.activeLawyerCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredVendors.map(v => (
              <div
                key={v.firmId}
                onClick={() => handleVendorClick(v)}
                className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md hover:border-brand-300 cursor-pointer transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center text-base font-bold text-brand-600">
                    {v.firmName.charAt(0)}
                  </div>
                  <span className={`px-2 py-0.5 text-xs rounded border font-medium ${STATUS_COLORS[v.cooperationStatus] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                    {v.cooperationStatusName}
                  </span>
                </div>
                <h3 className="font-semibold text-slate-800 text-sm leading-snug">{v.firmName}</h3>
                <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                  <span>{v.activeLawyerCount} 位律师</span>
                  {v.ratingLevelName && (
                    <>
                      <span className="w-px h-3 bg-slate-200" />
                      <span className="text-amber-600 flex items-center gap-0.5">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />{v.ratingLevelName}
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <VendorDetailDrawer
        firmId={selectedFirmId}
        isOpen={!!selectedFirmId}
        onClose={() => setSelectedFirmId(null)}
        onRefresh={load}
      />
    </div>
  );
};

export default VendorList;
