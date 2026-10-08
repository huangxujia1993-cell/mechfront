#!/usr/bin/env node
// ============================================================
// run-pipeline.mjs — LLM 流水线：预筛 → 双评分 → 写作 → 聚簇 → 成刊
// 模型：DeepSeek（OpenAI 兼容接口）
//   预筛 / 评分 A / 写作 / 成刊：deepseek-chat
//   评分 B / 聚簇：deepseek-reasoner（与 A 不同模型，保证双评分独立）
// 用法：node scripts/run-pipeline.mjs [--limit N]
// 环境变量：DEEPSEEK_API_KEY 必填（本地放 .env，Actions 走 Secrets）
//           DEEPSEEK_BASE_URL / PIPELINE_MODEL_A / PIPELINE_MODEL_B 可选覆盖
// ============================================================
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ---------- 参数与 .env ----------
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : null; };
const LIMIT = Number(flag("limit") || 0);

(function loadEnv() {
  const p = resolve(ROOT, ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_]+)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
})();

const API_KEY = process.env.DEEPSEEK_API_KEY;
const BASE_URL = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
const MODEL_A = process.env.PIPELINE_MODEL_A || "deepseek-chat";
const MODEL_B = process.env.PIPELINE_MODEL_B || "deepseek-reasoner";

if (!API_KEY) {
  console.error("✗ 未配置 DEEPSEEK_API_KEY，流水线未运行。两种配置方式：");
  console.error("  本地运行：在 mechfront/.env 写入一行  DEEPSEEK_API_KEY=sk-xxx   （.env 已被 .gitignore 忽略）");
  console.error("  Actions：gh secret set DEEPSEEK_API_KEY -R huangxujia1993-cell/mechfront");
  process.exit(2);
}

// ---------- 数据加载 ----------
await import(pathToFileURL(resolve(ROOT, "data/news-data.js")).href);
await import(pathToFileURL(resolve(ROOT, "config/taxonomy.js")).href);
await import(pathToFileURL(resolve(ROOT, "config/selection.js")).href);
const DATA = globalThis.NEWS_DATA, TAX = globalThis.TAXONOMY, SEL = globalThis.SELECTION;
const SOURCES = JSON.parse(readFileSync(resolve(ROOT, "config/sources.json"), "utf8")).sources;
const SRC_BY_ID = Object.fromEntries(SOURCES.map(s => [s.id, s]));
const PROMPTS = Object.fromEntries(["selection-prefilter", "selection-score", "writing", "cluster"].map(k =>
  [k.split("-").pop(), readFileSync(resolve(ROOT, "config/prompts", k + ".md"), "utf8")]));

const inbox = JSON.parse(readFileSync(resolve(ROOT, "data/inbox.json"), "utf8"));
const statePath = resolve(ROOT, "data/pipeline-state.json");
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : { processed: {} };

const CAT_KEYS = TAX.categories.map(c => c.key);
const CAT_NAME = Object.fromEntries(TAX.categories.map(c => [c.key, c.name]));
const bjNow = () => new Date(Date.now() + 8 * 3600e3);
const bjISO = () => bjNow().toISOString().replace("Z", "+08:00");
const bjStamp = () => bjNow().toISOString().slice(0, 16).replace("T", " ");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------- LLM 客户端（含重试 / 用量统计） ----------
const usage = {}; // model -> {in, out, calls}
const PRICE = { "deepseek-chat": { in: 0.28, out: 0.42 }, "deepseek-reasoner": { in: 0.55, out: 2.19 } }; // $/百万token

async function llm(model, system, user, { json = true, maxTokens = 400, temperature } = {}) {
  const isReasoner = model.includes("reasoner");
  const body = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user + (json ? "\n\n只输出一个合法 JSON 对象，不要包裹其他文字。" : "") },
    ],
    max_tokens: maxTokens,
  };
  if (json && !isReasoner) body.response_format = { type: "json_object" };
  if (temperature !== undefined && !isReasoner) body.temperature = temperature;

  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 180000);
    try {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}（可重试）`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 180)}`);
      const data = await res.json();
      const u = usage[model] || (usage[model] = { in: 0, out: 0, calls: 0 });
      u.in += data.usage?.prompt_tokens || 0;
      u.out += data.usage?.completion_tokens || 0;
      u.calls++;
      const content = data.choices?.[0]?.message?.content || "";
      if (!json) return content.trim();
      const m = content.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("输出中未找到 JSON");
      return JSON.parse(m[0]);
    } catch (e) {
      lastErr = e;
      if (attempt < 3) await sleep(attempt * 5000);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

// ---------- 并发池 ----------
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0, done = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]).catch(e => ({ __error: String(e.message || e) }));
      if (++done % 25 === 0) console.log(`    … ${done}/${items.length}`);
    }
  });
  await Promise.all(workers);
  return out;
}

// ---------- 编号工具 ----------
function nextEventId() {
  let max = 0;
  for (const e of DATA.events) max = Math.max(max, Number(e.id.replace(/^e/, "")) || 0);
  return "e" + String(max + 1).padStart(2, "0");
}
function nextItemId(eventId) {
  const ev = DATA.events.find(e => e.id === eventId);
  const num2 = eventId.replace(/^e/, "").padStart(2, "0");
  let max = 0;
  for (const it of (ev ? ev.items : [])) {
    if (it.id.startsWith("i" + num2)) max = Math.max(max, Number(it.id.slice(3)) || 0);
  }
  return "i" + num2 + String(max + 1).padStart(2, "0");
}
function clusterCandidates() {
  const cutoff = Date.now() - (SEL.dedupWindow || 14) * 86400e3;
  const recent = DATA.events
    .filter(e => new Date(e.lastSeen).getTime() >= cutoff)
    .sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen))
    .slice(0, 8);
  return recent.map(e => ({ id: e.id, 标题: e.title, 概述: String(e.overview || "").slice(0, 180) }));
}

// ---------- 主流程 ----------
console.log(`机械前沿 LLM 流水线 · 北京时间 ${bjStamp()}`);
console.log(`模型：评分A/预筛/写作 = ${MODEL_A} · 评分B/聚簇 = ${MODEL_B}\n`);

const pending = inbox.filter(x => x.url && !state.processed[x.url]);
const batch = LIMIT ? pending.slice(0, LIMIT) : pending.slice(0, 800);
console.log(`入箱 ${inbox.length} 条 · 待处理 ${pending.length} 条 · 本次处理 ${batch.length} 条\n`);
if (!batch.length) { console.log("无待处理内容，结束。"); process.exit(0); }

const newEventIds = [];      // 本次新建的事件 id
const addedItems = [];       // { itemId, eventId, category }
let preRejected = 0, scoreRejected = 0, errors = 0, merged = 0, created = 0;
let reportNote = "无新增，未出刊";

// ---- 1. 预筛 ----
console.log("① 预筛 …");
const preResults = await pool(batch, 8, async (it) => {
  const r = await llm(MODEL_A, PROMPTS.prefilter,
    JSON.stringify({ 标题: it.title, 来源: it.sourceName, 简介: (it.desc || "").slice(0, 400) }),
    { maxTokens: 80, temperature: 0 });
  return (r.pass === true || r.pass === "true") ? it : null;
});
const prePassed = [];
preResults.forEach((r, i) => {
  const it = batch[i];
  if (!r) { state.processed[it.url] = { stage: "prefilter_rejected", at: bjISO() }; preRejected++; }
  else if (r.__error) { state.processed[it.url] = { stage: "error", at: bjISO(), step: "prefilter", msg: r.__error }; errors++; }
  else prePassed.push(it);
});
console.log(`  通过 ${prePassed.length} · 淘汰 ${preRejected} · 异常 ${errors}\n`);

// ---- 2. 双评分 ----
console.log("② 双评分（chat + reasoner 独立打分）…");
const scoreResults = await pool(prePassed, 8, async (it) => {
  const tier = SRC_BY_ID[it.sourceId]?.tier || "media";
  const payload = JSON.stringify({
    标题: it.title, 来源: `${it.sourceName}（${SEL.tiers[tier].label}）`, 简介: (it.desc || "").slice(0, 600),
  });
  const [a, b] = await Promise.all([
    llm(MODEL_A, PROMPTS.score, payload, { maxTokens: 250, temperature: 0 }),
    llm(MODEL_B, PROMPTS.score, payload, { maxTokens: 500 }),
  ]);
  return { it, tier, a: Number(a.score) || 0, b: Number(b.score) || 0, whyA: a.reason, whyB: b.reason, keyFact: a.keyFact || b.keyFact || "" };
});
const scored = [];
scoreResults.forEach(r => {
  if (r.__error) { state.processed[r.it.url] = { stage: "error", at: bjISO(), step: "score", msg: r.__error }; errors++; return; }
  const min = SEL.tiers[r.tier].minScore;
  if (r.a >= min && r.b >= min) scored.push(r);
  else { state.processed[r.it.url] = { stage: "score_rejected", at: bjISO(), a: r.a, b: r.b, min }; scoreRejected++; }
});
console.log(`  双双过线 ${scored.length} · 未过线 ${scoreRejected}\n`);
if (!scored.length) { saveAll([]); process.exit(0); }

// ---- 3. 写作 ----
console.log("③ 中文写作 …");
const writeResults = await pool(scored, 8, async (r) => {
  const w = await llm(MODEL_A, PROMPTS.write, JSON.stringify({
    原标题: r.it.title, 来源: r.it.sourceName, 简介: (r.it.desc || "").slice(0, 800),
    评分理由A: r.whyA, 评分理由B: r.whyB, 关键事实: r.keyFact,
    可选分类: CAT_KEYS.join(" / "),
  }), { maxTokens: 700, temperature: 0.3 });
  return { ...r, w };
});
console.log(`  完成 ${writeResults.length} 条\n`);

// ---- 4. 聚簇 ----
console.log("④ 事件聚簇 …");
const clusterResults = await pool(writeResults, 6, async (r) => {
  if (r.__error) return r;
  const c = await llm(MODEL_B, PROMPTS.cluster, JSON.stringify({
    新资料: { 标题: r.w.title || r.it.title, 摘要: (r.w.summary || "").slice(0, 200) },
    候选事件: clusterCandidates().concat(
      newEventIds.map(id => { const e = DATA.events.find(x => x.id === id); return { id, 标题: e.title, 概述: String(e.overview).slice(0, 180) }; })
    ),
  }), { maxTokens: 400 });
  return { ...r, c };
});

const nowISO = bjISO();
for (const r of clusterResults) {
  if (r.__error) { state.processed[r.it.url] = { stage: "error", at: nowISO, step: "write_cluster", msg: r.__error }; errors++; continue; }
  const w = r.w, it = r.it, c = r.c || {};
  const tags = Array.isArray(w.tags) ? w.tags.slice(0, 4).map(String) : [];
  let category = CAT_KEYS.includes(w.category) ? w.category : guessCategory(w.title + " " + (w.summary || ""));

  const rel = c.relation, conf = Number(c.confidence) || 0;
  let target = null, role = "report";
  if ((rel === "same_event" || rel === "follow_up") && conf >= 0.55) {
    target = DATA.events.find(e => e.id === c.eventId);
    if (target) { role = rel === "follow_up" ? "progress" : "report"; merged++; }
  }
  if (!target) {
    const eid = nextEventId();
    target = {
      id: eid, category, title: w.title || it.title, overview: w.summary || "",
      tags, firstSeen: nowISO, lastSeen: nowISO,
      importance: Math.round((r.a + r.b) / 2), prevHeat: 0, items: [],
    };
    DATA.events.push(target);
    newEventIds.push(eid);
    created++;
  } else {
    target.lastSeen = nowISO;
  }

  const itemId = nextItemId(target.id);
  target.items.push({
    id: itemId, role,
    title: w.title || it.title,
    url: it.url,
    sourceId: it.sourceId, sourceName: it.sourceName, tier: r.tier,
    publishedAt: it.publishedAt || it.fetchedAt || nowISO,
    scoreA: r.a, scoreB: r.b, selected: true,
    summary: w.summary || "", reason: w.reason || "",
    body: (it.desc || "").slice(0, 1200),
  });
  state.processed[it.url] = { stage: "selected", at: nowISO, eventId: target.id, itemId };
  addedItems.push({ itemId, eventId, category: target.category });
}
console.log(`  并入既有事件 ${merged} · 新建事件 ${created} · 异常 ${errors}\n`);

// ---- 5. 成刊（日报）----
if (addedItems.length) {
  const today = bjNow().toISOString().slice(0, 10);
  const reportId = `daily-${today}`;
  if (DATA.reports.some(r => r.id === reportId)) {
    reportNote = `今日日报已存在（${reportId}），跳过出刊`;
  } else {
    const issue = Math.max(0, ...DATA.reports.filter(r => r.type === "daily").map(r => r.issue)) + 1;
    let intro = "";
    try {
      const evList = addedItems.map(a => { const e = DATA.events.find(x => x.id === a.eventId); return `- ${e.title}：${String(e.overview).slice(0, 100)}`; }).join("\n");
      intro = await llm(MODEL_A,
        "你是机械设计行业资讯站的编辑。根据今天流水线新入选的事件写日报导语：2-3 句，先点出最重要的两三件事，再说清它们对机械设计师的意义。直接输出导语正文，不要标题和格式符号。",
        `今天新增事件：\n${evList}`, { json: false, maxTokens: 350, temperature: 0.5 });
    } catch (e) { intro = "今日流水线新增 " + addedItems.length + " 条精选报道，详见各分类分节。"; }
    const sections = [];
    for (const cat of CAT_KEYS) {
      const ids = addedItems.filter(a => a.category === cat).map(a => a.itemId);
      if (ids.length) sections.push({ category: cat, title: CAT_NAME[cat], items: ids, note: "" });
    }
    DATA.reports.unshift({ id: reportId, type: "daily", issue, date: today, title: `机械前沿日报 · 第 ${issue} 期`, intro, sections });
    reportNote = `日报第 ${issue} 期出刊，收录 ${addedItems.length} 条，分 ${sections.length} 节`;
  }
}
console.log(`⑤ 成刊：${reportNote}\n`);

saveAll(addedItems);

// ---------- 保存 ----------
function guessCategory(text) {
  const t = String(text);
  if (/仿真|CAE|CFD|求解|PhysicsAI|SimAI|降阶|代理模型/.test(t)) return "cae";
  if (/机器人|具身|人形|GR00T|Isaac|Optimus/.test(t)) return "robotics";
  if (/论文|arXiv|基准|数据集|SIGGRAPH|NeurIPS/.test(t)) return "research";
  if (/融资|收购|上市|IPO|展会|博览会|工博会/.test(t)) return "market";
  if (/大模型|数字孪生|工厂|产线|政策/.test(t)) return "industrial";
  return "cad";
}

function saveAll(added) {
  // 运行记录
  const totalTokens = Object.values(usage).reduce((n, u) => n + u.in + u.out, 0);
  DATA.runs.unshift({ time: bjStamp(), task: "流水线", status: errors ? "warn" : "ok",
    detail: `处理 ${batch.length}：预筛通过 ${prePassed.length}，双评分入选 ${scored.length}，新事件 ${created}，并入 ${merged}，异常 ${errors}；${reportNote}` });

  // 预算累计
  if (added.length || prePassed.length) {
    const inM = Object.entries(usage).reduce((n, [m, u]) => n + u.in / 1e6 * (PRICE[m]?.in ?? 0.3), 0);
    const outM = Object.entries(usage).reduce((n, [m, u]) => n + u.out / 1e6 * (PRICE[m]?.out ?? 0.5), 0);
    DATA.budget.tokenUsedMillion = Math.round((DATA.budget.tokenUsedMillion + totalTokens / 1e6) * 10) / 10;
    DATA.budget.costUsd = Math.round((DATA.budget.costUsd + inM + outM) * 100) / 100;
    DATA.diagnostics.pipeline.fetched7d += batch.length;
    DATA.diagnostics.pipeline.selected7d += added.length;
    DATA.diagnostics.pipeline.clusterEvents7d += created;
  }
  DATA.generatedAt = bjISO();

  writeFileSync(resolve(ROOT, "data/news-data.js"),
    `// 此文件由 scripts/run-pipeline.mjs 自动生成（${bjStamp()} 北京时间）\n` +
    `// 手工修改会被下次流水线运行覆盖；调整分类/门槛/信源请改 config/ 目录\n` +
    `globalThis.NEWS_DATA = ${JSON.stringify(DATA, null, 2)};\n` +
    `if (typeof module !== "undefined") module.exports = globalThis.NEWS_DATA;\n`, "utf8");
  writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");

  // 摘要
  console.log("──────────────────────────────");
  console.log(`模型调用：${Object.entries(usage).map(([m, u]) => `${m} ×${u.calls}（${((u.in + u.out) / 1e3).toFixed(1)}K tokens）`).join(" · ")}`);
  console.log(`本次用量：${(totalTokens / 1e6).toFixed(2)}M tokens · 约合 $${(Object.entries(usage).reduce((n, [m, u]) => n + u.in / 1e6 * (PRICE[m]?.in ?? 0.3) + u.out / 1e6 * (PRICE[m]?.out ?? 0.5), 0)).toFixed(2)}`);
  console.log(`入选 ${added.length} 条已写入 data/news-data.js · 运行 node scripts/build-exports.mjs 生成 RSS/API`);
  if (errors) console.log(`⚠ 异常 ${errors} 条已记录（data/pipeline-state.json），下轮不再重试`);
}
