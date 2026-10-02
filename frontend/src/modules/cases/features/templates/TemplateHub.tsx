import React, { useState } from 'react';
import { FileText, GitBranch, CheckSquare } from 'lucide-react';
import DocTemplateAdmin from './DocTemplateAdmin';
import ProcessTemplateAdmin from './ProcessTemplateAdmin';

type TemplateTab = 'doc' | 'process';

const TABS: { id: TemplateTab; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: 'doc', label: '文档模板', icon: <FileText className="w-4 h-4" />, desc: '起诉书、合同等法律文书模板' },
  { id: 'process', label: '流程与任务模板', icon: <GitBranch className="w-4 h-4" />, desc: '案件处理流程及任务节点配置' },
];

const TemplateHub: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TemplateTab>('doc');

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-200 bg-white shrink-0">
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <CheckSquare className="w-5 h-5 text-brand-600" /> 模板库
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">管理文档模板、流程模板与任务模板</p>
      </div>

      {/* Tab Nav */}
      <div className="flex border-b border-slate-200 bg-white shrink-0 px-6">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors mr-2 ${
              activeTab === tab.id
                ? 'text-brand-600 border-brand-600'
                : 'text-slate-500 border-transparent hover:text-slate-800'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
        {activeTab === 'doc' && <DocTemplateAdmin />}
        {activeTab === 'process' && <ProcessTemplateAdmin />}
      </div>
    </div>
  );
};

export default TemplateHub;
