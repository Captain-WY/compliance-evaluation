import { CaseListReqDTO, CaseListItemVO, CaseSummaryDrawerVO, QuickUpdateReqDTO, DrawerItemType } from '../../types/case';
import { CaseStage, IssueType, Case, Clue } from '../../types';
import { getIssues } from './issueService';
import { updateCaseStage } from './cases';

// Simulate network latency
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const caseMock = {
  getListView: async (params: CaseListReqDTO): Promise<CaseListItemVO[]> => {
    await delay(400);
    const all = await getIssues();
    
    // Basic mock filtering based on DTO
    let result = all as CaseListItemVO[];
    if (params.type && params.type !== 'ALL') {
      result = result.filter(i => i.issueType === params.type);
    }
    if (params.stage && params.stage !== 'ALL') {
      result = result.filter(i => i.status === params.stage);
    }
    if (params.keyword) {
      const keyword = params.keyword.toLowerCase();
      result = result.filter(i => 
        i.title.toLowerCase().includes(keyword) || 
        i.key.toLowerCase().includes(keyword)
      );
    }
    return result;
  },

  getKanbanView: async (params: CaseListReqDTO): Promise<CaseListItemVO[]> => {
    await delay(400);
    const all = await getIssues();
    return all.filter(i => i.issueType === IssueType.CASE || i.issueType === IssueType.EPIC || i.issueType === IssueType.CLUE) as CaseListItemVO[];
  },

  getLedgerView: async (params: CaseListReqDTO): Promise<CaseListItemVO[]> => {
    await delay(400);
    const all = await getIssues();
    return all.filter(i => i.issueType === IssueType.CASE || i.issueType === IssueType.EPIC) as CaseListItemVO[];
  },

  getCalendarView: async (params: CaseListReqDTO): Promise<CaseListItemVO[]> => {
    await delay(400);
    const all = await getIssues();
    return all as CaseListItemVO[];
  },

  getDrawerSummary: async (id: string, itemType: DrawerItemType): Promise<CaseSummaryDrawerVO> => {
    await delay(300);
    const all = await getIssues();
    const issue = all.find(i => i.id === id);
    if (!issue) throw new Error('Issue not found');
    
    const base = {
      id: issue.id,
      key: issue.key,
      title: issue.title,
      assignee: issue.assignee,
      recentActivities: [
        { id: '1', action: '阶段变更为 ' + issue.status, timestamp: new Date().toISOString(), operator: '系统' },
        { id: '2', action: '更新了摘要信息', timestamp: new Date(Date.now() - 86400000).toISOString(), operator: issue.assignee || '王律师' }
      ]
    };

    if (itemType === 'CASE') {
      const caseItem = issue as Case;
      return {
        ...base,
        itemType: 'CASE',
        code: caseItem.code,
        caseType: caseItem.caseType,
        stage: caseItem.stage || CaseStage.FIRST_INSTANCE,
        riskLevel: caseItem.priority as any,
        amount: caseItem.regulatoryAttrs ? (caseItem.regulatoryAttrs.amountNoInterest || 0) : 0,
        court: caseItem.court,
        cause: caseItem.cause,
        businessLine: caseItem.businessLine,
        filingDate: caseItem.filingDate,
        deadline: caseItem.nextDeadline,
        summaryDetail: caseItem.summaryDetail
      };
    } else if (itemType === 'CLUE') {
      const clueItem = issue as Clue;
      return {
        ...base,
        itemType: 'CLUE',
        status: clueItem.status,
        content: clueItem.content || '',
        source: clueItem.source,
        reporter: clueItem.reporter || '系统',
        reportDate: clueItem.reportDate || clueItem.createdAt,
        attachments: clueItem.attachedFiles || [],
        cleanedAmount: clueItem.cleanedAmount,
        cleanedPlaintiff: clueItem.cleanedPlaintiff,
        riskLevel: clueItem.riskLevel
      };
    } else {
      const taskItem = issue as any;
      return {
        ...base,
        itemType: 'EXECUTABLE_TASK',
        status: taskItem.status,
        deadline: taskItem.deadline || '',
        description: taskItem.description || '',
        attachments: taskItem.attachedFiles || [],
        caseTitle: taskItem.caseTitle,
        assigneeDept: taskItem.assigneeDept,
        creator: taskItem.creator
      };
    }
  },

  // quickUpdate mock 已删除 (2026-04-19, 设计端点 /cases/quick-update 已废弃, 合并到 /cases/base-info/update)
  // changeStage mock 已删除 (2.S2.a 起, 真实 BFF /cases/stage/change 可用)
};
