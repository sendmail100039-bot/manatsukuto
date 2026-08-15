# MANATSUKUTO プロジェクト引き継ぎ書（G01 → 現行セッション）

最終更新: 2026-08-15

G01（前セッション）からの明示的な引き継ぎ資料が残されていなかったため、
リポジトリ・Slack（#営業_姫路）・Gmail の記録から現状を再構築した文書です。
以後のセッションはまず本書を更新してから作業を続けてください。

## プロジェクト概要

MANATSUKUTO（マナツクト）— 姫路市を中心に兵庫県内で展開するAI・デジタル総合支援サービスの公式Webサイト。

- 担当: 西岡和紀（nishioka.ai.solutions@gmail.com）、牧野直人（makino.ai.solutions@gmail.com）
- リポジトリ: `sendmail100039-bot/manatsukuto`
- 公開方式: GitHub Pages（`.github/workflows/pages.yml`、main へ push で自動デプロイ）
- 本番想定URL（canonical / sitemap 記載）: https://sendmail100039-bot.github.io/manatsukuto/
- βテスト公開URL: https://manatsukuto-private.kecokky.chatgpt.site/ （Slack 2026-08-09 告知）

## 現状（2026-08-15 時点）

### 完了済み

- 静的サイト一式（index / staff / contact / privacy / 404、CSS・JS、sitemap、robots、Pages ワークフロー）— main にコミット済み
- 無料相談予約: Google Calendar 予約ページ連携（`site/assets/site-config.js` の `bookingUrl`）— 正常動作（Slack 8/9 報告）
- 問い合わせフォームのバックエンド: Google Apps Script「MANATSUKUTO 問い合わせ受付」を構築・テスト済み（Slack 8/9「問い合わせフォーム作成完了テスト済み」）
  - 動作実績: 8/9 と 8/15 にテスト送信のメールが西岡・牧野両名へ着信（件名「【Web問い合わせ】〜様からのお問い合わせ」、受付ID付き、自動返信なし）
  - ただし稼働しているのは **βサイト（chatgpt.site）側のみ**

### 未完了・このリポジトリとβサイトの差分

このリポジトリの `site/assets/site-config.js` は依然として

```js
formEndpoint: "",
formMode: "mailto"
```

のままで、GitHub Pages 版のフォームは「メールアプリを開く方式（mailto）」で動作します。
`site/assets/main.js` は `formMode: "provider"` + `formEndpoint` 設定時にフォームデータを
POST する実装を既に持っているため、**GAS の Web アプリURLを設定するだけで β と同等になります**。

## 残タスク（優先度順）

1. **フォームエンドポイントの本設定**
   - 必要情報: GAS Web アプリの公開URL（`https://script.google.com/macros/s/…/exec`）。リポジトリ・Slack・メールのいずれにも記録が無く、西岡さんの GAS プロジェクトからの提供待ち。
   - 作業: `site-config.js` を `formMode: "provider"` + URL に変更し、CORS/POST の動作確認。
2. **privacy.html 第3条の更新**（上記と同時に実施）
   - 現在は mailto 方式の説明。GAS 送信方式（フォームから直接送信、受付ID発行、西岡・牧野2名へ通知、自動返信なし）に合わせて書き換える。README の方針どおり「送信先・保存期間・無料枠・削除方法を確認してから更新」。
3. **公開先の一本化**
   - βサイト（chatgpt.site）と GitHub Pages のどちらを正とするか未決定。canonical / sitemap は GitHub Pages を指している。決定後、片方からのリダイレクトまたは閉鎖を検討。
4. **ロゴ**
   - B2「Segmented M」方向は承認済みだが、最終ロゴファイルと権利確認が未了。それまではテキストロゴ（現状）を維持。
5. **コンテンツ見直し**
   - Slack 8/9「内容については今後検討」。各ページ文言の正式版確定が残っている。

## 引き継ぎ時に依頼者へ確認すべきこと

- GAS Web アプリURL（残タスク1のブロッカー）
- 公開先の一本化方針（残タスク3）
- 最終ロゴファイルの入手時期（残タスク4）

## 運用メモ

- 認証情報・エンドポイントURLを公開ソースへ直書きする前に、公開されて問題ない値か確認すること（GAS の /exec URL は公開ページから参照される前提のURLなので設定可）。
- main へ push すると即時本番デプロイされるため、確認は作業ブランチで行い、公開判断後に main へ反映する。
