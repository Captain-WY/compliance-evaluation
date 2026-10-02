import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { InspectionPlan } from '../../types';
import PreparationWorkspace from './PreparationWorkspace';
import ExecutionWorkspace from './ExecutionWorkspace';
import ReportingWorkspace from './ReportingWorkspace';
import RectificationWorkspace from './RectificationWorkspace';

interface StageWorkspaceAreaProps {
  activeTab: string;
  inspectionPlanId?: string;
  plan?: InspectionPlan;
  onPlanUpdate?: (plan: InspectionPlan) => void;
}

export default function StageWorkspaceArea({
  activeTab,
  inspectionPlanId,
  plan,
  onEnterWorkspace,
  onNextStage,
  onPlanUpdate,
}: StageWorkspaceAreaProps & { onEnterWorkspace?: () => void, onNextStage?: () => void }) {
  return (
    <div className="flex-1 p-6 md:p-8 bg-slate-50/50">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-6"
          data-testid="inspection-plan-stage-workspace-read-model"
        >
          {activeTab === 'prep' && (
            <PreparationWorkspace plan={plan} onNext={onNextStage} onPlanUpdate={onPlanUpdate} />
          )}

          {activeTab === 'exec' && (
            <ExecutionWorkspace
              inspectionPlanId={inspectionPlanId ?? plan?.id}
              plan={plan}
              onEnterWorkspace={onEnterWorkspace}
            />
          )}

          {activeTab === 'report' && (
            <ReportingWorkspace inspectionPlanId={inspectionPlanId} />
          )}

          {activeTab === 'rectify' && (
             <RectificationWorkspace />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
