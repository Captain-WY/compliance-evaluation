
import React, { useState, useMemo } from 'react';
import { Case, RiskLevel, CaseStage } from '../../types';
import { Search, Filter, ArrowUpDown, CheckSquare, Square, X, Plus } from 'lucide-react';
import Button from '../../components/ui/Button';

interface CaseSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    cases: Case[];
    onConfirm: (selectedIds: string[]) => void;
}

const CaseSelectionModal: React.FC<CaseSelectionModalProps> = ({ isOpen, onClose, cases, onConfirm }) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [riskFilter, setRiskFilter] = useState<string>('ALL');
    const [sortOrder, setSortOrder] = useState<'DESC' | 'ASC'>('DESC'); // Amount sort

    // Filter & Sort Logic
    // MOVED UP: Hooks must be executed unconditionally
    const filteredCases = useMemo(() => {
        let result = cases.filter(c => c.stage !== CaseStage.CLOSED); // Only active cases usually

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(c => 
                c.title.toLowerCase().includes(q) || 
                c.code.toLowerCase().includes(q) ||
                c.plaintiff.includes(searchQuery)
            );
        }

        if (riskFilter !== 'ALL') {
            result = result.filter(c => c.riskLevel === riskFilter);
        }

        return result.sort((a, b) => {
            const amtA = a.regulatoryAttrs?.amountNoInterest || 0;
            const amtB = b.regulatoryAttrs?.amountNoInterest || 0;
            return sortOrder === 'DESC' ? amtB - amtA : amtA - amtB;
        });
    }, [cases, searchQuery, riskFilter, sortOrder]);

    const totalSelectedAmount = useMemo(() => {
        return cases
            .filter(c => selectedIds.has(c.id))
            .reduce((sum, c) => sum + (c.regulatoryAttrs?.amountNoInterest || 0), 0);
    }, [selectedIds, cases]);

    // Early return AFTER all hooks are called
    if (!isOpen) return null;

    // Handlers
    const toggleSelect = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredCases.length) {
            setSelectedIds(new Set());
        } else {
            const newSet = new Set(filteredCases.map(c => c.id));
            setSelectedIds(newSet);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-[800px] max-h-[85vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                    <div>
                        <h3 className="font-bold text-slate-800 text-lg">创建专项汇报 - 选择案件</h3>
                        <p className="text-xs text-slate-500 mt-1">请勾选需要纳入本次专项汇报的案件范围。</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-200">
                        <X className="w-5 h-5"/>
                    </button>
                </div>

                {/* Toolbar */}
                <div className="p-4 border-b border-slate-100 flex gap-3 bg-white">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="搜索案号、标题、当事人..." 
                            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <select 
                        className="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                        value={riskFilter}
                        onChange={e => setRiskFilter(e.target.value)}
                    >
                        <option value="ALL">全部风险</option>
                        {Object.values(RiskLevel).map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <button 
                        onClick={() => setSortOrder(prev => prev === 'DESC' ? 'ASC' : 'DESC')}
                        className="flex items-center gap-1 text-xs font-medium px-3 py-2 border border-slate-200 rounded-lg hover:bg-slate-50"
                    >
                        <ArrowUpDown className="w-3 h-3" /> 金额{sortOrder === 'DESC' ? '降序' : '升序'}
                    </button>
                </div>

                {/* List Header */}
                <div className="bg-slate-50/80 px-4 py-2 flex items-center text-xs font-bold text-slate-500 border-b border-slate-100">
                    <div className="w-10 text-center cursor-pointer" onClick={toggleSelectAll}>
                        {selectedIds.size > 0 && selectedIds.size === filteredCases.length ? <CheckSquare className="w-4 h-4 text-indigo-600"/> : <Square className="w-4 h-4"/>}
                    </div>
                    <div className="flex-1 pl-2">案件信息</div>
                    <div className="w-24 text-center">风险等级</div>
                    <div className="w-32 text-right pr-4">涉案金额</div>
                </div>

                {/* List Body */}
                <div className="flex-1 overflow-y-auto p-0">
                    {filteredCases.length === 0 ? (
                        <div className="p-12 text-center text-slate-400">未找到匹配案件</div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {filteredCases.map(c => (
                                <div 
                                    key={c.id} 
                                    onClick={() => toggleSelect(c.id)}
                                    className={`flex items-center px-4 py-3 hover:bg-indigo-50/50 cursor-pointer transition-colors ${selectedIds.has(c.id) ? 'bg-indigo-50' : ''}`}
                                >
                                    <div className="w-10 text-center">
                                        {selectedIds.has(c.id) ? <CheckSquare className="w-4 h-4 text-indigo-600"/> : <Square className="w-4 h-4 text-slate-300"/>}
                                    </div>
                                    <div className="flex-1 pl-2 min-w-0">
                                        <div className="font-bold text-slate-800 text-sm truncate">{c.title}</div>
                                        <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                                            <span className="bg-slate-100 px-1 rounded font-mono">{c.code}</span>
                                            <span>{c.stage}</span>
                                        </div>
                                    </div>
                                    <div className="w-24 text-center">
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                                            c.riskLevel === '特大' ? 'bg-red-50 text-red-600 border-red-100' :
                                            c.riskLevel === '重大' ? 'bg-orange-50 text-orange-600 border-orange-100' :
                                            'bg-slate-100 text-slate-500 border-slate-200'
                                        }`}>
                                            {c.riskLevel}
                                        </span>
                                    </div>
                                    <div className="w-32 text-right pr-4 font-mono text-sm text-slate-700">
                                        ¥{((c.regulatoryAttrs?.amountNoInterest || 0)/10000).toFixed(0)}万
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center">
                    <div className="text-sm text-slate-600">
                        已选 <span className="font-bold text-indigo-600">{selectedIds.size}</span> 个案件，
                        总金额 <span className="font-bold text-indigo-600">¥{(totalSelectedAmount/10000).toFixed(0)}万</span>
                    </div>
                    <div className="flex gap-3">
                        <Button variant="ghost" onClick={onClose}>取消</Button>
                        <Button disabled={selectedIds.size === 0} onClick={() => onConfirm(Array.from(selectedIds))}>
                            下一步：生成报告预览
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CaseSelectionModal;
