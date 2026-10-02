import React, { useState } from 'react';
import AssessmentTaskList from './AssessmentTaskList';
import AssessmentDataForm from './AssessmentDataForm';

export default function DataReportingHub() {
  const [view, setView] = useState<'list' | 'form'>('list');
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  if (view === 'list') {
    return (
      <AssessmentTaskList 
        onEnterTask={(taskId) => {
          setActiveTaskId(taskId);
          setView('form');
        }} 
      />
    );
  }

  return (
    <AssessmentDataForm 
      taskId={activeTaskId || ''} 
      onBack={() => setView('list')} 
    />
  );
}
