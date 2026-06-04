// test.js — 步驟 A:用 Page Token 抓 IG 帳號最近幾篇貼文,確認憑證有效
// 升級版:自動偵測「同一影片發兩次」配對 + 標示哪些已處理過
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const IG_BIZ = process.env.IG_BUSINESS_ACCOUNT_ID;
const IG_USER = process.env.IG_USERNAME || '(未知)';
const VERSION = process.env.GRAPH_API_VERSION || 'v22.0';
const BASE = `https://graph.facebook.com/${VERSION}`;
const LIMIT = Number(process.argv[2] || 15);
const PAIR_WINDOW_MS = 10 * 60 * 1000; // 10 分鐘內視為同一支影片的兩個版本

if (!TOKEN) {
  console.error('❌ 找不到 FB_PAGE_ACCESS_TOKEN');
  console.error('   請先執行 node oauth.js 走 FB Login flow 拿 token');
  process.exit(1);
}
if (!IG_BIZ) {
  console.error('❌ 找不到 IG_BUSINESS_ACCOUNT_ID,請重跑 oauth.js');
  process.exit(1);
}

function describeError(payload, httpStatus) {
  const err = payload?.error;
  if (!err) return `HTTP ${httpStatus} — ${JSON.stringify(payload)}`;
  const code = err.code;
  const msg = err.message || '';
  if (code === 190 || /access token/i.test(msg) || /OAuth/i.test(msg)) {
    return '🔑 Page Token 過期或無效。請重新執行 node oauth.js 拿新 token。';
  }
  if (code === 4 || code === 17 || code === 32 || code === 613) {
    return `⏳ API 配額已用完,稍後再試(${msg})`;
  }
  if (code === 200 || code === 10) {
    return `🚫 權限不足:${msg}`;
  }
  return `❌ Facebook API 錯誤 (code=${code}):${msg}`;
}

async function fbGet(p, params = {}) {
  const url = new URL(`${BASE}${p}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', TOKEN);
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(describeError(data, res.status));
  return data;
}

function looksLikePair(a, b) {
  if (a.media_type !== 'VIDEO' || b.media_type !== 'VIDEO') return false;
  const t1 = new Date(a.timestamp).getTime();
  const t2 = new Date(b.timestamp).getTime();
  if (Math.abs(t1 - t2) > PAIR_WINDOW_MS) return false;
  // 文案前 50 字相同 → 幾乎確定是同一支影片
  const c1 = (a.caption || '').replace(/\s+/g, '').slice(0, 50);
  const c2 = (b.caption || '').replace(/\s+/g, '').slice(0, 50);
  return c1.length > 0 && c1 === c2;
}

function fmtPost(p, processed) {
  const tag = processed[p.id] ? '✅' : '⬜';
  const c = p.comments_count ?? 0;
  const l = p.like_count ?? 0;
  const t = (p.timestamp || '').slice(0, 16).replace('T', ' ');
  const cap = (p.caption || '(無)').replace(/\s+/g, ' ').slice(0, 50);
  const type = p.media_type.padEnd(5);
  return `${tag} ${p.id}  ${type}  留言 ${String(c).padStart(3)} / 讚 ${String(l).padStart(4)}  ${t}\n     ${cap}${cap.length >= 50 ? '…' : ''}\n     ${p.permalink}`;
}

(async () => {
  console.log(`🔍 用 Page Token 連線 Facebook Graph(IG 帳號:@${IG_USER})\n`);

  // 讀取已處理過的 media 清單
  const procPath = path.join(__dirname, 'processed_media.json');
  const processed = fs.existsSync(procPath)
    ? JSON.parse(fs.readFileSync(procPath, 'utf8'))
    : {};

  try {
    const me = await fbGet(`/${IG_BIZ}`, {
      fields: 'id,username,name,followers_count,media_count',
    });
    console.log(`✅ 連線成功 @${me.username}(${me.name || ''})— 追蹤者 ${me.followers_count} / 貼文 ${me.media_count}\n`);

    const media = await fbGet(`/${IG_BIZ}/media`, {
      fields: 'id,caption,timestamp,media_type,permalink,comments_count,like_count',
      limit: LIMIT,
    });

    if (!media.data || media.data.length === 0) {
      console.log('（這個帳號目前沒有任何貼文）');
      return;
    }

    // 偵測配對(同一支影片發兩次)
    const sorted = [...media.data].sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );
    const paired = new Set();
    const pairs = [];
    for (let i = 0; i < sorted.length; i++) {
      if (paired.has(sorted[i].id)) continue;
      for (let j = i + 1; j < sorted.length; j++) {
        if (paired.has(sorted[j].id)) continue;
        if (looksLikePair(sorted[i], sorted[j])) {
          pairs.push([sorted[i], sorted[j]]);
          paired.add(sorted[i].id);
          paired.add(sorted[j].id);
          break;
        }
      }
    }
    const singles = sorted.filter((m) => !paired.has(m.id));

    console.log(`📸 最近 ${sorted.length} 篇 — 圖例: ✅ 已抓過 / ⬜ 還沒\n`);

    if (pairs.length > 0) {
      console.log(`🎬 配對影片(同一支發兩次,${pairs.length} 組):\n`);
      pairs.forEach((pair, idx) => {
        const captionHint = (pair[0].caption || '').replace(/\s+/g, ' ').slice(0, 30);
        console.log(`[#${idx + 1}] ${captionHint}…`);
        console.log(`  ${fmtPost(pair[0], processed)}\n`);
        console.log(`  ${fmtPost(pair[1], processed)}`);
        const bothDone = processed[pair[0].id] && processed[pair[1].id];
        const oneDone = processed[pair[0].id] || processed[pair[1].id];
        if (bothDone) console.log(`  ➡️  整對處理完成 ✅`);
        else if (oneDone) console.log(`  ➡️  還有一支沒抓 ⚠️`);
        else console.log(`  ➡️  兩支都還沒抓`);
        console.log('');
      });
    }

    if (singles.length > 0) {
      console.log(`📷 單獨貼文(${singles.length} 篇):\n`);
      for (const p of singles) {
        console.log(`${fmtPost(p, processed)}\n`);
      }
    }

    // 統計
    const totalProcessed = Object.keys(processed).length;
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📊 本機紀錄 ${totalProcessed} 篇已抓過(processed_media.json)`);
    console.log(`👉 想處理哪篇就執行: node fetch.js <media_id>`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
})();
