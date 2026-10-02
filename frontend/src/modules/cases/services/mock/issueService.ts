import {developmentBoundary} from '../../../../platform/developmentBoundary';

import { BaseIssue, IssueType } from '../../types';
import { getCases } from './cases';
import { getClues } from './clues';
import { getAllEvidenceTasks } from './collaboration';
import { getAllProcessTasks } from './process';

export interface IssueFilter {
    type?: IssueType | 'ALL';
    search?: string;
    assignee?: string; // 'ME' | 'ALL'
    // Add more filters as needed
}

export const getIssues = async (filter: IssueFilter = {}): Promise<BaseIssue[]> => {
    developmentBoundary('issueService.getIssues', false);
    let allIssues: BaseIssue[] = [];

    // Parallel fetch based on type
    const fetches = [];
    
    const shouldFetchCases = !filter.type || filter.type === 'ALL' || filter.type === IssueType.CASE || filter.type === IssueType.EPIC;
    const shouldFetchClues = !filter.type || filter.type === 'ALL' || filter.type === IssueType.CLUE;
    const shouldFetchTasks = !filter.type || filter.type === 'ALL' || filter.type === IssueType.TASK;

    if (shouldFetchCases) fetches.push(getCases());
    if (shouldFetchClues) fetches.push(getClues());
    // Aggregate both Evidence Tasks AND Process Tasks under IssueType.TASK
    if (shouldFetchTasks) {
        fetches.push(getAllEvidenceTasks());
        fetches.push(getAllProcessTasks());
    }

    const results = await Promise.all(fetches);
    
    results.forEach(dataSet => {
        allIssues = [...allIssues, ...dataSet];
    });

    // Apply filters
    return allIssues.filter(issue => {
        // Type Filter (Specific)
        if (filter.type && filter.type !== 'ALL') {
            if (filter.type === IssueType.CASE) {
                if (issue.issueType !== IssueType.CASE && issue.issueType !== IssueType.EPIC) return false;
            } else {
                if (issue.issueType !== filter.type) return false;
            }
        }

        // Search Filter
        if (filter.search) {
            const q = filter.search.toLowerCase();
            const match = 
                issue.title.toLowerCase().includes(q) || 
                issue.key.toLowerCase().includes(q) ||
                (issue.assignee && issue.assignee.toLowerCase().includes(q));
            if (!match) return false;
        }

        return true;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};
