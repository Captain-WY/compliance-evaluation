export interface NotificationItem {
  id: string;
  type: 'SYSTEM' | 'INSPECTION' | 'ASSESSMENT' | 'OTHER';
  title: string;
  time: string;
  content: string;
  isRead: boolean;
  iconKey: 'speaker' | 'checkCircle' | 'archive' | 'shieldAlert' | 'loader';
}

export const mockNotifications: NotificationItem[] = [
  {
    id: '1',
    type: 'SYSTEM',
    title: '《2026合规操作指引》更新通告',
    time: '2026-05-10 10:30',
    content: '基于近期诊断出的常见漏洞，现下发全系统通用的合规操作案例库，包含反洗钱、员工行为等5个大类的典型违规场景与防范建议，请各机构合规专员务必下载查阅并组织内部学习。附件包含详细的案例汇编PDF以及各业务条线的风险自查清单，请各部门负责人落实。同步下发的还有2026年度最新的合规考核评分标准修订说明。',
    isRead: false,
    iconKey: 'speaker',
  },
  {
    id: '2',
    type: 'INSPECTION',
    title: '现场检查底稿退回重派',
    time: '2026-05-09 16:45',
    content: '您提交的《反洗钱客户身份识别底稿》被复核人退回，意见：客户经理面签合影照片缺失，请于本周五前补充上传电子版以完成底稿封卷。',
    isRead: false,
    iconKey: 'shieldAlert',
  },
  {
    id: '3',
    type: 'INSPECTION',
    title: '申辩采纳通知：大额交易违规',
    time: '2026-05-08 14:30',
    content: '总部合规部已采纳您针对 [PRE-001] 的申辩理由，该问题等级已降级为低风险。',
    isRead: true,
    iconKey: 'checkCircle',
  },
  {
    id: '4',
    type: 'INSPECTION',
    title: '准予销号：员工违规外联',
    time: '2026-04-20 09:15',
    content: '您提交的整改材料已通过审核，该整改任务已正式闭环销号。',
    isRead: true,
    iconKey: 'archive',
  },
  {
    id: '5',
    type: 'ASSESSMENT',
    title: '考核季开启：Q2综合评价',
    time: '2026-04-01 08:00',
    content: '2026年度第二季度的机构网点合规打分即将开启，请各机构主管提前准备各项常规打分佐证并整理至指定共享文件夹...',
    isRead: true,
    iconKey: 'loader',
  }
];
