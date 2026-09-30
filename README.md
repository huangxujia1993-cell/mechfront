# 机械前沿 MechFront

参考 [AIHOT](https://github.com/KKKKhazix/AIHOT) 框架功能面搭建的**机械设计行业 × AI 前沿资讯站**。
AIHOT 的名字与 Logo 不在 MIT 许可范围内，本项目使用独立品牌「机械前沿 MechFront」。

## 功能对照（AIHOT → 本项目）

| AIHOT 功能 | 本项目实现 | 位置 |
|---|---|---|
| 六种信源（RSS/网页/JSON/X/公众号/脚本推送） | 信源配置 + 采集脚本 | `config/sources.json`、`scripts/fetch-sources.mjs` |
| 信源分级（官方/媒体/社区）与分级门槛 | 三级门槛 | `config/selection.js` |
| 预筛 → 双评分 → 写作 | 全套提示词 + 数据字段（scoreA/scoreB/summary/reason） | `config/prompts/` |
| 事件聚簇与后续进展时间线 | events + items（role: report/progress）+ 事件页综述 | `data/news-data.js`、`index.html#/event/:id` |
| 热度算法（48h 独立来源，24h 满权） | 前端实时计算，含趋势（上升/新/平稳） | `index.html` 热度函数 |
| 日报/周报/月报（分节带导语） | 4 期报告数据 + 报告页 | `index.html#/reports` |
| 主题页（公司/方向/形态） | 25 个主题自动归集 | `index.html#/topics` |
| 标题摘要搜索 + 全文搜索 | 两种模式即时搜索 | `index.html#/search` |
| Agent 出口（RSS/API/llms.txt） | 三件套 | `rss.xml`、`api/news.json`、`llms.txt` |
| 后台（信源/诊断/评测/换模型/预算熔断/运行记录） | 六个管理页签 | `admin.html` |
| 模型榜（AI 专属模块） | 行业不适用，开关关闭 | `config/site.js → features` |

## 快速开始

```bash
# 无需安装依赖，双击 index.html 即可离线浏览
# 或起个本地服务（推荐，方便调试）：
npx serve mechfront
```

数据为 2026-09-30 的调研快照：31 个事件、60+ 条报道，URL 均来自真实信源。

## 目录结构

```
mechfront/
├── index.html            # 主站（热点榜/精选/事件/报告/主题/搜索/关于）
├── admin.html            # 后台管理
├── rss.xml               # 精选 RSS（脚本生成）
├── llms.txt              # Agent 说明文件
├── api/
│   └── news.json         # 事件 API（脚本生成）
├── config/               # ★ 换行业/换品牌只改这里
│   ├── site.js           # 站名、文案、功能开关
│   ├── taxonomy.js       # 分类与主题
│   ├── selection.js      # 精选门槛与热度参数
│   ├── sources.json      # 信源清单（六种类型）
│   ├── sources.js        # ↑ 的 JS 包装（脚本生成，勿手改）
│   └── prompts/          # 预筛/评分/写作/聚簇 提示词原文
├── data/
│   ├── news-data.js      # 事件与报道数据（核心数据层）
│   ├── inbox.json        # 采集入箱（等待 LLM 处理）
│   └── seen.json         # 抓取去重表
└── scripts/
    ├── fetch-sources.mjs # 采集：抓信源 → 去重 → 入箱
    └── build-exports.mjs # 导出：数据 → rss.xml + api/news.json + sources.js
```

## 日常运转

```bash
# 1. 采集（可挂 crontab，如每小时）
node scripts/fetch-sources.mjs
#   可选：--only <sourceId> 单源试抓，--limit N 限流

# 2. LLM 流水线处理 inbox.json（预筛→双评分→写作→聚簇）
#    提示词在 config/prompts/，接入任一 OpenAI 兼容 API
#    （DeepSeek / 千问 / 智谱均可），处理后写回 data/news-data.js

# 3. 导出
node scripts/build-exports.mjs
```

已实测：`nvidia_blog` 信源真实抓取 18 条入箱；`robot_report` 返回 403 反爬被正确记录为失败（信源可换用其镜像或网页监控方式）。

## 换成你的行业

1. `config/site.js`：改站名、行业词、首页文案
2. `config/taxonomy.js`：改分类与主题（公司/方向/形态）
3. `config/sources.json`：换成你的信源（RSS 直接填；无 RSS 的官网用 webpage 类型监控列表页）
4. `config/prompts/selection-score.md`：**你的行业 KnowHere 写在这里**——什么消息才算重要
5. `config/selection.js`：按标注样本校准门槛

部署：任意静态托管（GitHub Pages / Vercel / Nginx）+ 一台定时跑脚本的机器即可；不需要数据库。

## 数据说明

- 快照中所有报道 URL 来自 2026-09-30 的公开网络调研，可点击核验
- 报道时间（publishedAt）保留到分钟，个别信源原文未标注日期的以 `datePrecision` 标注精度
- 评分（scoreA/scoreB）与推荐理由为演示数据结构；接入真实模型后由流水线生成
- 聚簇示例：达索虚拟伙伴事件（e07）含 4 条跨时间报道/进展，中望事件（e01）含 3 个独立来源
