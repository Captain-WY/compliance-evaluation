import {developmentBoundary} from '../../../../platform/developmentBoundary';

import { Case, RiskLevel, BusinessLine } from '../../types';
import { MOCK_NET_ASSETS } from './riskEngine';

// Simulated latency for AI generation
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface DraftOptions {
    tone?: 'NEUTRAL' | 'DEFENSIVE'; // 中性 or 防御性
    includeFinancialAnalysis?: boolean;
}

export const generateDisclosureDraft = async (caseData: Case, triggerType: string, options: DraftOptions = {}): Promise<string> => {
    developmentBoundary('aiDrafting.generateDisclosureDraft', true);
    await delay(1200); // Simulate AI "thinking" time

    const today = new Date();
    const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
    
    // 1. Context Logic
    const stockCode = caseData.regulatoryAttrs?.securityCode || '600XXX';
    const isSSE = stockCode.startsWith('6'); // Shanghai
    const exchangeName = isSSE ? '上海证券交易所' : '深圳证券交易所';
    const shortName = caseData.regulatoryAttrs?.securityName || '我司股份';
    
    const amount = caseData.regulatoryAttrs?.amountNoInterest || 0;
    const ratio = (amount / MOCK_NET_ASSETS) * 100;
    const isMaterial = ratio > 10; // >10% of Net Assets

    // 2. Logic for Cumulative Reports (Special Handling)
    if (triggerType.includes('累计')) {
        return generateCumulativeDraft(caseData, shortName, dateStr);
    }

    // 3. Logic for Single Case (Ad-hoc)
    
    let content = `证券代码：${stockCode}           证券简称：${shortName}           公告编号：${today.getFullYear()}-0${Math.floor(Math.random() * 89) + 10}\n\n`;
    content += `${shortName}股份有限公司\n`;
    content += `关于涉及${triggerType}的公告\n\n`;
    content += `本公司董事会及全体董事保证本公告内容不存在任何虚假记载、误导性陈述或者重大遗漏，并对其内容的真实性、准确性和完整性承担法律责任。\n\n`;

    // Section I: Summary
    content += `重要内容提示：\n`;
    content += `● 案件所处的诉讼阶段：${caseData.stage}\n`;
    content += `● 上市公司所处的当事人地位：${caseData.defendant.includes('我司') ? '被告' : '原告'}\n`;
    content += `● 涉案的金额：人民币 ${(amount / 10000).toFixed(2)} 万元\n`;
    content += `● 对上市公司损益产生的影响：鉴于本案尚未审结，对公司本期利润或期后利润的影响存在不确定性。\n\n`;

    // Section II: Details with Smart Injection
    content += `一、本次诉讼受理的基本情况\n`;
    content += `    ${shortName}（以下简称“公司”）于近日收到${caseData.court || '相关法院'}送达的《应诉通知书》及相关法律文书，案号为${caseData.code}。根据《${exchangeName}股票上市规则》的有关规定，现将本次诉讼的相关情况公告如下。\n\n`;

    content += `二、有关本案的基本情况\n`;
    content += `    1. 原告/申请人：${caseData.plaintiff}\n`;
    content += `    2. 被告/被申请人：${caseData.defendant}\n`;
    content += `    3. 案由：${caseData.cause}\n`;
    
    content += `    4. 纠纷起因及依据：\n`;
    // NLP Simulation: Improve description text
    if (caseData.description) {
        const polishedDesc = caseData.description.replace(/我司/g, '公司').replace(/本公司/g, '公司');
        content += `    ${polishedDesc}\n`;
    } else {
        content += `    原告因与公司发生${caseData.cause}，向法院提起诉讼。原告认为公司未履行相关合同义务/法定义务，请求法院判令公司承担赔偿责任。\n`;
    }
    
    content += `\n    5. 诉讼请求：\n`;
    content += `    (1) 请求判令被告支付赔偿金/欠款人民币 ${(amount / 10000).toFixed(2)} 万元；\n`;
    content += `    (2) 请求判令被告承担本案全部诉讼费用。\n\n`;

    // Section III: Impact (Tone Adjustment)
    content += `三、本次诉讼对公司本期利润或期后利润等的影响\n`;
    
    if (caseData.riskLevel === RiskLevel.CRITICAL || isMaterial) {
        // Defensive Tone for Material Cases
        content += `    1. 本案涉案金额较大，占公司最近一期经审计净资产的 ${ratio.toFixed(2)}%。若公司败诉，将对公司本期利润或期后利润产生重大不利影响。\n`;
        content += `    2. 公司已聘请专业律师团队积极应诉，依法维护公司及股东的合法权益。公司认为原告的诉讼请求缺乏事实和法律依据（注：需律师确认）。\n`;
        content += `    3. 公司将根据案件进展情况，严格按照有关规定及时履行信息披露义务。\n`;
    } else {
        // Neutral Tone for Regular Cases
        content += `    鉴于本案尚未开庭审理（或尚未最终判决），其对公司本期利润或期后利润的影响存在不确定性。公司目前经营情况正常，本次诉讼未对公司日常经营产生重大影响。\n`;
        content += `    公司将依据企业会计准则的要求和实际情况进行相应的会计处理，具体会计处理及影响情况以审计机构年度审计确认后的结果为准。\n`;
    }
    content += `\n`;

    // Section IV: Risk Warning
    if (caseData.riskLevel === RiskLevel.CRITICAL) {
        content += `四、风险提示\n`;
        content += `    本次公告涉及的诉讼可能导致公司被实施“其他风险警示”或面临重大资产损失。敬请广大投资者理性投资，注意投资风险。\n\n`;
    }

    // Section V: Documents
    content += `五、备查文件\n`;
    content += `    1. 民事起诉状；\n`;
    content += `    2. ${caseData.court}受理/应诉通知书。\n\n`;

    content += `    特此公告。\n\n`;
    content += `    ${shortName}董事会\n`;
    content += `    ${dateStr}`;

    return content;
};

// New: Helper for Cumulative Reports
const generateCumulativeDraft = (lastCase: Case, shortName: string, dateStr: string): string => {
    const stockCode = lastCase.regulatoryAttrs?.securityCode || '600XXX';
    
    let content = `证券代码：${stockCode}           证券简称：${shortName}           公告编号：${new Date().getFullYear()}-099\n\n`;
    content += `${shortName}股份有限公司\n`;
    content += `关于累计涉及诉讼、仲裁的公告\n\n`;
    
    content += `本公司董事会及全体董事保证本公告内容不存在任何虚假记载、误导性陈述或者重大遗漏，并对其内容的真实性、准确性和完整性承担法律责任。\n\n`;

    content += `一、累计诉讼、仲裁事项的基本情况\n`;
    content += `    根据《上海证券交易所股票上市规则》有关规定，${shortName}（以下简称“公司”）对公司及控股子公司连续12个月内的诉讼、仲裁事项进行了统计。\n`;
    content += `    截至本公告披露日，公司及控股子公司连续12个月内累计发生的诉讼、仲裁事项涉案金额合计约为人民币 5,800 万元（注：模拟数据，需系统聚合），占公司最近一期经审计净资产的 1.16%。\n\n`;

    content += `二、累计诉讼、仲裁事项的具体情况\n`;
    content += `    具体情况统计如下表所示：\n`;
    content += `    (此处应插入 [TemplateFactory] 生成的 Excel 表格摘要)\n\n`;
    content += `    1. ${lastCase.title}，涉案金额：${(lastCase.regulatoryAttrs?.amountNoInterest || 0)/10000}万元，阶段：${lastCase.stage}。\n`;
    content += `    2. ... (其他案件摘要)\n\n`;

    content += `三、本次公告的诉讼、仲裁对公司本期利润或期后利润等的影响\n`;
    content += `    上述案件中，部分案件尚未开庭审理或尚未结案，其对公司本期利润或期后利润的影响存在不确定性。公司将依据会计准则的要求和实际情况进行相应的会计处理。\n\n`;

    content += `    特此公告。\n\n`;
    content += `    ${shortName}董事会\n`;
    content += `    ${dateStr}`;

    return content;
}
