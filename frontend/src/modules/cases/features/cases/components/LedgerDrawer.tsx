import React, { useState } from 'react';
import { Case } from '../../../types';
import { X, LayoutList, Clock, Wallet, Shield, MessageSquare, FileText } from 'lucide-react';
import SubLedgerProcedure from './SubLedgerProcedure';
import SubLedgerFinance from './SubLedgerFinance';
import SubLedgerAsset from './SubLedgerAsset';
import SubLedgerLog from './SubLedgerLog';

import CaseSummaryCard from './CaseSummaryCard';

interface LedgerDrawerProps {
  selectedCase: Case;
  onClose: () => void;
  onNavigateFull: (path: string) => void;
}

type TabType = 'BASIC' | 'PROCEDURE' | 'FINANCE' | 'ASSET' | 'LOG';

const LedgerDrawer: React.FC<LedgerDrawerProps> = ({ selectedCase, onClose, onNavigateFull }) => {
  const [activeTab, setActiveTab] = useState<TabType>('BASIC');

  const tabs = [
    { id: 'BASIC', label: '基本信息', icon: LayoutList },
    { id: 'PROCEDURE', label: '程序与时效', icon: Clock },
    { id: 'FINANCE', label: '费用与财务', icon: Wallet },
    { id: 'ASSET', label: '财产查控', icon: Shield },
    { id: 'LOG', label: '沟通日志', icon: MessageSquare },
  ];

  return (
    <div className="h-full flex flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-300 w-[800px] border-l border-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{selectedCase.code}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
              selectedCase.priority === '特大' ? 'bg-red-50 text-red-700 border-red-100' : 
              selectedCase.priority === '重大' ? 'bg-orange-50 text-orange-700 border-orange-100' : 
              'bg-slate-50 text-slate-600 border-slate-100'
            }`}>
              {selectedCase.priority}
            </span>
          </div>
          <h2 className="text-lg font-bold text-slate-900 truncate max-w-[600px]" title={selectedCase.title}>
            {selectedCase.title}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => onNavigateFull(`/cases/${selectedCase.id}`)}
            className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-full transition-colors"
            title="查看详情页"
          >
            <FileText className="w-5 h-5" />
          </button>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 px-6 bg-white">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id 
                ? 'border-brand-600 text-brand-600' 
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30 custom-scrollbar">
        {activeTab === 'BASIC' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Basic Info Grid */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-6">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">外部案号</label>
                <div className="text-sm text-slate-900 font-mono">{selectedCase.externalCaseNo || '-'}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">案由</label>
                <div className="text-sm text-slate-900">{selectedCase.cause}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">涉案标的</label>
                <div className="text-sm text-slate-900">{selectedCase.targetSubject || '-'}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">受理法院</label>
                <div className="text-sm text-slate-900">{selectedCase.court}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">原告/申请人</label>
                <div className="text-sm text-slate-900">{selectedCase.plaintiff}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">被告/被申请人</label>
                <div className="text-sm text-slate-900">{selectedCase.defendant}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">涉案金额</label>
                <div className="text-sm text-slate-900 font-mono font-bold">
                  ¥{new Intl.NumberFormat('zh-CN').format(selectedCase.regulatoryAttrs?.amountNoInterest || 0)}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">预计负债</label>
                <div className="text-sm text-slate-900 font-mono text-red-600 font-bold">
                  ¥{new Intl.NumberFormat('zh-CN').format(selectedCase.provisionAmount || 0)}
                </div>
              </div>
            </div>
            
            <div className="border-t border-slate-100 pt-4">
              <CaseSummaryCard caseData={selectedCase} />
            </div>
          </div>
        )}

        {activeTab === 'PROCEDURE' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <SubLedgerProcedure caseId={selectedCase.id} />
          </div>
        )}

        {activeTab === 'FINANCE' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <SubLedgerFinance caseId={selectedCase.id} />
          </div>
        )}

        {activeTab === 'ASSET' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <SubLedgerAsset caseId={selectedCase.id} />
          </div>
        )}

        {activeTab === 'LOG' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <SubLedgerLog caseId={selectedCase.id} />
          </div>
        )}
      </div>
    </div>
  );
};

export default LedgerDrawer;
