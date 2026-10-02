
import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { caseService } from '../../../services/case';
import { DrawerItemType } from '../../../types/case';
import CasePreview from '../previews/CasePreview';
import CluePreview from '../previews/CluePreview';
import TaskPreview from '../previews/TaskPreview';
import { Inbox, Loader2 } from 'lucide-react';

interface PreviewPaneProps {
  selectedId: string | null;
  itemType?: DrawerItemType;
  onNavigateFull: (path: string) => void;
  onClose?: () => void;
}

const PreviewPane: React.FC<PreviewPaneProps> = ({ selectedId, itemType = 'CASE', onNavigateFull, onClose }) => {
  const queryClient = useQueryClient();

  const { data: summaryData, isLoading, isError } = useQuery({
    queryKey: ['drawerSummary', selectedId, itemType],
    queryFn: () => caseService.getDrawerSummary(selectedId!, itemType),
    enabled: !!selectedId,
    staleTime: 5 * 60 * 1000,
  });

  const handleEdit = () => { window.location.hash = `#/cases/${selectedId}?mode=edit`; };
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['drawerSummary', selectedId, itemType] });
  };

  if (!selectedId) {
      return (
          <div className="h-full flex flex-col items-center justify-center text-slate-300 bg-slate-50/50">
              <Inbox className="w-16 h-16 mb-4 opacity-20" />
              <p className="font-medium text-sm">选择左侧列表项以查看详情</p>
          </div>
      );
  }

  if (isLoading) {
      return (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 bg-white">
              <Loader2 className="w-8 h-8 mb-4 animate-spin" />
              <p className="text-sm">加载详情中...</p>
          </div>
      );
  }

  if (isError || !summaryData) {
      return (
          <div className="h-full flex flex-col items-center justify-center text-red-400 bg-white">
              <p className="text-sm">加载失败，请重试</p>
          </div>
      );
  }

  // Polymorphic Render based on itemType
  switch (summaryData.itemType) {
      case 'CASE':
          return <CasePreview caseData={summaryData as any} onNavigateFull={() => onNavigateFull(`/cases/${summaryData.id}`)} onEdit={handleEdit} onRefresh={handleRefresh} onClose={onClose} />;
      case 'CLUE':
          return <CluePreview clue={summaryData as any} onNavigateFull={() => onNavigateFull(`/clues/${summaryData.id}`)} onClose={onClose} />;
      case 'EXECUTABLE_TASK':
          return <TaskPreview task={summaryData as any} onNavigateFull={() => {}} onClose={onClose} />;
      default:
          return <div>Unknown Issue Type</div>;
  }
};

export default PreviewPane;
