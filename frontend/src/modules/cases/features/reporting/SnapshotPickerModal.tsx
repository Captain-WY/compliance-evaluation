
import React, { useEffect, useState } from 'react';
import { DataSnapshot } from '../../types';
import { getSnapshots } from '../../services/mock/reporting';
import { Camera, Lock, Calendar, CheckCircle2, X } from 'lucide-react';
import Button from '../../components/ui/Button';

interface SnapshotPickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (snapshotId: string) => void;
    title?: string;
}

const SnapshotPickerModal: React.FC<SnapshotPickerModalProps> = ({ isOpen, onClose, onConfirm, title = "选择数据源" }) => {
    const [snapshots, setSnapshots] = useState<DataSnapshot[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isOpen) {
            setLoading(true);
            getSnapshots().then(data => {
                setSnapshots(data);
                // Auto-select latest locked one
                const latest = data.find(s => s.status === 'LOCKED');
                if (latest) setSelectedId(latest.id);
                setLoading(false);
            });
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[80] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-xl shadow-xl w-[500px] flex flex-col overflow-hidden max-h-[80vh]">
                <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <Camera className="w-5 h-5 text-brand-600" /> {title}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
                </div>

                <div className="p-4 bg-blue-50 border-b border-blue-100 text-xs text-blue-700">
                    为了保证汇报数据的严谨性与一致性，请选择一个已锁定的数据快照作为报表生成的依据。
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    {loading ? (
                        <div className="text-center py-8 text-slate-400">加载快照列表...</div>
                    ) : snapshots.length === 0 ? (
                        <div className="text-center py-8 text-slate-400">暂无可用快照，请先在“数据快照”模块创建。</div>
                    ) : (
                        <div className="space-y-2">
                            {snapshots.map(snap => (
                                <div 
                                    key={snap.id}
                                    onClick={() => setSelectedId(snap.id)}
                                    className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${
                                        selectedId === snap.id 
                                        ? 'bg-brand-50 border-brand-500 ring-1 ring-brand-500' 
                                        : 'bg-white border-slate-200 hover:border-brand-300'
                                    }`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className={`mt-1 ${selectedId === snap.id ? 'text-brand-600' : 'text-slate-400'}`}>
                                            {selectedId === snap.id ? <CheckCircle2 className="w-5 h-5"/> : <Lock className="w-5 h-5"/>}
                                        </div>
                                        <div>
                                            <h4 className={`font-bold text-sm ${selectedId === snap.id ? 'text-brand-900' : 'text-slate-700'}`}>
                                                {snap.name}
                                            </h4>
                                            <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                                                <span className="flex items-center gap-1"><Calendar className="w-3 h-3"/> 锁定日: {snap.lockDate}</span>
                                                <span className="font-mono bg-slate-100 px-1 rounded">{snap.caseCount} 案件</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                            snap.status === 'LOCKED' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                                        }`}>
                                            {snap.status}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
                    <Button variant="ghost" onClick={onClose}>取消</Button>
                    <Button onClick={() => selectedId && onConfirm(selectedId)} disabled={!selectedId}>
                        确认使用此快照
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default SnapshotPickerModal;
