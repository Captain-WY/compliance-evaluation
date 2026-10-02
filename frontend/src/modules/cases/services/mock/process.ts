import {developmentBoundary} from '../../../../platform/developmentBoundary';

import { ProcessInstance, NodeStatus, NodeType, ProcessNode, NodeActionType, TransactionType, IssueType, BaseIssue } from '../../types';
import { TEMPLATE_REGISTRY } from '../engine/TemplateRegistry';

// In-memory store for mutation
let MOCK_PROCESS_STORE: ProcessInstance[] = [
  {
    id: 'inst-001-1',
    caseId: 'c-001',
    templateId: 'CIVIL_LITIGATION_PLAINTIFF',
    stageName: '一审程序 (上海金融法院)',
    startDate: '2025-11-15',
    nodes: [
      {
        id: 'node-1',
        key: 'TASK-2025-101',
        issueType: IssueType.TASK,
        title: '立案受理',
        type: NodeType.MILESTONE,
        status: NodeStatus.COMPLETED,
        completedDate: '2025-11-20',
        description: '收到法院受理通知书 (2025)沪74民初123号',
        createdAt: '2025-11-15'
      },
      {
        id: 'node-payment-1',
        key: 'TASK-2025-102',
        issueType: IssueType.TASK,
        title: '缴纳一审案件受理费',
        type: NodeType.TASK,
        status: NodeStatus.ACTIVE, // Active Task!
        deadline: '2025-11-27', // Urgent
        assignee: '王法务',
        description: '需在收到通知书7日内完成缴费，否则按撤诉处理',
        actionType: NodeActionType.PAYMENT,
        actionConfig: {
            amount: 120000,
            paymentType: TransactionType.COURT_FEE
        },
        priority: '重大',
        createdAt: '2025-11-20'
      },
      {
        id: 'node-3',
        key: 'TASK-2025-103',
        issueType: IssueType.TASK,
        title: '举证期限届满',
        type: NodeType.TASK,
        status: NodeStatus.PENDING, // Pending until payment done
        deadline: '2026-03-25',
        assignee: '王法务',
        requiredDocType: ['证据清单', '证据扫描件'],
        description: '向法院提交第一轮证据材料',
        actionType: NodeActionType.UPLOAD,
        actionConfig: {
            docCategory: '证据卷'
        },
        createdAt: '2025-11-20'
      },
      {
        id: 'node-4',
        key: 'TASK-2025-104',
        issueType: IssueType.TASK,
        title: '开庭审理',
        type: NodeType.MILESTONE,
        status: NodeStatus.PENDING,
        deadline: '2026-04-15',
        requiredDocType: ['庭审笔录'],
        description: '预估开庭时间',
        createdAt: '2025-11-20'
      },
      {
        id: 'node-5',
        key: 'TASK-2025-105',
        issueType: IssueType.TASK,
        title: '一审判决',
        type: NodeType.MILESTONE,
        status: NodeStatus.PENDING,
        requiredDocType: ['民事判决书'],
        createdAt: '2025-11-20'
      }
    ]
  },
  {
    id: 'inst-004-1',
    caseId: 'c-004',
    templateId: 'CIVIL_LITIGATION_PLAINTIFF',
    stageName: '诉前财产保全',
    startDate: '2025-12-20',
    endDate: '2026-01-05',
    nodes: [
        { id: 'n4-1', key: 'TASK-2025-201', issueType: IssueType.TASK, title: '财产线索核查', type: NodeType.TASK, status: NodeStatus.COMPLETED, completedDate: '2025-12-25', createdAt: '2025-12-20' },
        { id: 'n4-2', key: 'TASK-2025-202', issueType: IssueType.TASK, title: '提交保全申请', type: NodeType.MILESTONE, status: NodeStatus.COMPLETED, completedDate: '2025-12-28', description: '申请冻结被告持有的上市公司股票', createdAt: '2025-12-20' },
        { id: 'n4-3', key: 'TASK-2026-001', issueType: IssueType.TASK, title: '保全裁定下达', type: NodeType.MILESTONE, status: NodeStatus.COMPLETED, completedDate: '2026-01-04', createdAt: '2025-12-20' }
    ]
  },
  {
    id: 'inst-004-2',
    caseId: 'c-004',
    templateId: 'CIVIL_LITIGATION_PLAINTIFF',
    stageName: '一审程序 (深圳中院)',
    startDate: '2026-01-05',
    nodes: [
        { id: 'n4-4', key: 'TASK-2026-002', issueType: IssueType.TASK, title: '立案受理', type: NodeType.MILESTONE, status: NodeStatus.COMPLETED, completedDate: '2026-01-10', createdAt: '2026-01-05' },
        { id: 'n4-5', key: 'TASK-2026-003', issueType: IssueType.TASK, title: '证据交换', type: NodeType.TASK, status: NodeStatus.ACTIVE, deadline: '2026-03-22', description: '由于案情复杂，法院组织庭前会议进行证据交换', assignee: '李风控', createdAt: '2026-01-05', priority: '特大' },
        { id: 'n4-6', key: 'TASK-2026-004', issueType: IssueType.TASK, title: '开庭审理', type: NodeType.MILESTONE, status: NodeStatus.PENDING, createdAt: '2026-01-05' }
    ]
  },
  // Task B: Mock Arbitration Instance
  {
    id: 'inst-arb-01',
    caseId: 'c-arb-01',
    templateId: 'COMMERCIAL_ARBITRATION',
    stageName: '仲裁程序 (深圳国际仲裁院)',
    startDate: '2026-02-10',
    nodes: [
        { id: 'na-1', key: 'TASK-2026-ARB-01', issueType: IssueType.TASK, title: '提交仲裁申请', type: NodeType.MILESTONE, status: NodeStatus.COMPLETED, completedDate: '2026-02-10', createdAt: '2026-02-10' },
        { id: 'na-2', key: 'TASK-2026-ARB-02', issueType: IssueType.TASK, title: '选定仲裁员', type: NodeType.TASK, status: NodeStatus.ACTIVE, deadline: '2026-03-25', description: '需在收到受理通知书15日内选定我方仲裁员。', assignee: '张合规', priority: '重大', createdAt: '2026-02-15' },
        { id: 'na-3', key: 'TASK-2026-ARB-03', issueType: IssueType.TASK, title: '开庭审理', type: NodeType.MILESTONE, status: NodeStatus.PENDING, description: '不公开审理 (Confidential)', createdAt: '2026-02-10' },
        { id: 'na-4', key: 'TASK-2026-ARB-04', issueType: IssueType.TASK, title: '收到裁决书', type: NodeType.MILESTONE, status: NodeStatus.PENDING, description: '一裁终局，无上诉程序', createdAt: '2026-02-10' }
    ]
  }
];

export const getProcessByCaseId = async (caseId: string): Promise<ProcessInstance[]> => {
    developmentBoundary('process.getProcessByCaseId', false);
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(MOCK_PROCESS_STORE.filter(inst => inst.caseId === caseId));
    }, 400);
  });
};

export const getAllProcessTasks = async (): Promise<BaseIssue[]> => {
    developmentBoundary('process.getAllProcessTasks', false);
    return new Promise(resolve => {
        setTimeout(() => {
            const allTasks: BaseIssue[] = [];
            MOCK_PROCESS_STORE.forEach(inst => {
                inst.nodes.forEach(node => {
                    allTasks.push({
                        id: node.id,
                        key: node.key || `TASK-${node.id}`,
                        title: node.title,
                        issueType: IssueType.TASK,
                        status: node.status,
                        assignee: node.assignee,
                        createdAt: node.createdAt || inst.startDate,
                        priority: node.priority || '一般'
                    });
                });
            });
            resolve(allTasks);
        }, 300);
    });
};

// Internal Helper to append new node
const appendNodeToInstance = (instanceId: string, node: Omit<ProcessNode, 'id'>) => {
    const instIndex = MOCK_PROCESS_STORE.findIndex(i => i.id === instanceId);
    if (instIndex !== -1) {
        const newNode: ProcessNode = {
            id: `node-gen-${Date.now()}`,
            ...node
        };
        MOCK_PROCESS_STORE[instIndex].nodes.push(newNode);
        console.log(`[Process Engine] Auto-generated next step: ${node.title}`);
    }
};

export const updateNodeStatus = async (instanceId: string, nodeId: string, status: NodeStatus): Promise<void> => {
    developmentBoundary('process.updateNodeStatus', true);
    return new Promise(resolve => {
        setTimeout(() => {
            const instIndex = MOCK_PROCESS_STORE.findIndex(i => i.id === instanceId);
            if (instIndex !== -1) {
                const instance = MOCK_PROCESS_STORE[instIndex];
                const updatedNodes = instance.nodes.map(n => {
                    if (n.id === nodeId) {
                        return {
                            ...n,
                            status,
                            completedDate: status === NodeStatus.COMPLETED ? new Date().toISOString().split('T')[0] : undefined
                        };
                    }
                    return n;
                });
                
                // 1. Activate next pending node
                if (status === NodeStatus.COMPLETED) {
                    const nodeIndex = updatedNodes.findIndex(n => n.id === nodeId);
                    const completedNode = updatedNodes[nodeIndex];

                    if (nodeIndex !== -1 && nodeIndex < updatedNodes.length - 1) {
                        const nextNode = updatedNodes[nodeIndex + 1];
                        if (nextNode.status === NodeStatus.PENDING) {
                            updatedNodes[nodeIndex + 1] = { ...nextNode, status: NodeStatus.ACTIVE };
                        }
                    }

                    // 2. Automation Triggers with Branching Logic
                    const isCivil = instance.templateId?.includes('CIVIL');
                    const isArbitration = instance.templateId?.includes('ARBITRATION');

                    if (completedNode.title.includes('一审判决') && isCivil) {
                        // Civil Litigation: Generate Appeal Deadline
                        const today = new Date();
                        const appealDeadline = new Date(today);
                        appealDeadline.setDate(today.getDate() + 15);
                        
                        appendNodeToInstance(instanceId, {
                            key: `TASK-${today.getFullYear()}-APPEAL`,
                            issueType: IssueType.TASK,
                            title: '上诉期截止提醒',
                            type: NodeType.TASK,
                            status: NodeStatus.ACTIVE,
                            deadline: appealDeadline.toISOString().split('T')[0],
                            description: '民事诉讼判决书送达后15日内为上诉期。请确认是否上诉。',
                            priority: '重大',
                            createdAt: today.toISOString().split('T')[0]
                        });
                    } else if (completedNode.title.includes('裁决书') && isArbitration) {
                        // Arbitration: Final Judgment (No Appeal)
                        // Trigger Enforcement Preparation directly
                        const today = new Date();
                        
                        appendNodeToInstance(instanceId, {
                            key: `TASK-${today.getFullYear()}-EXEC-PREP`,
                            issueType: IssueType.TASK,
                            title: '执行准备 (财产核查)',
                            type: NodeType.TASK,
                            status: NodeStatus.ACTIVE,
                            deadline: undefined, // ASAP
                            description: '仲裁实行一裁终局。请立即启动财产线索复核，准备申请强制执行。',
                            priority: '重大',
                            actionType: NodeActionType.NONE,
                            createdAt: today.toISOString().split('T')[0]
                        });
                        console.log('[Process Engine] Arbitration Logic: Skipped Appeal task, triggered Enforcement.');
                    }
                }

                MOCK_PROCESS_STORE[instIndex] = { ...instance, nodes: updatedNodes };
            }
            resolve();
        }, 300);
    });
};

// --- Engine Core: Instantiate from Template ---
export const instantiateProcess = async (caseId: string, templateId: string): Promise<void> => {
    developmentBoundary('process.instantiateProcess', true);
    return new Promise(resolve => {
        setTimeout(() => {
            const template = TEMPLATE_REGISTRY[templateId];
            if (!template) {
                console.warn(`Template ${templateId} not found`);
                return resolve();
            }

            console.log(`[Workflow Engine] Instantiating template: ${template.name} for Case ${caseId}`);

            const stageDef = template.stages[0];
            const startDate = new Date();
            const year = startDate.getFullYear();
            
            const newInstance: ProcessInstance = {
                id: `inst-${caseId}-${Date.now()}`,
                caseId,
                templateId: template.id, // Store Template ID
                stageName: stageDef.name,
                startDate: startDate.toISOString().split('T')[0],
                nodes: stageDef.nodes.map((nodeDef, idx) => {
                    let deadline = undefined;
                    if (nodeDef.deadlineOffset !== undefined) {
                        const d = new Date(startDate);
                        d.setDate(d.getDate() + nodeDef.deadlineOffset);
                        deadline = d.toISOString().split('T')[0];
                    }

                    return {
                        id: `node-${caseId}-${idx}`,
                        key: `TASK-${year}-${Math.floor(Math.random() * 10000)}`, // Generate Key
                        issueType: IssueType.TASK,
                        title: nodeDef.title,
                        type: nodeDef.type,
                        // First node active, rest pending
                        status: idx === 0 ? NodeStatus.ACTIVE : NodeStatus.PENDING,
                        description: nodeDef.description,
                        deadline: deadline,
                        requiredDocType: nodeDef.requiredDocType,
                        actionType: nodeDef.actionType,
                        actionConfig: nodeDef.actionConfig,
                        createdAt: startDate.toISOString().split('T')[0]
                    };
                })
            };

            MOCK_PROCESS_STORE.push(newInstance);
            resolve();
        }, 500);
    });
};

export const createTerminatedSupervisionTask = (caseId: string, deadline: string): void => {
    developmentBoundary('process.createTerminatedSupervisionTask', true);
    const newInstance: ProcessInstance = {
        id: `inst-zb-${Date.now()}`,
        caseId,
        stageName: '终本案件动态管理',
        startDate: new Date().toISOString().split('T')[0],
        nodes: [
            {
                id: `node-zb-${Date.now()}`,
                key: `TASK-${new Date().getFullYear()}-SUPERVISE`,
                issueType: IssueType.TASK,
                title: '定期财产线索复查 (6个月)',
                type: NodeType.TASK,
                status: NodeStatus.ACTIVE,
                deadline: deadline,
                assignee: '系统自动生成',
                description: '案件已终结本次执行程序。根据合规要求，每6个月需通过网络查控系统或现场调查复核被执行人财产状况。',
                requiredDocType: ['财产调查报告'],
                createdAt: new Date().toISOString().split('T')[0]
            }
        ]
    };
    MOCK_PROCESS_STORE.push(newInstance);
};
