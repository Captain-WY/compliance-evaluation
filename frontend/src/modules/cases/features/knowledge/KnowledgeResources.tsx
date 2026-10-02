
import React, { useState } from 'react';
import LegalBrain from '../intelligence/LegalBrain';
import VendorList from '../vendors/VendorList';
import DocTemplateGallery from './DocTemplateGallery';
import { useAuth } from '../../src/contexts/AuthContext';
import { UserRole } from '../../types';
import { BookOpen, Users, FileText } from 'lucide-react';

const KnowledgeResources: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'INTELLIGENCE' | 'VENDORS' | 'TEMPLATES'>('INTELLIGENCE');
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.role === UserRole.LEGAL_ADMIN ||
                  authUser?.roles?.includes(UserRole.LEGAL_ADMIN);

  return (
    <div className="flex flex-col h-full space-y-6 animate-in fade-in duration-500">

      {/* 1. Header & Navigation */}
      <div className="flex-none">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">知识与资源中心 (Knowledge Hub)</h2>
              <p className="text-sm text-slate-500 mt-1">集成法律大脑、外部律师库及标准文书模版，赋能法务高效作业。</p>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 w-fit shadow-sm">
              <button
                onClick={() => setActiveTab('INTELLIGENCE')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${
                    activeTab === 'INTELLIGENCE'
                    ? 'bg-slate-900 text-white shadow-md'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                  <BookOpen className={`w-4 h-4 ${activeTab === 'INTELLIGENCE' ? 'text-brand-300' : ''}`} />
                  智慧法务 (AI)
              </button>
              <button
                onClick={() => setActiveTab('VENDORS')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${
                    activeTab === 'VENDORS'
                    ? 'bg-slate-900 text-white shadow-md'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                  <Users className={`w-4 h-4 ${activeTab === 'VENDORS' ? 'text-brand-300' : ''}`} />
                  律师资源库
              </button>
              <button
                onClick={() => setActiveTab('TEMPLATES')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${
                    activeTab === 'TEMPLATES'
                    ? 'bg-slate-900 text-white shadow-md'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                  <FileText className={`w-4 h-4 ${activeTab === 'TEMPLATES' ? 'text-brand-300' : ''}`} />
                  文书模版
              </button>
          </div>
      </div>

      {/* 2. Content Area */}
      <div className="flex-1 min-h-0">

          {/* Tab 1: Intelligence */}
          {activeTab === 'INTELLIGENCE' && <LegalBrain />}

          {/* Tab 2: Vendors */}
          {activeTab === 'VENDORS' && <VendorList />}

          {/* Tab 3: Document Templates */}
          {activeTab === 'TEMPLATES' && <DocTemplateGallery isAdmin={isAdmin} />}

      </div>
    </div>
  );
};

export default KnowledgeResources;
