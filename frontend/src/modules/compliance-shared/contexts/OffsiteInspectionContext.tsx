import React, { createContext, useContext, useEffect, useState } from 'react';
import { API_MODE, fileApi, inspectionApi } from '../services/api';
import { EvidenceSubmission, EvidenceRequirement } from '../types';
import { toast } from 'sonner';

interface OffsiteInspectionContextType {
  submissions: EvidenceSubmission[];
  requirements: EvidenceRequirement[];
  rejectSubmission: (id: string, reason: string) => void;
  approveSubmission: (id: string) => void;
  convertToIssue: (id: string, riskLevel: string, desc: string) => void;
  submitEvidence: (reqId: string, branchId: string, files: File[]) => Promise<void>;
}

const OffsiteInspectionContext = createContext<OffsiteInspectionContextType | undefined>(undefined);

export const OffsiteInspectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [submissions, setSubmissions] = useState<EvidenceSubmission[]>([]);
  const [requirements, setRequirements] = useState<EvidenceRequirement[]>([]);

  useEffect(() => {
    if (API_MODE !== 'mock') {
      setRequirements([]);
      setSubmissions([]);
      return;
    }

    let cancelled = false;
    Promise.all([
      inspectionApi.getEvidenceRequirements(),
      inspectionApi.getEvidenceSubmissions().catch(() => [] as EvidenceSubmission[]),
    ])
      .then(([nextRequirements, nextSubmissions]) => {
        if (cancelled) return;
        setRequirements(nextRequirements);
        setSubmissions(nextSubmissions);
      })
      .catch(error => {
        toast.error(error instanceof Error ? error.message : '检查材料数据加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rejectSubmission = (id: string, reason: string) => {
    setSubmissions(prev => prev.map(sub => {
      if (sub.id === id) {
        // Simulate branch notification
        setTimeout(() => {
          toast.error(`🔔 新通知：${sub.branchName} - 您有一份底稿被总部退回！`, {
            description: `退回理由: ${reason}`,
            duration: 5000,
          });
        }, 500);
        return { ...sub, status: 'REJECTED', hqFeedback: reason };
      }
      return sub;
    }));
  };

  const approveSubmission = (id: string) => {
    setSubmissions(prev => prev.map(sub => {
      if (sub.id === id) {
        toast.success(`✅ 已审核通过 ${sub.branchName} 的底稿`);
        return { ...sub, status: 'APPROVED' };
      }
      return sub;
    }));
  };

  const convertToIssue = (id: string, riskLevel: string, desc: string) => {
    setSubmissions(prev => prev.map(sub => {
      if (sub.id === id) {
        const newIssueId = `ISS-2026-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
        toast.success(`✅ 缺陷已成功提取，整改单据流已在【中央问题库】生成。`);
        
        // Simulate branch notification
        setTimeout(() => {
          toast.warning(`🔔 新通知：${sub.branchName} - 您的底稿被转化为合规缺陷！`, {
            description: `请前往待办中心处理整改单 ${newIssueId}`,
            duration: 6000,
          });
        }, 800);

        return { ...sub, status: 'ISSUE_CREATED', relatedIssueId: newIssueId };
      }
      return sub;
    }));
  };

  const submitEvidence = async (reqId: string, branchId: string, files: File[]) => {
    const uploadedFiles = await Promise.all(files.map(file => fileApi.uploadFile(file)));
    const fileIds = uploadedFiles.map(file => file.fileId).filter(Boolean);
    const submission = await inspectionApi.submitEvidence(reqId, fileIds);
    setSubmissions(prev => {
      const existing = prev.find(s => s.requirementId === reqId && s.branchId === branchId);
      if (existing) {
        return prev.map(s => s.id === existing.id ? submission : s);
      }
      return [...prev, submission];
    });
    toast.success('材料已成功提交，等待总部审核。');
  };

  return (
    <OffsiteInspectionContext.Provider value={{ submissions, requirements, rejectSubmission, approveSubmission, convertToIssue, submitEvidence }}>
      {children}
    </OffsiteInspectionContext.Provider>
  );
};

export const useOffsiteInspection = () => {
  const context = useContext(OffsiteInspectionContext);
  if (!context) throw new Error('useOffsiteInspection must be used within Provider');
  return context;
};
