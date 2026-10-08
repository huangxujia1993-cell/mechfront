#!/usr/bin/env node
// ============================================================
// fetch-sources.mjs — 按 config/sources.json 抓取信源，写入 data/inbox.json
// 支持：rss / webpage / json / push 四种（x / wechat 由专用采集器推送入箱）
// 用法：node scripts/fetch-sources.mjs [--limit N] [--only sourceId]
// 无第三方依赖：Node 18+ 内置 fetch
// ============================================================
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf("--" + name);
  return i >= 0 ? args[i + 1] : null;
};
const LIMIT = Number(flag("limit") || 0);
const ONLY = flag("only");

const sources = JSON.parse(readFileSync(resolve(ROOT, "config/sources.json"), "utf8")).sources;
const seenPath = resolve(ROOT, "data/seen.json");
const seen = existsSync(seenPath) ? new Set(JSON.parse(readFileSync(seenPath, "utf8"))) : new Set();

// ---------- RSS / Atom 解析（轻量正则版） ----------
function parseFeed(xml) {
  const items = [];
  const blocks = [...xml.matchAll(/<(?:item|entry)[\s\S]*?<\/(?:item|entry)>/g)].map(m => m[0]);
  for (const b of blocks) {
    const pick = (...tags) => {
      for (const t of tags) {
        const m = b.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`));
        if (m) return m[1].trim();
      }
      return "";
    };
    const linkM = b.match(/<link[^>]*href="([^"]+)"/) || b.match(/<link[^>]*>([^<]+)<\/link>/);
    const title = pick("title").replace(/<!\[CDATA\[|\]\]>/g, "");
    const date = pick("pubDate", "published", "updated", "dc:date");
    const desc = pick("description", "summary", "content")
      .replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 600);
    const url = (linkM && (linkM[1] || linkM[2]) || "").trim();
    if (title && url) items.push({ title, url, desc, publishedAt: date ? new Date(date).toISOString() : null });
  }
  return items;
}

// ---------- 网页列表解析（提取标题+链接） ----------
function parseWebpage(html, baseUrl) {
  const items = [];
  for (const m of html.matchAll(/<a[^>]+href="([^"#]+)"[^>]*>([\s\S]{6,160}?)<\/a>/g)) {
    const url = m[1], title = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (title.length < 12 || /^(https?:)?\/\//.test(title)) continue;
    if (/\.(css|js|png|jpg|svg|ico|pdf)$/i.test(url)) continue;
    let abs;
    try { abs = new URL(url, baseUrl).href; } catch { continue; }
    if (/placeholder\.invalid|javascript:|mailto:/.test(abs)) continue;
    items.push({ title, url: abs, publishedAt: null });
  }
  return items;
}

// ---------- 抓取 ----------
async function fetchSource(s) {
  if (s.type === "push") return { source: s, ok: true, items: [], note: "推送型信源，等待外部 POST /api/push" };
  if (s.type === "x" || s.type === "wechat") return { source: s, ok: true, items: [], note: "由专用采集器推送入箱（本脚本不直接抓取）" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(s.url, { signal: controller.signal, headers: { "user-agent": "MechFrontBot/1.0 (+https://huangxujia1993-cell.github.io/mechfront/)" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const text = await res.text();
    const items = s.type === "webpage" ? parseWebpage(text, s.url) : parseFeed(text);
    return { source: s, ok: true, items };
  } catch (err) {
    return { source: s, ok: false, items: [], note: String(err.message || err) };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- 主流程 ----------
const targets = sources.filter(s => s.enabled && (!ONLY || s.id === ONLY));
console.log(`机械前沿采集器 · ${new Date().toLocaleString("zh-CN")}`);
console.log(`目标信源 ${targets.length} / ${sources.length} 条${LIMIT ? `（限流 ${LIMIT} 条）` : ""}\n`);

const inbox = [];
let okCount = 0, failCount = 0;
for (const s of (LIMIT ? targets.slice(0, Number(LIMIT)) : targets)) {
  const r = await fetchSource(s);
  const fresh = r.items.filter(i => !seen.has(i.url));
  fresh.forEach(i => { seen.add(i.url); inbox.push({ ...i, sourceId: s.id, sourceName: s.name, tier: s.tier, type: s.type, fetchedAt: new Date().toISOString() }); });
  if (r.ok) okCount++; else failCount++;
  console.log(`${r.ok ? "✓" : "✗"} [${s.type}] ${s.name.padEnd(28)} 抓取 ${r.items.length} · 新增 ${fresh.length}${r.note ? " · " + r.note : ""}`);
}

writeFileSync(seenPath, JSON.stringify([...seen], null, 2), "utf8");
const inboxPath = resolve(ROOT, "data/inbox.json");
const prev = existsSync(inboxPath) ? JSON.parse(readFileSync(inboxPath, "utf8")) : [];
writeFileSync(inboxPath, JSON.stringify([...prev, ...inbox].slice(-2000), null, 2), "utf8");

console.log(`\n完成：${okCount} 成功 / ${failCount} 失败 · 本次新增 ${inbox.length} 条入箱（等待预筛与双评分）`);
console.log(`说明：入箱内容需经 LLM 流水线（config/prompts/）处理后才进入 data/news-data.js`);
