
import { NodeType, NodeActionType, TransactionType } from '../../types';

export interface AutoTaskDef {
    title: string;
    type: NodeType;
    deadlineOffset?: number; // Days from start
    description?: string;
    requiredDocType?: string[];
    actionType?: NodeActionType;
    actionConfig?: any;
}

export interface StageDef {
    stageKey: string;
    name: string;
    nodes: AutoTaskDef[];
}

export interface ProcessTemplate {
    id: string;
    name: string;
    stages: StageDef[];
}

export const TEMPLATE_REGISTRY: Record<string, ProcessTemplate> = {
    // 1. 民事诉讼 - 原告方 (Civil Litigation - Plaintiff)
    'CIVIL_LITIGATION_PLAINTIFF': {
        id: 'CIVIL_LITIGATION_PLAINTIFF',
        name: '民事诉讼标准流程 (原告)',
        stages: [
            {
                stageKey: 'PRE_LITIGATION',
                name: 'P0: 诉前准备',
                nodes: [
                    { 
                        title: '线索研判与立案审批', 
                        type: NodeType.MILESTONE, 
                        description: '完成内部利益冲突检索及立案签报审批',
                        requiredDocType: ['立案审批单']
                    },
                    { 
                        title: '签署法律服务合同', 
                        type: NodeType.TASK, 
                        deadlineOffset: 5, 
                        description: '完成外聘律师选聘及合同签署',
                        requiredDocType: ['法律服务合同']
                    }
                ]
            },
            {
                stageKey: 'FIRST_INSTANCE',
                name: 'P1: 一审程序',
                nodes: [
                    { 
                        title: '提交起诉材料', 
                        type: NodeType.MILESTONE, 
                        description: '向管辖法院提交起诉状及证据清单',
                        requiredDocType: ['民事起诉状', '受理通知书']
                    },
                    { 
                        title: '缴纳诉讼费', 
                        type: NodeType.TASK, 
                        deadlineOffset: 7, 
                        actionType: NodeActionType.PAYMENT, 
                        actionConfig: { paymentType: TransactionType.COURT_FEE }, 
                        description: '收到缴费通知7日内完成缴纳' 
                    },
                    { 
                        title: '财产保全申请', 
                        type: NodeType.TASK, 
                        deadlineOffset: 10, 
                        description: '向法院提交财产保全申请及担保材料',
                        requiredDocType: ['保全裁定书']
                    },
                    { 
                        title: '举证期限届满', 
                        type: NodeType.MILESTONE, 
                        deadlineOffset: 30, 
                        description: '向法院提交全部证据原件核对' 
                    },
                    { 
                        title: '开庭审理', 
                        type: NodeType.MILESTONE, 
                        description: '代理律师出庭', 
                        requiredDocType: ['庭审笔录'] 
                    },
                    { 
                        title: '收到一审判决', 
                        type: NodeType.MILESTONE, 
                        description: '收到判决书，分析胜诉情况', 
                        requiredDocType: ['民事判决书'] 
                    }
                ]
            }
        ]
    },

    // 2. 民事诉讼 - 被告方 (Civil Litigation - Defendant)
    'CIVIL_LITIGATION_DEFENDANT': {
        id: 'CIVIL_LITIGATION_DEFENDANT',
        name: '民事诉讼标准流程 (被告)',
        stages: [
            {
                stageKey: 'FIRST_INSTANCE',
                name: 'P1: 一审程序 (应诉)',
                nodes: [
                    { 
                        title: '收到起诉状/应诉通知', 
                        type: NodeType.MILESTONE, 
                        description: '录入案号、法官信息及涉案金额', 
                        requiredDocType: ['起诉状', '应诉通知书'] 
                    },
                    { 
                        title: '管辖权异议评估', 
                        type: NodeType.TASK, 
                        deadlineOffset: 5, 
                        description: '评估是否在答辩期内提出管辖权异议' 
                    },
                    { 
                        title: '提交答辩状', 
                        type: NodeType.TASK, 
                        deadlineOffset: 15, 
                        description: '法定期限内提交答辩状', 
                        requiredDocType: ['答辩状'] 
                    },
                    { 
                        title: '举证期限届满', 
                        type: NodeType.MILESTONE, 
                        deadlineOffset: 30, 
                        description: '完成证据交换' 
                    },
                    { 
                        title: '开庭审理', 
                        type: NodeType.MILESTONE, 
                        description: '参加庭审', 
                        requiredDocType: ['庭审笔录'] 
                    },
                    { 
                        title: '收到一审判决', 
                        type: NodeType.MILESTONE, 
                        description: '收到判决书，评估是否上诉', 
                        requiredDocType: ['民事判决书'] 
                    }
                ]
            }
        ]
    },

    // 3. 商事仲裁 (Commercial Arbitration)
    'COMMERCIAL_ARBITRATION': {
        id: 'COMMERCIAL_ARBITRATION',
        name: '商事仲裁流程',
        stages: [
            {
                stageKey: 'ARBITRATION',
                name: '仲裁审理',
                nodes: [
                    { 
                        title: '提交仲裁申请', 
                        type: NodeType.MILESTONE, 
                        description: '向仲裁委提交申请书',
                        requiredDocType: ['仲裁申请书', '受理通知书']
                    },
                    { 
                        title: '预缴仲裁费', 
                        type: NodeType.TASK, 
                        deadlineOffset: 5, 
                        actionType: NodeActionType.PAYMENT,
                        actionConfig: { paymentType: TransactionType.COURT_FEE },
                        description: '缴纳案件处理费及仲裁员开支'
                    },
                    { 
                        title: '选定仲裁员', 
                        type: NodeType.TASK, 
                        deadlineOffset: 15, 
                        description: '选定我方仲裁员' 
                    },
                    { 
                        title: '开庭审理', 
                        type: NodeType.MILESTONE, 
                        description: '不公开审理', 
                        requiredDocType: ['庭审笔录'] 
                    },
                    { 
                        title: '收到裁决书', 
                        type: NodeType.MILESTONE, 
                        description: '一裁终局，无上诉程序', 
                        requiredDocType: ['仲裁裁决书'] 
                    }
                ]
            }
        ]
    }
};
