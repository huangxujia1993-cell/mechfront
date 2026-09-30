// 站点基础配置 —— 改这里即可换品牌，无需动代码
globalThis.SITE = {
  name: "机械前沿",
  nameEn: "MechFront",
  tagline: "AI 正在重塑机械设计",
  description: "每天从全球信源收集 AI × 机械设计的最新动态，双评分精选、事件聚簇、按独立来源计算热度，每天早上 8 点出一份日报。",
  industry: "机械设计",
  industryWords: ["CAD", "CAE", "CAM", "生成式设计", "拓扑优化", "具身智能", "工业软件", "数字孪生"],
  url: "https://huangxujia1993-cell.github.io/mechfront", // 部署后替换为真实域名
  timezone: "Asia/Shanghai",
  reportSchedule: { daily: "每天 08:00", weekly: "每周一 08:30", monthly: "每月 1 日 09:00" },
  // AI 专属模块（模型榜 / 新模型监控）对本行业默认关闭
  features: { leaderboard: false, modelWatch: false },
  footer: "机械前沿 MechFront · 参考 AIHOT 框架搭建的行业资讯站 · 数据为 2026-09-30 调研快照",
};
if (typeof module !== "undefined") module.exports = globalThis.SITE;
