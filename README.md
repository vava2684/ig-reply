<div align="center">

# 🐱 ig-reply

**用你的 AI 助理回 Instagram 留言 — 程式只抓資料和送出,回覆內容由 AI 在對話裡生成,零付費 AI API。**
*Reply to Instagram comments with your AI assistant. The program only fetches & sends; the AI writes the replies in chat. No paid AI API.*

繁中 ｜ [English](#-english)

<br>

<img src="assets/demo.png" alt="ig-reply 多語言回覆示意圖" width="760">

<br><sub>一次送出多語言回覆 — 留言 ID 與粉絲暱稱已塗銷 ｜ multilingual replies in one run (comment IDs & handles redacted)</sub>

</div>

---

## ✨ 亮點 Highlights

| | |
|---|---|
| 💸 **零 AI 費用** | 不在程式裡呼叫任何付費 AI 介面。回覆由你的 AI 助理(如 Claude)在對話裡生成,量再大也不燒 API 錢。 |
| 🌍 **跟著留言者的語言回** | 中／英／西／葡／義／日／土／德／印尼／馬來／波斯… 留言者用什麼語言,就用什麼語言回。 |
| 🙂 **純表情留言也照顧** | 只有 emoji 的留言會被獨立標出,可用 username 風格推測語言,判不準就走英語安全牌。 |
| 🤝 **真愛粉熟客語氣** | 同一人多次留言時,每則回覆內容/emoji/CTA 都不同,像主理人真心一條條看完。 |
| 🛡️ **防機器人節流** | 每則之間隨機等 30~90 秒,降低被平台判定為自動化的風險。 |
| ✅ **自動去重** | `replied.json` 記錄已回過的留言,絕不重複回同一則。 |
| 🔑 **一鍵拿長期 Token** | `oauth.js` 走 Facebook Login,自動換 60 天長期 Page Token 並寫回 `.env`。 |

## 🧠 設計理念 How it works

在 IG 上經營,常會遇到各國語言的粉絲。雖然我們看得懂翻譯,但要一則一則把留言複製去翻譯、再切回來回覆,實在太麻煩 —— 尤其外語粉絲一多,光是判斷「這則該用哪種語言回」就很頭痛。

這套工具就是為了解決這件事:

- 🌐 **自動判斷該用哪種語言回**每一則留言。
- 🙂 就算對方只丟表情符號、沒有文字,也能**從帳號名稱推測語言**;真的判斷不出來,就**統一用英文這張安全牌**,絕不亂猜回錯語言。
- 🤝 還會**記住常來留言的老粉**,給他們更熱情、更熟客的回應 —— 讓路人更容易變成鐵粉,對貼文的**觸及與互動也大有幫助**。

而在「怎麼生成回覆」這件事上,大多數「自動回留言」工具把付費 AI 寫死在程式裡 — 量大燒錢、語氣難客製。
本工具把流程拆成「程式做苦工、AI 動腦」三段:

```
①  node fetch.js <貼文ID>   →   pending.json(該篇待回留言清單)
②  你的 AI 助理讀 pending.json,在對話裡逐則生成回覆   →   replies.json
③  node reply.js            →   逐則送到 IG(每則間隔 30~90 秒,自動記錄已回)
```

語氣、語言、CTA 全由你和 AI 在對話裡掌控;程式端不碰 AI、零成本。

## 🚀 快速開始 Quick start

需要 **Node.js 18+**。

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
# 在 .env 填入 FB_APP_ID 與 FB_APP_SECRET(到 https://developers.facebook.com/apps 建立 App 取得)

node oauth.js               # 跟著瀏覽器流程走完,自動把 Page Token 寫回 .env
node test.js                # 列出最近貼文,複製想處理的 media_id
node fetch.js <media_id>    # 抓該篇新留言 → pending.json
#  → 讓你的 AI 助理讀 pending.json,生成 replies.json
node reply.js               # 逐則送出
```

> IG 帳號需為**商業帳號**並連結到一個 Facebook 粉專。完整逐步說明見 [`SKILL.md`](./SKILL.md)。

## 📂 檔案說明 Files

| 檔案 | 角色 |
|---|---|
| `oauth.js` | 一次性:走 FB Login 拿 60 天 Page Token,寫回 `.env` |
| `test.js` | 測試憑證、列出最近貼文與其 media_id |
| `fetch.js` | 抓某篇貼文的新留言,過濾已回過的 → `pending.json` |
| `reply.js` | 讀 `replies.json` 逐則送出,間隔 30~90 秒,記錄到 `replied.json` |
| `.env.example` | 憑證範本(複製成 `.env` 再填) |

## ⚠️ 安全與隱私 Security & privacy

- **絕對不要**提交 `.env` — 內含可操控你帳號的權杖(已被 `.gitignore` 擋住)。
- `pending.json` / `replies.json` / `replied.json` 含**留言者帳號與留言內容(第三方個資)**,同樣已被 `.gitignore` 擋住,請勿公開。
- 請遵守 Instagram 平台政策,自動化留言頻率請節制。

## ☕ 支持作者 Support

這個工具對你有幫助的話,歡迎來我的粉專逛逛 🐱
👉 **Facebook**：https://www.facebook.com/VavaAiArtist

## 授權 License

[MIT](./LICENSE)

---

<a name="-english"></a>
## 🌐 English

A helper for replying to Instagram comments. The code only **fetches comments** and **sends replies** — deciding *what to say* is handed to your AI assistant (e.g. Claude) in a chat. **No paid AI API calls.**

### Highlights

- 💸 **Zero AI cost** — no paid AI endpoint baked in; your assistant drafts replies in chat.
- 🌍 **Replies in the commenter's own language** (EN/ES/PT/IT/JA/TR/DE/ID/MS/FA…).
- 🙂 **Emoji-only comments handled** — language guessed from username, English as the safe fallback.
- 🤝 **Loyal-fan voice** — repeat commenters get distinct content/emoji/CTA each time.
- 🛡️ **Anti-bot throttle** — random 30–90s gap between replies.
- ✅ **De-dupe** — `replied.json` ensures no comment is answered twice.
- 🔑 **One-shot OAuth** — `oauth.js` grabs a 60-day long-lived Page token.

### How it works

Running an IG account means constantly meeting fans who speak different languages. Even if you can read a translation, copying each comment into a translator and back just to reply is a real pain — and the bigger your international audience, the harder it gets to even decide *which* language to answer in.

That's exactly what this tool solves:

- 🌐 It **automatically decides which language to reply in** for every comment.
- 🙂 Even when someone leaves only emojis, it **guesses their language from their username** — and when it truly can't tell, it **safely falls back to English** instead of guessing wrong.
- 🤝 It also **remembers your regular commenters** and gives them warmer, familiar replies — turning passers-by into loyal fans and **boosting reach & engagement** along the way.

As for *writing* the replies, most auto-reply tools bake a paid AI endpoint into the program (expensive at scale, hard to fine-tune). This one splits the work instead:

```
①  node fetch.js <postID>   →   pending.json (comments to answer)
②  your AI assistant reads pending.json and drafts replies   →   replies.json
③  node reply.js            →   posts each reply (30–90s apart, auto-recorded)
```

### Quick start

Requires **Node.js 18+**.

```bash
npm install
cp .env.example .env
# put FB_APP_ID & FB_APP_SECRET in .env (create an app at https://developers.facebook.com/apps)

node oauth.js               # complete the browser flow; writes the Page token to .env
node test.js                # list recent posts, copy a media_id
node fetch.js <media_id>    # fetch new comments → pending.json
#  → let your AI assistant read pending.json and write replies.json
node reply.js               # send them out
```

> Your IG account must be a **Business account** linked to a Facebook Page. Full walkthrough in [`SKILL.md`](./SKILL.md).

### Security & privacy

- **Never** commit `.env` (account tokens — already git-ignored).
- `pending.json` / `replies.json` / `replied.json` hold **commenters' handles and text (third-party PII)** — also git-ignored; don't publish them.
- Follow Instagram's platform policies; keep automation rates reasonable.

### ☕ Support

If this helped you, come say hi on my Facebook page 🐱 → https://www.facebook.com/VavaAiArtist

### License

[MIT](./LICENSE)
