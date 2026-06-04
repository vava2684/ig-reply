---
name: ig-reply
description: Instagram 貼文留言智慧回覆。抓某篇貼文底下的新留言,由 Claude 在對話裡依貼文內容與留言者語言生成友善回覆,再透過 Graph API 自動送出。觸發時機:使用者說「回覆留言」「處理 IG 留言」「回 IG」「IG 自動回覆」「抓留言來回」「回我 IG 那篇」等。
---

# ig-reply — Instagram 留言智慧回覆

> 這個 skill **不會呼叫任何付費 AI API**。生成回覆的那一步,由 Claude 在對話裡直接做。
> 程式只負責兩件事:**抓資料** 和 **送出回覆**。

---

## 資料夾結構

```
ig-reply/
├── SKILL.md          ← 你正在看的這份說明
├── .env              ← 你的憑證(不要分享給任何人,已被 .gitignore 擋住)
├── .env.example      ← 範本(可以分享)
├── .gitignore        ← 告訴 git 不要上傳 .env、留言資料等
├── package.json      ← Node.js 設定
├── oauth.js          ← 一次性:走 FB Login 拿 Page Token
├── test.js           ← 步驟 A:測試 token 是否有效、列出貼文
├── fetch.js          ← 步驟 B:抓某篇貼文的留言
├── reply.js          ← 步驟 D:把回覆送出去
├── replied.json      ← (自動產生)記錄已回過的留言,避免重複
├── pending.json      ← (自動產生)fetch.js 寫出,給 Claude 看
└── replies.json      ← (你/Claude 填)要送出的回覆,reply.js 會讀
```

---

## 第一次使用:拿 Token(只做一次)

本 skill 走 **Facebook Login flow**(用 Page Access Token 讀 IG 留言),不是 Instagram Login。

1. 在 [Meta for Developers](https://developers.facebook.com/apps) 建一個 App,拿到 **App ID** 和 **App Secret**。
2. 複製 `.env.example` 成 `.env`,填入 `FB_APP_ID` 與 `FB_APP_SECRET`。
3. 執行 `npm install`,再執行 `node oauth.js`:它會開瀏覽器走 FB 同意流程,自動把
   `FB_PAGE_ACCESS_TOKEN` / `FB_PAGE_ID` / `IG_BUSINESS_ACCOUNT_ID` / `IG_USERNAME` 寫回 `.env`。
   - 需要的權限:`pages_show_list`、`pages_read_engagement`、`instagram_basic`、`instagram_manage_comments`、`business_management`
   - 你的 IG 帳號必須是**商業帳號**且連結到一個 FB 粉專。

---

## 完整流程(每次回覆都重複這 4 步)

### 步驟 A:測試 token 是否還有效

```bash
npm install   # 第一次才需要
node test.js
```

成功會印出你最近的幾篇貼文,每篇有編號(media_id)、發佈時間、說明文字前幾個字。
看到錯誤就告訴 Claude(常見錯誤訊息會直接是中文,例如「Page Token 過期,請重跑 node oauth.js」)。

### 步驟 B:抓某篇貼文的新留言

從步驟 A 的輸出複製想處理的 `media_id`:

```bash
node fetch.js <media_id>
```

程式會抓該篇說明＋所有留言、過濾掉已回過的(依 `replied.json`)、寫到 `pending.json`,
純表情符號的留言會另外標到 `emoji_only` 清單。

### 步驟 C:請 Claude 生成回覆

跟 Claude 說「幫我讀 pending.json,生成 replies.json」。Claude 會依留言者語言＋貼文主題,
逐則生成友善、簡短、像真人的回覆,寫成 `replies.json`:

```json
{
  "留言ID": "回覆文字",
  "留言ID": "回覆文字"
}
```

### 步驟 D:把回覆送出去

```bash
node reply.js
```

讀 `replies.json` 逐則透過 Graph API 送出,每則之間隨機等 30~90 秒(避免被判定為機器人),
送出成功的留言 ID 記錄到 `replied.json`(下次自動跳過)。中途 `Ctrl+C` 可安全停止。

---

## 常見問題

**Q:Token 過期了怎麼辦?** 重跑 `node oauth.js` 更新 `FB_PAGE_ACCESS_TOKEN`(填了 `FB_APP_SECRET` 會自動換成 60 天長期 token)。

**Q:可以同時處理多篇貼文嗎?** 可以,但 `fetch.js` 每次會覆寫 `pending.json`,所以一次處理一篇最單純;或先抓多篇、把各篇的 `replies.json` 累加後一次 `node reply.js`(留言 ID 全域唯一)。

**Q:想自己改 Claude 生成的回覆?** 直接編輯 `replies.json` 再 `node reply.js`。

**Q:replied.json 不見了會怎樣?** 會把所有留言當成沒回過,最壞情況是有些被回兩次。

---

## Claude 在執行這個 skill 時的工作守則

1. **不要寫程式去呼叫付費 AI API** — 生成回覆是 Claude 在對話裡直接做。
2. **讀 pending.json → 寫 replies.json** 是核心任務:
   - 用留言者的語言回覆(中文回中文、英文回英文、日文回日文…)
   - emoji_only 留言沒文字可判語言,改用 username 命名風格推測;**判斷不出來就走英語安全牌**,不亂猜被誤射
   - 配合 `post_caption` 的主題與語氣;友善、簡短(1~2 句)、像真人,不要罐頭
   - 避免承諾、避免敏感話題、避免提到價格細節
3. **每則回覆可含輕量 CTA**(追蹤/分享/Tag 朋友/預告下一篇),類型在同一批裡輪流變化;約 70~80% 有 CTA 即可,留一些純情感回應避免整體像行銷帳號。
4. **同一人連發多則留言** → 每則都回,但內容、emoji、CTA 都要彼此不同(對方是真愛粉,只回一條反而冷淡)。
5. 寫完 replies.json 後,提醒/協助使用者執行 `node reply.js` 送出。
6. 若 token 失效,清楚告訴使用者重跑 `node oauth.js`。
