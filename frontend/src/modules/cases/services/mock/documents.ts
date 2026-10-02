import {developmentBoundary} from '../../../../platform/developmentBoundary';

import { CaseDocument } from '../../types';

let MOCK_DOCS: CaseDocument[] = [
  {
    id: 'd-101',
    name: '民事起诉状_盖章版.pdf',
    type: 'pdf',
    category: '程序卷',
    uploadDate: '2025-11-15',
    uploader: '王法务',
    size: '2.4 MB',
    tags: ['起诉状'],
    version: 1
  },
  {
    id: 'd-102',
    name: '上海金融法院受理通知书.pdf',
    type: 'pdf',
    category: '程序卷',
    uploadDate: '2025-11-20',
    uploader: '王法务',
    size: '0.8 MB',
    tags: ['传票/通知'],
    version: 1
  },
  {
    id: 'd-200',
    name: '核心交易文件',
    type: 'folder',
    category: '证据卷',
    uploadDate: '2026-03-01',
    uploader: '王法务',
    size: '-',
    version: 1
  },
  {
    id: 'd-201',
    name: '债券募集说明书.pdf',
    type: 'pdf',
    category: '证据卷',
    uploadDate: '2026-03-01',
    uploader: '金杜律所-Robert',
    size: '15.6 MB',
    tags: ['核心证据'],
    parentId: 'd-200',
    evidenceNo: 'A-01',
    proofPurpose: '证明发行人关于募资用途的承诺，以及我方认购的法律基础。',
    version: 1
  },
  {
    id: 'd-202',
    name: '认购协议.pdf',
    type: 'pdf',
    category: '证据卷',
    uploadDate: '2026-03-01',
    uploader: '金杜律所-Robert',
    size: '3.2 MB',
    tags: ['核心证据'],
    parentId: 'd-200',
    evidenceNo: 'A-02',
    proofPurpose: '证明双方成立合同关系，以及违约责任条款的约定。',
    version: 2,
    versions: [
        { version: 1, date: '2026-02-28', uploader: '金杜律所-Robert', size: '3.1 MB' }
    ]
  },
  {
    id: 'd-203',
    name: '资金流向证明',
    type: 'folder',
    category: '证据卷',
    uploadDate: '2026-03-02',
    uploader: '王法务',
    size: '-',
    version: 1
  },
  {
    id: 'd-204',
    name: '银行转账回单.jpg',
    type: 'jpg',
    category: '证据卷',
    uploadDate: '2026-03-02',
    uploader: '财务部',
    size: '0.5 MB',
    parentId: 'd-203',
    evidenceNo: 'B-01',
    proofPurpose: '证明我方已履行付款义务，资金已实付至发行人账户。',
    version: 1
  },
  {
    id: 'd-501',
    name: '立案审批单.pdf',
    type: 'pdf',
    category: '内部卷',
    uploadDate: '2025-11-14',
    uploader: '系统自动生成',
    size: '0.5 MB',
    tags: ['审批流'],
    version: 1
  }
];

export const getDocumentsByCaseId = async (caseId: string): Promise<CaseDocument[]> => {
    developmentBoundary('documents.getDocumentsByCaseId', false);
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve([...MOCK_DOCS]);
    }, 300);
  });
};

export const addDocument = async (doc: Omit<CaseDocument, 'id' | 'uploadDate' | 'version'>): Promise<CaseDocument> => {
    developmentBoundary('documents.addDocument', true);
    return new Promise((resolve) => {
        setTimeout(() => {
            const newDoc: CaseDocument = {
                ...doc,
                id: `d-${Date.now()}`,
                uploadDate: new Date().toISOString().split('T')[0],
                version: 1
            };
            MOCK_DOCS = [newDoc, ...MOCK_DOCS];
            resolve(newDoc);
        }, 800);
    });
};

export const createFolder = async (name: string, category: string, parentId?: string): Promise<CaseDocument> => {
    developmentBoundary('documents.createFolder', true);
    return new Promise((resolve) => {
        setTimeout(() => {
            const newFolder: CaseDocument = {
                id: `f-${Date.now()}`,
                name,
                type: 'folder',
                category,
                parentId,
                uploadDate: new Date().toISOString().split('T')[0],
                uploader: '当前用户',
                size: '-',
                version: 1
            };
            MOCK_DOCS = [newFolder, ...MOCK_DOCS];
            resolve(newFolder);
        }, 300);
    });
};

export const updateDocument = async (docId: string, updates: Partial<CaseDocument>): Promise<void> => {
    developmentBoundary('documents.updateDocument', true);
    return new Promise((resolve) => {
        setTimeout(() => {
            MOCK_DOCS = MOCK_DOCS.map(d => d.id === docId ? { ...d, ...updates } : d);
            resolve();
        }, 300);
    });
};

export const uploadNewVersion = async (docId: string, file: File): Promise<void> => {
    developmentBoundary('documents.uploadNewVersion', true);
    return new Promise((resolve) => {
        setTimeout(() => {
            const index = MOCK_DOCS.findIndex(d => d.id === docId);
            if (index === -1) return resolve();

            const oldDoc = MOCK_DOCS[index];
            const newVersionNum = oldDoc.version + 1;
            
            // Archive old version
            const archivedVersion = {
                version: oldDoc.version,
                date: oldDoc.uploadDate,
                uploader: oldDoc.uploader,
                size: oldDoc.size
            };

            // Update Doc
            MOCK_DOCS[index] = {
                ...oldDoc,
                name: file.name, // Usually keep same name, but support rename on upload
                type: file.name.split('.').pop() as any || 'other',
                size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
                uploadDate: new Date().toISOString().split('T')[0],
                uploader: '当前用户',
                version: newVersionNum,
                versions: [archivedVersion, ...(oldDoc.versions || [])]
            };
            resolve();
        }, 800);
    });
};

export const deleteDocument = async (docId: string): Promise<void> => {
    developmentBoundary('documents.deleteDocument', true);
    return new Promise((resolve) => {
        setTimeout(() => {
            MOCK_DOCS = MOCK_DOCS.filter(d => d.id !== docId && d.parentId !== docId);
            resolve();
        }, 300);
    });
};
