// sweep.js — 從指定起始日期往後,一次掃出所有貼文「還沒回過的新留言」。
//            不帶參數則從很早開始(= 掃全部歷史貼文)。
// 用法: node sweep.js [起始ISO日期]   例: node sweep.js 2024-01-01T00:00:00+0000
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const IG_BIZ = process.env.IG_BUSINESS_ACCOUNT_ID;
const VERSION = process.env.GRAPH_API_VERSION || 'v22.0';
const BASE = `https://graph.facebook.com/${VERSION}`;
const SELF = (process.env.IG_USERNAME || '').toLowerCase();
const START = process.argv[2] || '2000-01-01T00:00:00+0000'; // 不帶參數 → 掃全部歷史
const startMs = new Date(START).getTime();

if (!TOKEN || !IG_BIZ) {
  console.error('❌ 缺 FB_PAGE_ACCESS_TOKEN 或 IG_BUSINESS_ACCOUNT_ID(先跑 node oauth.js)');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fbGetUrl(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data?.error;
    throw new Error(`code=${e?.code} ${e?.message || res.status}`);
  }
  return data;
}

function isEmojiOnly(text) {
  if (!text) return true;
  return !/[\p{L}\p{N}]/u.test(text);
}

function loadRepliedSet() {
  const p = path.join(__dirname, 'replied.json');
  if (!fs.existsSync(p)) return new Set();
  try {
    return new Set(Object.keys(JSON.parse(fs.readFileSync(p, 'utf8'))));
  } catch {
    return new Set();
  }
}

// skip.json = 決定「不回」的留言 id(亂碼/收尾語/導流連結等),要一併略過,
// 否則每次 sweep 都會把已決定跳過的留言重複列出來。檔案不存在時當作空的。
function loadSkipSet() {
  const p = path.join(__dirname, 'skip.json');
  if (!fs.existsSync(p)) return new Set();
  try {
    return new Set(Object.keys(JSON.parse(fs.readFileSync(p, 'utf8'))));
  } catch {
    return new Set();
  }
}

async function listMediaSince(cutMs) {
  const out = [];
  let url = (() => {
    const u = new URL(`${BASE}/${IG_BIZ}/media`);
    u.searchParams.set('fields', 'id,caption,timestamp,permalink,comments_count,like_count,media_type');
    u.searchParams.set('limit', '50');
    u.searchParams.set('access_token', TOKEN);
    return u.toString();
  })();
  let pages = 0, stop = false;
  while (url && pages < 15 && !stop) {
    pages++;
    const data = await fbGetUrl(url);
    for (const m of data.data || []) {
      if (new Date(m.timestamp).getTime() >= cutMs) out.push(m);
      else stop = true; // 列表新→舊,遇到早於起點即可停
    }
    url = stop ? null : data.paging?.next || null;
  }
  return out;
}

async function fetchComments(mediaId) {
  const all = [];
  let url = (() => {
    const u = new URL(`${BASE}/${mediaId}/comments`);
    u.searchParams.set('fields', 'id,username,text,timestamp,like_count,replies.limit(100){id,username,text,timestamp,like_count}');
    u.searchParams.set('limit', '50');
    u.searchParams.set('access_token', TOKEN);
    return u.toString();
  })();
  let page = 0;
  while (url && page < 40) {
    page++;
    const data = await fbGetUrl(url);
    if (Array.isArray(data.data)) all.push(...data.data);
    url = data.paging?.next || null;
  }
  const flat = [];
  for (const c of all) {
    flat.push(c);
    if (Array.isArray(c.replies?.data)) flat.push(...c.replies.data);
  }
  return flat;
}

(async () => {
  const replied = loadRepliedSet();
  const skip = loadSkipSet();
  const media = (await listMediaSince(startMs)).sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
  );
  console.log(`📅 起點 ${START} 之後共 ${media.length} 篇貼文。開始掃新留言(只列有待回的)...\n`);

  const results = [];
  let totalPending = 0, totalEmoji = 0;
  for (const m of media) {
    if ((m.comments_count ?? 0) === 0) continue;
    let flat;
    try {
      flat = await fetchComments(m.id);
    } catch (e) {
      console.log(`  ⚠️ ${(m.timestamp || '').slice(0, 10)} ${m.id} 抓留言失敗:${e.message}`);
      await sleep(800);
      continue;
    }
    const pending = [], emoji = [];
    for (const c of flat) {
      if (SELF && (c.username || '').toLowerCase() === SELF) continue;
      if (SELF && (c.text || '').toLowerCase().includes('@' + SELF)) continue;
      if (replied.has(c.id)) continue;
      if (skip.has(c.id)) continue;
      const entry = { id: c.id, username: c.username, text: c.text || '', timestamp: c.timestamp };
      if (isEmojiOnly(c.text)) emoji.push(entry);
      else pending.push(entry);
    }
    if (pending.length || emoji.length) {
      const cap = (m.caption || '').replace(/\s+/g, ' ').slice(0, 34);
      results.push({
        media_id: m.id,
        date: (m.timestamp || '').slice(0, 10),
        likes: m.like_count,
        caption: cap,
        permalink: m.permalink,
        comments: pending,
        emoji_only: emoji,
      });
      totalPending += pending.length;
      totalEmoji += emoji.length;
      console.log(`  📌 ${(m.timestamp || '').slice(0, 10)} 讚${String(m.like_count).padStart(5)} ｜待回 ${String(pending.length).padStart(2)} ｜emoji ${String(emoji.length).padStart(2)} ｜${cap}`);
    }
    await sleep(350);
  }

  fs.writeFileSync(
    path.join(__dirname, 'pending_sweep.json'),
    JSON.stringify({ start: START, swept_at: new Date().toISOString(), total_pending: totalPending, total_emoji: totalEmoji, posts: results }, null, 2),
    'utf8'
  );
  console.log(`\n✅ 掃完:${results.length} 篇有新留言 ｜ 待回 ${totalPending} 則 / emoji ${totalEmoji} 則 ｜ 已寫入 pending_sweep.json`);
})();
