// reply.js — 步驟 D:讀 replies.json,逐則送出回覆,記錄到 replied.json
// 改用 FB Graph + Page Token 路徑
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const VERSION = process.env.GRAPH_API_VERSION || 'v22.0';
const BASE = `https://graph.facebook.com/${VERSION}`;

if (!TOKEN) {
  console.error('❌ 找不到 FB_PAGE_ACCESS_TOKEN,請先跑 node oauth.js');
  process.exit(1);
}

const repliesPath = path.join(__dirname, 'replies.json');
const repliedPath = path.join(__dirname, 'replied.json');

if (!fs.existsSync(repliesPath)) {
  console.error(`❌ 找不到 replies.json(${repliesPath})`);
  console.error('   請先讓 Claude 讀 pending.json 生成 replies.json');
  process.exit(1);
}

let replies;
try {
  replies = JSON.parse(fs.readFileSync(repliesPath, 'utf8'));
} catch (e) {
  console.error(`❌ replies.json 格式錯誤:${e.message}`);
  process.exit(1);
}

function loadReplied() {
  if (!fs.existsSync(repliedPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(repliedPath, 'utf8'));
  } catch {
    return {};
  }
}

function saveReplied(obj) {
  fs.writeFileSync(repliedPath, JSON.stringify(obj, null, 2), 'utf8');
}

function describeError(payload, httpStatus) {
  const err = payload?.error;
  if (!err) return `HTTP ${httpStatus} — ${JSON.stringify(payload)}`;
  const code = err.code;
  const msg = err.message || '';
  if (code === 190 || /access token/i.test(msg) || /OAuth/i.test(msg)) {
    return '🔑 Page Token 過期或無效,請重跑 node oauth.js 更新(後續回覆已中止)';
  }
  if (code === 4 || code === 17 || code === 32 || code === 613) {
    return `⏳ API 配額已用完,稍後再試(${msg})`;
  }
  if (code === 100) {
    return `🛑 參數錯誤:${msg}`;
  }
  if (code === 200 || code === 10) {
    return `🚫 權限不足:${msg}`;
  }
  if (code === 368) {
    return `🚫 被 IG 暫時限制(可能被判定為自動化,該帳號這幾分鐘不能再回覆):${msg}`;
  }
  return `❌ Facebook API 錯誤 (code=${code}):${msg}`;
}

async function postReply(commentId, message) {
  const url = `${BASE}/${commentId}/replies`;
  const body = new URLSearchParams({ message, access_token: TOKEN });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(describeError(data, res.status));
  return data;
}

function randomDelaySec() {
  return Math.floor(Math.random() * 61) + 30; // 30~90 含端點
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  const replied = loadReplied();
  const entries = Object.entries(replies);
  const todo = entries.filter(([id]) => !replied[id]);
  const skipped = entries.length - todo.length;

  if (todo.length === 0) {
    console.log(`✅ 沒有待送出的回覆(replies.json 共 ${entries.length} 則,全部已經回過了)`);
    return;
  }

  console.log(`📨 準備送出 ${todo.length} 則回覆(已跳過 ${skipped} 則先前送過的)`);
  console.log(`   透過 FB Graph,每則之間隨機等 30~90 秒,中途按 Ctrl+C 可安全停止\n`);

  for (let i = 0; i < todo.length; i++) {
    const [commentId, message] = todo[i];
    const idx = `[${i + 1}/${todo.length}]`;
    const preview = message.replace(/\s+/g, ' ').slice(0, 40);
    try {
      const result = await postReply(commentId, message);
      replied[commentId] = {
        replied_at: new Date().toISOString(),
        message,
        reply_id: result.id || null,
      };
      saveReplied(replied);

      const isLast = i === todo.length - 1;
      const wait = isLast ? 0 : randomDelaySec();
      console.log(`${idx} 留言 ${commentId} → ✅ 成功(「${preview}${preview.length >= 40 ? '…' : ''}」)${isLast ? '' : `,下次等 ${wait} 秒`}`);
      if (wait > 0) await sleep(wait * 1000);
    } catch (e) {
      console.error(`${idx} 留言 ${commentId} → ${e.message}`);
      // token 失效或配額用完就直接停止
      if (/Token 過期|配額|被 IG 暫時限制/.test(e.message)) {
        console.error('已中止後續回覆。修好問題後再執行 node reply.js 即可從剩下的繼續。');
        process.exit(1);
      }
      // 一般錯誤也等一下再繼續,避免連續打 API
      const wait = randomDelaySec();
      console.log(`   稍等 ${wait} 秒後繼續下一則`);
      await sleep(wait * 1000);
    }
  }

  console.log('\n🎉 全部完成!');
  console.log(`   已送出: ${todo.length} 則`);
  console.log(`   記錄檔: ${repliedPath}`);
})();
