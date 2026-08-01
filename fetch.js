// fetch.js — 步驟 B:抓某篇貼文的留言,過濾掉已回過的,寫出 pending.json
// 改用 FB Graph + Page Token 路徑
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const VERSION = process.env.GRAPH_API_VERSION || 'v22.0';
const BASE = `https://graph.facebook.com/${VERSION}`;
const SELF = (process.env.IG_USERNAME || '').toLowerCase(); // 自己帳號,要跳過自己的留言/回覆

const mediaId = process.argv[2];
if (!mediaId) {
  console.error('❌ 缺少貼文編號參數');
  console.error('   用法: node fetch.js <media_id>');
  console.error('   貼文編號從 test.js 的輸出可以找到');
  process.exit(1);
}
if (!TOKEN) {
  console.error('❌ 找不到 FB_PAGE_ACCESS_TOKEN,請先跑 node oauth.js');
  process.exit(1);
}

function describeError(payload, httpStatus) {
  const err = payload?.error;
  if (!err) return `HTTP ${httpStatus} — ${JSON.stringify(payload)}`;
  const code = err.code;
  const msg = err.message || '';
  if (code === 190 || /access token/i.test(msg) || /OAuth/i.test(msg)) {
    return '🔑 Page Token 過期或無效,請重跑 node oauth.js 更新';
  }
  if (code === 4 || code === 17 || code === 32 || code === 613) {
    return `⏳ API 配額已用完,稍後再試(${msg})`;
  }
  if (code === 100) {
    return `🛑 參數錯誤:${msg}(請確認貼文編號正確,是你 IG 商業帳號的貼文)`;
  }
  if (code === 200 || code === 10) {
    return `🚫 權限不足:${msg}`;
  }
  return `❌ Facebook API 錯誤 (code=${code}):${msg}`;
}

async function fbGetUrl(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(describeError(data, res.status));
  return data;
}

async function fbGet(pathPart, params = {}) {
  const url = new URL(`${BASE}${pathPart}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', TOKEN);
  return fbGetUrl(url.toString());
}

// 規則:文字內若沒有任何 Unicode 字母 \p{L} 也沒有任何數字 \p{N},就算 emoji_only
function isEmojiOnly(text) {
  if (!text) return true;
  return !/[\p{L}\p{N}]/u.test(text);
}

function loadRepliedSet() {
  const p = path.join(__dirname, 'replied.json');
  if (!fs.existsSync(p)) return new Set();
  try {
    const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
    return new Set(Object.keys(obj));
  } catch (e) {
    console.warn(`⚠️  replied.json 讀取失敗,當作空的處理:${e.message}`);
    return new Set();
  }
}

// skip.json:決定「不回」的留言 id(收尾語/垃圾連結/亂碼),掃描時一律略過,不再重複跳出來洗版
function loadSkipSet() {
  const p = path.join(__dirname, 'skip.json');
  if (!fs.existsSync(p)) return new Set();
  try {
    return new Set(Object.keys(JSON.parse(fs.readFileSync(p, 'utf8'))));
  } catch (e) {
    console.warn(`⚠️  skip.json 讀取失敗,當作空的處理:${e.message}`);
    return new Set();
  }
}

// 用 /{ig-biz}/media 列表找 metadata(因為直接 GET /{media_id} 有時會回 #10 權限不足)
const IG_BIZ = process.env.IG_BUSINESS_ACCOUNT_ID;

async function getPostMeta(id) {
  if (!IG_BIZ) {
    console.warn('⚠️  .env 沒有 IG_BUSINESS_ACCOUNT_ID,跳過 metadata 查詢');
    return { id, caption: '', timestamp: null, permalink: null, comments_count: null };
  }
  let nextUrl = (() => {
    const u = new URL(`${BASE}/${IG_BIZ}/media`);
    u.searchParams.set(
      'fields',
      'id,caption,timestamp,permalink,comments_count,like_count,media_type,is_shared_to_feed'
    );
    u.searchParams.set('limit', '50');
    u.searchParams.set('access_token', TOKEN);
    return u.toString();
  })();
  let pages = 0;
  while (nextUrl && pages < 10) {
    pages++;
    const data = await fbGetUrl(nextUrl);
    const found = (data.data || []).find((m) => m.id === id);
    if (found) return found;
    nextUrl = data.paging?.next || null;
  }
  console.warn(`⚠️  在 /me/media 前 ${pages} 頁中找不到 ${id}(可能是太舊的貼文),用空 metadata 繼續`);
  return { id, caption: '', timestamp: null, permalink: null, comments_count: null };
}

(async () => {
  console.log(`🔍 抓取貼文 ${mediaId} 的內容與留言(透過 FB Graph)...`);
  try {
    const post = await getPostMeta(mediaId);
    if (post.is_shared_to_feed === false) {
      console.log('   ℹ️  這是「試驗連續短片」(is_shared_to_feed=false)');
    }

    const replied = loadRepliedSet();
    const skip = loadSkipSet();
    const allComments = [];

    const firstUrl = new URL(`${BASE}/${mediaId}/comments`);
    firstUrl.searchParams.set('fields', 'id,username,text,timestamp,like_count,replies.limit(100){id,username,text,timestamp,like_count}');
    firstUrl.searchParams.set('limit', '50');
    firstUrl.searchParams.set('access_token', TOKEN);
    let nextUrl = firstUrl.toString();

    let page = 0;
    while (nextUrl) {
      page++;
      const data = await fbGetUrl(nextUrl);
      if (Array.isArray(data.data)) allComments.push(...data.data);
      nextUrl = data.paging?.next || null;
      if (page > 50) {
        console.warn('⚠️  分頁超過 50 頁,停止抓取以避免無限迴圈');
        break;
      }
    }

    // 展開巢狀回覆(有人回覆別人的留言也要抓,才不漏);記住每則的「回覆對象=最上層留言的作者」
    const flat = [];
    for (const c of allComments) {
      flat.push({ c, parent: null });
      if (Array.isArray(c.replies?.data)) {
        const pu = (c.username || '').toLowerCase();
        for (const r of c.replies.data) flat.push({ c: r, parent: pu });
      }
    }

    const pending = [];
    const emojiOnly = [];
    let skipped = 0;
    let ownSkipped = 0;
    for (const { c, parent } of flat) {
      if (SELF && (c.username || '').toLowerCase() === SELF) {
        ownSkipped++; // 自己帳號的留言/回覆(收官語、引導提問、已回的回覆)不算待回覆
        continue;
      }
      if (replied.has(c.id)) {
        skipped++;
        continue;
      }
      if (skip.has(c.id)) {
        skipped++; // 已決定不回(收尾語/垃圾/亂碼),略過不再顯示
        continue;
      }
      // 去掉開頭 IG 自動帶的 @本帳號,拿到真正內容(可能是空/貼圖、表情、或文字)
      const cleanText = SELF ? (c.text || '').replace(new RegExp('@' + SELF, 'ig'), '').trim() : (c.text || '');
      // 「回覆對象是我們自己(含你置頂的留言、收官語、引導提問)」→ 對我們的直接互動,一律要回(連貼圖/表情都回)。
      const isReplyToUs = SELF && parent === SELF;
      if (!isReplyToUs && SELF && (c.text || '').toLowerCase().includes('@' + SELF) && isEmojiOnly(cleanText)) {
        // 只有「在別人自己的留言串裡回我們的回覆、又只剩表情」→ 愛心反覆,讓對話自然結束。
        ownSkipped++;
        continue;
      }
      const entry = {
        id: c.id,
        username: c.username,
        text: cleanText,
        timestamp: c.timestamp,
        like_count: c.like_count ?? 0,
      };
      if (isEmojiOnly(cleanText)) emojiOnly.push(entry);
      else pending.push(entry);
    }

    const output = {
      media_id: post.id,
      post_caption: post.caption || '',
      post_timestamp: post.timestamp,
      post_permalink: post.permalink,
      fetched_at: new Date().toISOString(),
      stats: {
        total_comments: flat.length,
        already_replied: skipped,
        pending: pending.length,
        emoji_only: emojiOnly.length,
      },
      comments: pending,
      emoji_only: emojiOnly,
    };

    const outPath = path.join(__dirname, 'pending.json');
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');

    // 記錄已抓過的 media,給 test.js 標示用
    const procPath = path.join(__dirname, 'processed_media.json');
    const proc = fs.existsSync(procPath) ? JSON.parse(fs.readFileSync(procPath, 'utf8')) : {};
    proc[mediaId] = {
      fetched_at: new Date().toISOString(),
      total_comments: allComments.length,
      pending: pending.length,
      emoji_only: emojiOnly.length,
      already_replied: skipped,
      caption_preview: (post.caption || '').replace(/\s+/g, ' ').slice(0, 80),
    };
    fs.writeFileSync(procPath, JSON.stringify(proc, null, 2), 'utf8');

    console.log('');
    console.log(`✅ 已寫入 ${outPath}`);
    console.log(`   貼文說明  : ${(post.caption || '(無)').replace(/\s+/g, ' ').slice(0, 80)}`);
    console.log(`   API 抓到  : ${flat.length} 則(含回覆串)`);
    console.log(`   已回過   : ${skipped} 則`);
    console.log(`   待回覆   : ${pending.length} 則`);
    console.log(`   純表情符號: ${emojiOnly.length} 則(列在 emoji_only,自己手動處理)`);
    if (post.comments_count != null && post.comments_count !== allComments.length) {
      console.log(`   ℹ️  貼文公開留言計數 ${post.comments_count}(可能含被 IG 過濾的垃圾留言)`);
    }
    console.log('');
    console.log('👉 下一步:回 Claude 對話,跟他說「幫我讀 pending.json,生成 replies.json」');
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
})();
