#!/usr/bin/env node
// ============================================================
// build-exports.mjs — 从 data/news-data.js 生成对外出口：
//   1. rss.xml        精选 RSS（最近 20 条）
//   2. api/news.json  事件与报道 API
//   3. config/sources.js  信源配置的 JS 包装（供 index/admin 页面直读）
// 用法：node scripts/build-exports.mjs
// ============================================================
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await import(pathToFileURL(resolve(ROOT, "data/news-data.js")).href);
await import(pathToFileURL(resolve(ROOT, "config/site.js")).href);
const DATA = globalThis.NEWS_DATA;
const SITE = globalThis.SITE;
const sourcesJson = readFileSync(resolve(ROOT, "config/sources.json"), "utf8");

const escXml = s => String(s || "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[m]));
const rfc822 = iso => new Date(iso).toUTCString();

// ---------- 1. RSS ----------
const items = DATA.events.flatMap(e => e.items.filter(i => i.selected).map(i => ({ ...i, event: e })))
  .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)).slice(0, 20);
const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${escXml(SITE.name)} · 精选</title>
  <link>${SITE.url}/</link>
  <atom:link href="${SITE.url}/rss.xml" rel="self" type="application/rss+xml"/>
  <description>${escXml(SITE.description)}</description>
  <language>zh-CN</language>
  <lastBuildDate>${rfc822(DATA.generatedAt)}</lastBuildDate>
${items.map(i => `  <item>
    <title>${escXml(i.title)}</title>
    <link>${escXml(i.url)}</link>
    <guid isPermaLink="false">${escXml(i.id)}</guid>
    <pubDate>${rfc822(i.publishedAt)}</pubDate>
    <description>${escXml(i.summary + "\n推荐理由：" + i.reason)}</description>
    <category>${escXml(i.event.category)}</category>
  </item>`).join("\n")}
</channel>
</rss>
`;
writeFileSync(resolve(ROOT, "rss.xml"), rss, "utf8");

// ---------- 2. API ----------
mkdirSync(resolve(ROOT, "api"), { recursive: true });
const api = {
  site: { name: SITE.name, nameEn: SITE.nameEn, url: SITE.url, description: SITE.description, generatedAt: DATA.generatedAt },
  counts: { events: DATA.events.length, reports: DATA.reports.length, items: DATA.events.reduce((n, e) => n + e.items.length, 0) },
  events: DATA.events.map(e => ({
    id: e.id, title: e.title, overview: e.overview, category: e.category, tags: e.tags,
    firstSeen: e.firstSeen, lastSeen: e.lastSeen,
    items: e.items.map(i => ({ id: i.id, title: i.title, url: i.url, sourceName: i.sourceName, tier: i.tier, publishedAt: i.publishedAt, scoreA: i.scoreA, scoreB: i.scoreB, summary: i.summary })),
  })),
  reports: DATA.reports.map(r => ({ id: r.id, type: r.type, date: r.date, title: r.title, intro: r.intro })),
};
writeFileSync(resolve(ROOT, "api/news.json"), JSON.stringify(api, null, 2), "utf8");

// ---------- 3. sources.js 包装 ----------
writeFileSync(
  resolve(ROOT, "config/sources.js"),
  "// 本文件由 scripts/build-exports.mjs 从 config/sources.json 生成，请改 JSON 源文件\nwindow.SOURCES = " + sourcesJson + ";\n",
  "utf8"
);

console.log(`✓ rss.xml（${items.length} 条）  ✓ api/news.json（${api.counts.events} 事件 / ${api.counts.items} 报道）  ✓ config/sources.js`);
