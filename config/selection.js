// 精选门槛 —— 与 config/prompts/selection-score.md 配套使用
// 规则：同一资料由两个模型独立打分（scoreA / scoreB，0-100），
//       双双过线才入选；官方一手信源门槛略低（信息更可靠），媒体信源门槛更高。
globalThis.SELECTION = {
  tiers: {
    official: { label: "官方一手", minScore: 70, weight: 1.0 },
    media: { label: "媒体", minScore: 78, weight: 0.9 },
    community: { label: "社区/个人", minScore: 84, weight: 0.8 },
  },
  prefilter: {
    // 预筛直接淘汰：与机械设计无关的纯 AI 行业新闻、纯营销软文、招聘/活动通知
    dropKeywords: ["裁员", "招聘", "优惠券", "直播预告", "白皮书下载"],
    keepIfMentions: ["CAD", "CAE", "CAM", "机械", "工程设计", "仿真", "机器人", "工业软件", "制造", "拓扑", "装配", "制图"],
  },
  dedupWindow: 14, // 天：同一事件在两周内先找候选再聚簇
  heat: {
    windowHours: 48, // 热度统计窗口
    freshHours: 24, // 24 小时内的报道计满权，窗口内其余计半权
    perSource: 1, // 每个独立来源只计一次
  },
};
if (typeof module !== "undefined") module.exports = globalThis.SELECTION;
