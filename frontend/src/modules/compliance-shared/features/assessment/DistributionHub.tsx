import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Send, CheckCircle2, AlertTriangle, XCircle, Search, 
  CheckSquare, Square, Activity,
  Users, Building2, X, Network, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { assessmentApi, systemApi } from '../../services/api';
import type { AssessmentScheme } from '../../types';

interface DispatchTarget {
  branchId: string;
  branchName: string;
  region: string;
  rating: string;
}

interface OrgNode {
  id: string;
  name: string;
  type: 'root' | 'dept' | 'branch' | 'sub-branch';
  children?: OrgNode[];
}

const flattenDispatchTargets = (node: OrgNode, parentName = ''): DispatchTarget[] => {
  const children = node.children ?? [];
  const self = node.type !== 'root' && node.type !== 'dept'
    ? [{
        branchId: node.id,
        branchName: node.name,
        region: parentName || node.name,
        rating: node.type === 'branch' ? 'A类' : 'B类',
      }]
    : [];
  return [...self, ...children.flatMap(child => flattenDispatchTargets(child, node.name))];
};

const orgLevelMap: Record<string, string> = {
  hq: "条线总部",
  regional: "分公司",
  branch: "营业部"
};

const parentOrgMap: Record<string, string> = {
  all: "全部上级辖区",
  sh: "上海分公司",
  sz: "深圳分公司"
};

export default function DistributionHub({ initialSchemeId = '', onClose }: { initialSchemeId?: string, onClose?: () => void }) {
  const [schemes, setSchemes] = useState<AssessmentScheme[]>([]);
  const [branches, setBranches] = useState<DispatchTarget[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedSchemeId, setSelectedSchemeId] = useState<string>(initialSchemeId);
  const [assignmentType] = useState<'FORMAL' | 'TEMPORARY'>('FORMAL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [level, setLevel] = useState('branch');
  const [parent, setParent] = useState('all');
  const [dispatchedCycleId, setDispatchedCycleId] = useState<string | null>(null);
  
  const [isScanning, setIsScanning] = useState(false);
  const [isDistributing, setIsDistributing] = useState(false);
  const [scanResults, setScanResults] = useState<Record<string, { status: 'OK' | 'WARNING' | 'ERROR', message: string }>>({});
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const selectedScheme = schemes.find(s => s.id === selectedSchemeId);
  const eligibleTargetIds = useMemo(
    () => new Set(selectedScheme?.targetOrgIds ?? []),
    [selectedScheme?.targetOrgIds]
  );
  const dispatchableBranches = useMemo(
    () => eligibleTargetIds.size
      ? branches.filter(branch => eligibleTargetIds.has(branch.branchId))
      : branches,
    [branches, eligibleTargetIds]
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    Promise.all([assessmentApi.getSchemes(), systemApi.getOrgTree()])
      .then(([schemeList, orgTree]) => {
        if (cancelled) return;
        const nextSchemes = schemeList.filter(scheme => scheme.status === 'ACTIVE');
        const nextBranches = flattenDispatchTargets(orgTree);
        setSchemes(nextSchemes);
        setBranches(nextBranches);
        const selectedNextScheme = nextSchemes.find(scheme => scheme.id === selectedSchemeId)
          ?? nextSchemes[0];
        setSelectedSchemeId(previous =>
          nextSchemes.some(scheme => scheme.id === previous)
            ? previous
            : nextSchemes[0]?.id ?? ''
        );
        const firstTargetIds = new Set(selectedNextScheme?.targetOrgIds ?? []);
        const eligibleBranches = firstTargetIds.size
          ? nextBranches.filter(branch => firstTargetIds.has(branch.branchId))
          : nextBranches;
        setSelectedBranches(prev => {
          const retained = prev.filter(id => eligibleBranches.some(branch => branch.branchId === id));
          return retained.length ? retained : eligibleBranches.slice(0, 1).map(branch => branch.branchId);
        });
      })
      .catch(error => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : '下发基础数据加载失败');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSchemeId]);

  useEffect(() => {
    setSelectedBranches(prev => {
      const retained = prev.filter(id => dispatchableBranches.some(branch => branch.branchId === id));
      return retained.length ? retained : dispatchableBranches.slice(0, 1).map(branch => branch.branchId);
    });
  }, [dispatchableBranches]);

  // Filter branches
  const filteredBranches = dispatchableBranches.filter(b => {
    const matchesSearch = b.branchName.includes(searchQuery);
    return matchesSearch;
  });

  // Handle Select All
  const handleSelectAll = () => {
    if (selectedBranches.length === filteredBranches.length) {
      setSelectedBranches([]);
    } else {
      setSelectedBranches(filteredBranches.map(b => b.branchId));
    }
  };

  const toggleBranch = (id: string) => {
    setSelectedBranches(prev => 
      prev.includes(id) ? prev.filter(bId => bId !== id) : [...prev, id]
    );
  };

  // Simulate AI Scanning
  useEffect(() => {
    if (selectedBranches.length === 0 || !selectedSchemeId) {
      setScanResults({});
      return;
    }

    setIsScanning(true);
    setScanResults({});

    const timer = setTimeout(() => {
      const results: Record<string, { status: 'OK' | 'WARNING' | 'ERROR', message: string }> = {};
      
      selectedBranches.forEach(id => {
        const branch = branches.find(b => b.branchId === id);
        // Mock logic for conflicts
        if (id.endsWith('001')) {
          results[id] = { status: 'WARNING', message: `${branch?.branchName} 在此期间已关联《财富管理专项考核》，建议合并方案或调整周期。` };
        } else {
          results[id] = { status: 'OK', message: '状态正常：当前无重合考核任务。' };
        }
      });

      setScanResults(results);
      setIsScanning(false);
    }, 1500); // 1.5s simulated delay

    return () => clearTimeout(timer);
  }, [selectedBranches, selectedSchemeId, assignmentType]);

  const hasErrors = assignmentType === 'FORMAL' && Object.values(scanResults).some((r: any) => r.status === 'ERROR');
  const canDistribute = selectedSchemeId && selectedBranches.length > 0 && (!isScanning || assignmentType === 'TEMPORARY') && !hasErrors && !isDistributing;

  const handleDistribute = async () => {
    if (!canDistribute) return;
    setIsDistributing(true);
    try {
      const runId = Date.now();
      const cycle = await assessmentApi.createCycle({
        cycleCode: `WLZQ-ACYC-FE-${runId}`,
        cycleName: `${selectedScheme?.title ?? '考核方案'} 下发 ${runId}`,
        schemeId: selectedSchemeId,
        year: new Date().getFullYear(),
        periodStart: `${new Date().getFullYear()}-01-01`,
        periodEnd: `${new Date().getFullYear()}-12-31`,
        dispatchMode: 'MANUAL',
        targetOrgIds: selectedBranches,
      });
      const cycleId = cycle.cycleId ?? cycle.id;
      const dispatched = await assessmentApi.dispatchCycle(cycleId, {
        targetOrgIds: selectedBranches,
        message: '请按期完成本次合规考核填报。',
      });
      setDispatchedCycleId(dispatched.cycleId ?? cycleId);
      setShowSuccessModal(true);
    } catch (error) {
      toast.error('下发失败', { description: error instanceof Error ? error.message : '请稍后重试' });
    } finally {
      setIsDistributing(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 font-sans relative">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0 z-10 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center">
              <Send className="w-6 h-6 mr-2 text-indigo-600" />
              考核方案下发中心 (Distribution Hub)
            </h1>
            <p className="text-sm text-slate-500 mt-1">核对方案信息，配置目标机构范围并启动智能冲突检测。</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              data-testid="p1-cycle-publish-btn"
              onClick={handleDistribute}
              disabled={!canDistribute}
              className={`flex items-center px-6 py-2.5 rounded-md text-sm font-bold transition-all shadow-sm ${
                canDistribute 
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-md' 
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {isDistributing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              {isDistributing ? '下发中...' : '正式发布并下发'}
            </button>
            {onClose && (
              <button 
                onClick={onClose}
                className="p-2.5 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 p-6 mx-auto h-full">
          
          <div className="lg:col-span-7 flex flex-col gap-6">
            {loadError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {loadError}
              </div>
            )}
            {isLoading && (
              <div className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500 flex items-center justify-center">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                正在加载真实方案与机构...
              </div>
            )}
            {/* Section 1: Select Scheme */}
            <div className="shrink-0">
              <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs">1</span> 
                当前下发方案
              </h3>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start justify-between">
                <div>
                  <h4 className="text-lg font-bold text-slate-900 mb-1">{selectedScheme ? selectedScheme.title : '暂无可下发方案'}</h4>
                  <p className="text-sm text-slate-500 flex items-center gap-4">
                    <span>考核周期: {selectedScheme ? selectedScheme.period : '未知'}</span>
                    <span>包含指标: {selectedScheme ? selectedScheme.items.length : 0}项</span>
                    <span>可下发机构: {dispatchableBranches.length}家</span>
                  </p>
                </div>
                <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-transparent">单次/临时考核</Badge>
              </div>
            </div>

            {/* Section 2: Target Selection */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col flex-1 min-h-0">
              <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center shrink-0 gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs">2</span> 
                配置下发范围
              </h2>
              
              <div className="space-y-4 shrink-0 mb-4">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="搜索机构名称..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                
                <div className="flex items-center gap-3 mt-3 mb-4">
                  <Select value={level} onValueChange={setLevel}>
                    <SelectTrigger className="w-[180px] bg-white text-slate-900 border-slate-200">
                      <span className="truncate">{orgLevelMap[level] || "选择机构层级"}</span>
                    </SelectTrigger>
                    <SelectContent position="popper" sideOffset={4} className="bg-white border-slate-200">
                      <SelectItem value="hq">条线总部</SelectItem>
                      <SelectItem value="regional">分公司</SelectItem>
                      <SelectItem value="branch">营业部</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={parent} onValueChange={setParent}>
                    <SelectTrigger className="w-[200px] bg-white text-slate-900 border-slate-200">
                      <span className="truncate">{parentOrgMap[parent] || "选择上级辖区"}</span>
                    </SelectTrigger>
                    <SelectContent position="popper" sideOffset={4} className="bg-white border-slate-200">
                      <SelectItem value="all">全部上级辖区</SelectItem>
                      <SelectItem value="sh">上海分公司</SelectItem>
                      <SelectItem value="sz">深圳分公司</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-200 shrink-0">
                <button 
                  onClick={handleSelectAll}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-800 flex items-center"
                >
                  {selectedBranches.length === filteredBranches.length && filteredBranches.length > 0 ? (
                    <><CheckSquare className="w-4 h-4 mr-1" /> 取消全选</>
                  ) : (
                    <><Square className="w-4 h-4 mr-1" /> 全选 ({filteredBranches.length})</>
                  )}
                </button>
                <span className="text-xs text-slate-500">已选: <strong className="text-indigo-600">{selectedBranches.length}</strong> 家机构</span>
              </div>

              <div className="flex-1 overflow-y-auto py-2 space-y-1 scrollbar-thin scrollbar-thumb-slate-200">
                {filteredBranches.map(branch => (
                  <div 
                    key={branch.branchId}
                    onClick={() => toggleBranch(branch.branchId)}
                    className={`flex items-center p-2.5 rounded-lg cursor-pointer transition-colors ${
                      selectedBranches.includes(branch.branchId) ? 'bg-indigo-50 border border-indigo-100' : 'hover:bg-slate-50 border border-transparent'
                    }`}
                  >
                    {selectedBranches.includes(branch.branchId) ? (
                      <CheckSquare className="w-5 h-5 text-indigo-600 mr-3 shrink-0" />
                    ) : (
                      <Square className="w-5 h-5 text-slate-300 mr-3 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-slate-800 truncate">{branch.branchName}</div>
                      <div className="flex items-center text-xs text-slate-400 mt-0.5 gap-1">
                        <Network className="w-3 h-3" /> 归属: {branch.region === '华南' ? '深圳分公司' : branch.region === '华北' ? '北京分公司' : '上海分公司'}
                      </div>
                    </div>
                  </div>
                ))}
                {filteredBranches.length === 0 && (
                  <div className="text-center py-10 text-slate-400 text-sm">暂无匹配的机构</div>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 h-full">
            {/* Section 3: AI Conflict Detection */}
            <div className={`rounded-xl border-2 shadow-lg p-5 flex flex-col h-full min-h-[500px] text-slate-300 relative overflow-hidden transition-all ${
              assignmentType === 'FORMAL' 
                ? 'bg-slate-900 border-indigo-500 ring-4 ring-indigo-500/20' 
                : 'bg-slate-800 border-slate-700'
            }`}>
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
              
              <h2 className="text-base font-bold text-white mb-4 flex items-center shrink-0 relative z-10">
                <span className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs mr-2 border border-indigo-500/30">3</span>
                AI 冲突检测引擎 (Live Scanning)
              </h2>

              {assignmentType === 'TEMPORARY' ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 relative z-10 p-6 text-center">
                   <div className="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center mb-4">
                     <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                   </div>
                   <h3 className="text-lg font-bold text-slate-200 mb-2">已绕过强制冲突检验</h3>
                   <p className="text-sm">当前为【临时评估】模式，允许机构同时执行多个相似目标的排查工作，AI 引擎仅作记录不拦截下发。</p>
                </div>
              ) : selectedBranches.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 relative z-10">
                  <Activity className="w-12 h-12 mb-4 opacity-20" />
                  <p>请在左侧选择下发机构以启动检测</p>
                </div>
              ) : isScanning ? (
                <div className="flex-1 flex flex-col items-center justify-center relative z-10">
                  <div className="relative w-16 h-16 mb-6">
                    <div className="absolute inset-0 border-4 border-indigo-500/30 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-indigo-500 rounded-full border-t-transparent animate-spin"></div>
                    <Activity className="absolute inset-0 m-auto w-6 h-6 text-indigo-400 animate-pulse" />
                  </div>
                  <p className="text-indigo-400 font-medium animate-pulse">正在扫描 {selectedBranches.length} 家机构的考核排期...</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-slate-700 relative z-10">
                  <AnimatePresence>
                    {selectedBranches.map((id, idx) => {
                      const result = scanResults[id];
                      if (!result) return null;
                      const branch = branches.find(b => b.branchId === id);
                      
                      return (
                        <motion.div
                          key={id}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className={`p-3 rounded-lg border ${
                            result.status === 'OK' ? 'bg-emerald-900/20 border-emerald-500/30' :
                            result.status === 'WARNING' ? 'bg-amber-900/20 border-amber-500/30' :
                            'bg-red-900/20 border-red-500/30'
                          }`}
                        >
                          <div className="flex items-start">
                            {result.status === 'OK' && <CheckCircle2 className="w-5 h-5 text-emerald-400 mr-2 shrink-0 mt-0.5" />}
                            {result.status === 'WARNING' && <AlertTriangle className="w-5 h-5 text-amber-400 mr-2 shrink-0 mt-0.5" />}
                            {result.status === 'ERROR' && <XCircle className="w-5 h-5 text-red-400 mr-2 shrink-0 mt-0.5" />}
                            
                            <div>
                              <div className="text-sm font-bold text-white mb-1">{branch?.branchName}</div>
                              <div className={`text-xs ${
                                result.status === 'OK' ? 'text-emerald-300/80' :
                                result.status === 'WARNING' ? 'text-amber-300/90' :
                                'text-red-300/90'
                              }`}>
                                {result.message}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Success Modal */}
      <AnimatePresence>
        {showSuccessModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center"
            >
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Send className="w-10 h-10 text-emerald-600 ml-1" />
              </div>
              <h2 className="text-2xl font-black text-slate-900 mb-2">方案下发成功！</h2>
              <p className="text-slate-500 mb-6">
                      《{selectedScheme?.title}》已正式发布并下发。
              </p>
              
              <div className="bg-slate-50 rounded-xl p-4 mb-8 text-left space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 flex items-center"><Building2 className="w-4 h-4 mr-2" /> 触达机构数</span>
                  <span className="font-bold text-slate-900">{selectedBranches.length} 家</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 flex items-center"><Users className="w-4 h-4 mr-2" /> 预计触达专员</span>
                  <span className="font-bold text-slate-900">{selectedBranches.length * 3} 名</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 flex items-center"><Activity className="w-4 h-4 mr-2" /> 考核周期</span>
                  <span className="font-bold text-slate-900">{dispatchedCycleId ?? selectedScheme?.period}</span>
                </div>
              </div>

              <button 
                data-testid="p1-cycle-success-close"
                onClick={() => {
                  setShowSuccessModal(false);
                  if (onClose) onClose();
                }}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors"
              >
                返回工作台
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
