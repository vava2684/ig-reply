// oauth.js — 一次性工具:走 FB Login 拿 Page Access Token + IG Business Account ID
// 流程:啟動 localhost HTTPS → 開瀏覽器到 FB 同意頁 → 接住 token → 查 /me/accounts → 寫 .env
import 'dotenv/config';
import https from 'node:https';
import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import selfsigned from 'selfsigned';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ID = process.env.FB_APP_ID;
if (!APP_ID) {
  console.error('❌ 找不到 FB_APP_ID,請先在 .env 填入你的 Meta App ID');
  console.error('   (Find it at https://developers.facebook.com/apps → 你的 App → 設定)');
  process.exit(1);
}
const APP_SECRET = process.env.FB_APP_SECRET || '';
const PORT = 8765;
const REDIRECT = `https://localhost:${PORT}/callback`;
const SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'instagram_basic',
  'instagram_manage_comments',
  'instagram_manage_insights',   // 選用:讀取貼文成效數據(insights)
  'instagram_content_publish',   // 選用:透過 API 發佈貼文
  'business_management',
  // ⚠️ 想加「回覆 FB 粉專留言」功能時,再解開下面兩個;
  //    但必須先在 Meta App 後台(應用程式審查 → 權限與功能)開通,否則會 Invalid Scopes 導致整個授權失敗:
  // 'pages_read_user_content',   // 讀 FB 粉專粉絲留言
  // 'pages_manage_engagement',   // 回覆 FB 粉專留言
];
const V = 'v22.0';

const authUrl =
  `https://www.facebook.com/${V}/dialog/oauth?` +
  new URLSearchParams({
    client_id: APP_ID,
    redirect_uri: REDIRECT,
    scope: SCOPES.join(','),
    response_type: 'token',
    auth_type: 'rerequest',
  }).toString();

console.log('🔐 ig-reply — Facebook OAuth 設定工具\n');
console.log('1️⃣  產生自簽憑證...');
const pems = selfsigned.generate(
  [{ name: 'commonName', value: 'localhost' }],
  { days: 1, keySize: 2048 }
);

console.log('2️⃣  啟動本地 HTTPS 伺服器...');

let serverRef;
const userToken = await new Promise((resolve, reject) => {
  const server = https.createServer(
    { key: pems.private, cert: pems.cert },
    (req, res) => {
      const url = new URL(req.url, `https://localhost:${PORT}`);

      if (url.pathname === '/callback') {
        const err = url.searchParams.get('error');
        if (err) {
          const desc = url.searchParams.get('error_description') || '';
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(
            `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;text-align:center;padding:40px"><h1>❌ OAuth 失敗</h1><p>${err}<br>${desc}</p></body>`
          );
          setTimeout(() => server.close(), 500);
          reject(new Error(`OAuth error: ${err} — ${desc}`));
          return;
        }
        // token 在 URL fragment(#),只有瀏覽器看得到,需要靠 JS 讀完再 POST 回伺服器
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html>
<meta charset="utf-8">
<title>capturing token...</title>
<body style="font-family:sans-serif;text-align:center;padding:40px;background:#0d1117;color:#c9d1d9">
  <h1 id="msg">📡 處理中...</h1>
  <script>
    const params = new URLSearchParams(location.hash.substring(1));
    const token = params.get('access_token');
    const msg = document.getElementById('msg');
    if (!token) {
      msg.textContent = '❌ 沒拿到 token,可能你拒絕了某個權限';
    } else {
      fetch('/save?token=' + encodeURIComponent(token))
        .then(r => r.ok ? r.text() : Promise.reject(r.statusText))
        .then(() => {
          msg.innerHTML = '✅ Token 接到了!<br><br>可以關掉這個分頁,回去看 PowerShell 終端機。';
        })
        .catch(e => { msg.textContent = '❌ 送回伺服器失敗:' + e; });
    }
  </script>
</body>`);
        return;
      }

      if (url.pathname === '/save') {
        const token = url.searchParams.get('token');
        if (!token) {
          res.writeHead(400);
          res.end('no token');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
        setTimeout(() => server.close(), 500);
        resolve(token);
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    }
  );

  serverRef = server;
  server.on('error', reject);
  server.listen(PORT, () => {
    console.log(`   ✅ 監聽 ${REDIRECT}\n`);
    console.log('3️⃣  開啟瀏覽器到 FB 同意頁...');
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👉 接下來你會看到三個畫面,請依序處理:');
    console.log('');
    console.log('   畫面 A:FB 同意頁(列出 5 個權限)');
    console.log('           → 按「繼續」或「同意」');
    console.log('');
    console.log('   畫面 B:瀏覽器警告「您的連線不是私人連線」');
    console.log('           → 點「進階」→「繼續前往 localhost (不安全)」');
    console.log('           (這是自簽憑證的正常警告,localhost 是你本機,安全)');
    console.log('');
    console.log('   畫面 C:看到「✅ Token 接到了!」');
    console.log('           → 關掉那個分頁,回來看終端機');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('💡 如果瀏覽器沒自動開啟,手動複製這個網址:');
    console.log('   ' + authUrl);
    console.log('');

    const opener =
      process.platform === 'win32'
        ? `start "" "${authUrl}"`
        : process.platform === 'darwin'
        ? `open "${authUrl}"`
        : `xdg-open "${authUrl}"`;
    exec(opener, (e) => {
      if (e) console.log('(自動開啟失敗,請手動複製上面的網址到瀏覽器)');
    });
  });

  // 5 分鐘逾時保險
  setTimeout(() => {
    if (serverRef.listening) {
      serverRef.close();
      reject(new Error('5 分鐘內沒收到 token,可能是流程中斷了'));
    }
  }, 5 * 60 * 1000);
});

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`✅ 已收到 User Access Token(短期,~1-2 小時)`);
console.log(`   (${userToken.slice(0, 24)}...${userToken.slice(-8)})\n`);

// 如果 .env 有 FB_APP_SECRET,換成長期 User Token(60 天),
// 這樣後續用它去 /me/accounts 拿到的 Page Token 也會是長期(無到期日)
let effectiveUserToken = userToken;
if (APP_SECRET) {
  console.log('🔄 偵測到 FB_APP_SECRET,轉換成長期 Token(60 天)...');
  const exU = new URL(`https://graph.facebook.com/${V}/oauth/access_token`);
  exU.searchParams.set('grant_type', 'fb_exchange_token');
  exU.searchParams.set('client_id', APP_ID);
  exU.searchParams.set('client_secret', APP_SECRET);
  exU.searchParams.set('fb_exchange_token', userToken);
  const exRes = await fetch(exU);
  const exData = await exRes.json();
  if (exData.error) {
    console.log(`   ⚠️  長期 token 交換失敗:${exData.error.message}`);
    console.log('   後續仍用短期 token 繼續 — 但 Page Token 會在 1~2 小時後失效');
  } else if (exData.access_token) {
    effectiveUserToken = exData.access_token;
    const expiresDays = exData.expires_in ? Math.round(exData.expires_in / 86400) : '?';
    console.log(`   ✅ 已換到長期 User Token(${expiresDays} 天有效)`);
  }
  console.log('');
}

console.log('4️⃣  查詢你管理的 FB 粉專 + 連結的 IG 商業帳號...');
const accRes = await fetch(
  `https://graph.facebook.com/${V}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name}&access_token=${effectiveUserToken}`
);
const accData = await accRes.json();
if (accData.error) {
  console.error('❌ /me/accounts 查詢失敗:', accData.error.message);
  process.exit(1);
}

const pageMap = new Map();
for (const p of accData.data || []) pageMap.set(p.id, p);
console.log(`   /me/accounts 找到 ${pageMap.size} 個粉專`);

// 再用 business_management 路徑查 BM 擁有的粉專
console.log('   再查 /me/businesses 補抓 BM 擁有的粉專...');
const bizRes = await fetch(
  `https://graph.facebook.com/${V}/me/businesses?fields=id,name&access_token=${effectiveUserToken}`
);
const bizData = await bizRes.json();
if (!bizData.error && bizData.data) {
  for (const biz of bizData.data) {
    const oRes = await fetch(
      `https://graph.facebook.com/${V}/${biz.id}/owned_pages?fields=id,name,access_token,instagram_business_account{id,username,name}&access_token=${effectiveUserToken}`
    );
    const oData = await oRes.json();
    if (oData.error) {
      console.log(`   ⚠️  ${biz.name} 的 owned_pages 查詢失敗:${oData.error.message}`);
      continue;
    }
    let added = 0;
    for (const p of oData.data || []) {
      if (!pageMap.has(p.id)) {
        pageMap.set(p.id, p);
        added++;
      }
    }
    console.log(`   BM「${biz.name}」owned_pages 補抓 +${added} 個`);
  }
} else if (bizData.error) {
  console.log(`   ⚠️  /me/businesses 失敗:${bizData.error.message}`);
}

const pages = Array.from(pageMap.values());
console.log(`   合計 ${pages.length} 個粉專\n`);

const withIg = pages.filter((p) => p.instagram_business_account);
if (withIg.length === 0) {
  console.error('❌ 沒有任何粉專連結 IG 商業帳號');
  console.error('   原始回應:', JSON.stringify(accData, null, 2));
  console.error('\n   請確認你的 IG 帳號有連結到一個 FB 粉專。');
  process.exit(1);
}

console.log('📋 連結 IG 的粉專:');
for (let i = 0; i < withIg.length; i++) {
  const p = withIg[i];
  console.log(`   [${i + 1}] ${p.name} → @${p.instagram_business_account.username}`);
  console.log(`       Page ID: ${p.id}`);
  console.log(`       IG Biz Account ID: ${p.instagram_business_account.id}`);
}

// 預設用第一個。如果有多個,提示一下。
const target = withIg[0];
if (withIg.length > 1) {
  console.log(`\n⚠️  有多個粉專,預設用 [1] 「${target.name}」`);
  console.log('   如果要換別的,告訴 Claude,我們手動改 .env');
}

console.log(`\n✅ 採用:「${target.name}」→ @${target.instagram_business_account.username}`);

// 有些粉專(尤其透過 BM/owned_pages 找到的)在清單裡不會附帶 access_token,
// 改用粉專 ID 直接去要一次,這是拿 Page Token 最可靠的方式。
let pageToken = target.access_token;
if (!pageToken) {
  console.log('\n⚠️  清單裡沒有 Page Token,改用粉專 ID 直接補抓...');
  const ptRes = await fetch(
    `https://graph.facebook.com/${V}/${target.id}?fields=access_token&access_token=${effectiveUserToken}`
  );
  const ptData = await ptRes.json();
  if (ptData.error) {
    console.error(`   ❌ 直接補抓 Page Token 失敗:${ptData.error.message}`);
  } else if (ptData.access_token) {
    pageToken = ptData.access_token;
    console.log('   ✅ 已直接取得 Page Token');
  }
}
if (!pageToken) {
  console.error('\n❌ 仍拿不到 Page Token。最可能原因:授權時沒勾選「植晴苑」這個粉專,');
  console.error('   或你在該粉專沒有管理員角色。請重跑並在同意頁選到該粉專。');
  process.exit(1);
}

console.log('\n5️⃣  把資訊寫進 .env...');
const envPath = path.join(__dirname, '.env');
let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

const updates = {
  FB_PAGE_ACCESS_TOKEN: pageToken,
  FB_PAGE_ID: target.id,
  IG_BUSINESS_ACCOUNT_ID: target.instagram_business_account.id,
  IG_USERNAME: target.instagram_business_account.username,
};

for (const [k, v] of Object.entries(updates)) {
  if (new RegExp(`^${k}=`, 'm').test(envContent)) {
    envContent = envContent.replace(new RegExp(`^${k}=.*$`, 'm'), `${k}=${v}`);
  } else {
    if (envContent && !envContent.endsWith('\n')) envContent += '\n';
    envContent += `${k}=${v}\n`;
  }
}
fs.writeFileSync(envPath, envContent, 'utf8');

console.log('   ✅ .env 已更新,新增/更新以下欄位:');
for (const k of Object.keys(updates)) {
  const v = updates[k];
  const shown = typeof v === 'string' && v.length > 30 ? v.slice(0, 24) + '...' + v.slice(-6) : v;
  console.log(`      ${k}=${shown}`);
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🎉 完成!告訴 Claude「拿到 Page Token 了」,他會幫你改寫 fetch.js / reply.js。');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
process.exit(0);
