import { RiskLevel } from '../../types';

export const getRiskAbbr = (level: RiskLevel | string): string => {
    switch (level) {
        case RiskLevel.LOW: return 'YB'; // 一般 Yi Ban
        case RiskLevel.MEDIUM: return 'GZ'; // 关注 Guan Zhu
        case RiskLevel.HIGH: return 'ZD'; // 重大 Zhong Da
        case RiskLevel.CRITICAL: return 'TD'; // 特大 Te Da
        default: return 'QT'; // 其他
    }
};

export const getCauseAbbr = (cause: string): string => {
    if (cause.includes('虚假陈述')) return 'XJCS';
    if (cause.includes('金融借款')) return 'JRJK';
    if (cause.includes('债券')) return 'ZQJY';
    if (cause.includes('内幕交易')) return 'NMJY';
    if (cause.includes('股票质押')) return 'GPZY';
    if (cause.includes('融资融券')) return 'RZRQ';
    if (cause.includes('资产管理') || cause.includes('基金')) return 'ZGHT';
    if (cause.includes('劳动')) return 'LDZY';
    if (cause.includes('行政处罚')) return 'XZCF';
    if (cause.includes('衍生品')) return 'YSP';
    if (cause.includes('证券投资咨询')) return 'TZZX';
    return 'QT'; // 其他
};

export const generateCaseCode = (
    risk: RiskLevel | string, 
    cause: string, 
    dateStr: string, 
    index: number
): string => {
    const riskAbbr = getRiskAbbr(risk);
    const causeAbbr = getCauseAbbr(cause);
    const year = dateStr.substring(0, 4);
    const idxStr = index.toString().padStart(3, '0');
    
    return `${riskAbbr}-${causeAbbr}-${year}-${idxStr}`;
};
