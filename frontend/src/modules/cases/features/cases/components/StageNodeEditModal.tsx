import React, { useState, useEffect } from 'react';
import { X, Calendar, FileText, DollarSign, User, Gavel, Scale } from 'lucide-react';
import Button from '../../../components/ui/Button';

interface StageNodeEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodeKey: string;
  stageType: 'PRE_LITIGATION' | 'TRIAL';
  initialData?: any;
  onSave: (data: any) => void;
}

const StageNodeEditModal: React.FC<StageNodeEditModalProps> = ({ 
  isOpen, onClose, nodeKey, stageType, initialData, onSave 
}) => {
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    if (isOpen) {
      setFormData(initialData || {});
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const getNodeTitle = () => {
    const map: Record<string, string> = {
      'mediation': '诉前调解',
      'preservation': '财产保全',
      'filing': '立案信息',
      'evidence': '举证质证',
      'hearing': '开庭审理',
      'judgment': '裁判文书'
    };
    return map[nodeKey] || '节点详情';
  };

  const renderFormFields = () => {
    // --- PRE-LITIGATION ---
    if (stageType === 'PRE_LITIGATION') {
      if (nodeKey === 'mediation') {
        return (
          <>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">调解状态</label>
              <select 
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={formData.status || ''}
                onChange={e => setFormData({...formData, status: e.target.value})}
              >
                <option value="未开始">未开始</option>
                <option value="进行中">进行中</option>
                <option value="成功">成功</option>
                <option value="失败">失败</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">调解员/机构</label>
              <input 
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={formData.mediator || ''}
                onChange={e => setFormData({...formData, mediator: e.target.value})}
                placeholder="例如: 张调解员 (金融法院调解中心)"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">开始日期</label>
              <input 
                type="date"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={formData.date || ''}
                onChange={e => setFormData({...formData, date: e.target.value})}
              />
            </div>
          </>
        );
      }
      if (nodeKey === 'preservation') {
        return (
          <>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">保全状态</label>
              <select 
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={formData.status || ''}
                onChange={e => setFormData({...formData, status: e.target.value})}
              >
                <option value="未申请">未申请</option>
                <option value="已申请">已申请</option>
                <option value="已裁定">已裁定</option>
                <option value="已保全">已保全</option>
                <option value="驳回">驳回</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">保全金额 (元)</label>
              <input 
                type="number"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={formData.amount || ''}
                onChange={e => setFormData({...formData, amount: Number(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">裁定书文号</label>
              <input 
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={formData.rulingNo || ''}
                onChange={e => setFormData({...formData, rulingNo: e.target.value})}
              />
            </div>
          </>
        );
      }
    }

    // --- TRIAL PHASE ---
    if (stageType === 'TRIAL') {
      if (nodeKey === 'filing') {
        return (
          <>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">立案日期</label>
              <input 
                type="date"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={formData.date || ''}
                onChange={e => setFormData({...formData, date: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">案号</label>
              <input 
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={formData.caseNo || ''}
                onChange={e => setFormData({...formData, caseNo: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">承办法官</label>
              <input 
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={formData.judge || ''}
                onChange={e => setFormData({...formData, judge: e.target.value})}
              />
            </div>
          </>
        );
      }
      if (nodeKey === 'evidence') {
        return (
          <>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">举证截止日</label>
              <input 
                type="date"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={formData.deadline || ''}
                onChange={e => setFormData({...formData, deadline: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">状态</label>
              <select 
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={formData.status || ''}
                onChange={e => setFormData({...formData, status: e.target.value})}
              >
                <option value="未提交">未提交</option>
                <option value="部分提交">部分提交</option>
                <option value="已提交">已提交</option>
                <option value="质证完成">质证完成</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-500 mb-1">证据清单</label>
              <textarea 
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm h-20 resize-none"
                value={formData.evidenceList || ''}
                onChange={e => setFormData({...formData, evidenceList: e.target.value})}
                placeholder="例如: 1. 借款合同; 2. 转账记录..."
              />
            </div>
          </>
        );
      }
      if (nodeKey === 'hearing') {
        return (
          <>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">开庭日期</label>
              <input 
                type="date"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={formData.date || ''}
                onChange={e => setFormData({...formData, date: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">状态</label>
              <select 
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={formData.status || ''}
                onChange={e => setFormData({...formData, status: e.target.value})}
              >
                <option value="待开庭">待开庭</option>
                <option value="已开庭">已开庭</option>
                <option value="延期">延期</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">出庭律师</label>
              <input 
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={formData.lawyer || ''}
                onChange={e => setFormData({...formData, lawyer: e.target.value})}
                placeholder="例如: 王律师"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-500 mb-1">争议焦点</label>
              <textarea 
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm h-20 resize-none"
                value={formData.disputeFocus || ''}
                onChange={e => setFormData({...formData, disputeFocus: e.target.value})}
                placeholder="本案核心争议点..."
              />
            </div>
          </>
        );
      }
      if (nodeKey === 'judgment') {
        return (
          <>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">裁判结果</label>
              <select 
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={formData.result || ''}
                onChange={e => setFormData({...formData, result: e.target.value})}
              >
                <option value="">请选择...</option>
                <option value="胜诉">胜诉</option>
                <option value="败诉">败诉</option>
                <option value="部分胜诉">部分胜诉</option>
                <option value="发回重审">发回重审</option>
                <option value="和解">和解</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">接收日期</label>
              <input 
                type="date"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={formData.date || ''}
                onChange={e => setFormData({...formData, date: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">文书状态</label>
              <select 
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={formData.documentStatus || ''}
                onChange={e => setFormData({...formData, documentStatus: e.target.value})}
              >
                <option value="未接收">未接收</option>
                <option value="已接收">已接收</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">生效日期</label>
              <input 
                type="date"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={formData.effectiveDate || ''}
                onChange={e => setFormData({...formData, effectiveDate: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">判决金额 (元)</label>
              <input 
                type="number"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={formData.amount || ''}
                onChange={e => setFormData({...formData, amount: Number(e.target.value)})}
              />
            </div>
          </>
        );
      }
    }

    return <div className="text-slate-400 text-sm">暂无配置项</div>;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-xl shadow-xl w-[400px] overflow-hidden border border-slate-200">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-brand-600" /> {getNodeTitle()}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          {renderFormFields()}
          
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">备注说明</label>
            <textarea 
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm h-20 resize-none"
              value={formData.notes || formData.note || ''}
              onChange={e => setFormData({...formData, notes: e.target.value})}
              placeholder="填写补充信息..."
            />
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button onClick={() => onSave(formData)}>保存更新</Button>
        </div>
      </div>
    </div>
  );
};

export default StageNodeEditModal;
