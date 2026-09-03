# 配置オプションと外部サービス差し替え

| 構成 | 費用 | 特徴 |
| --- | --- | --- |
| **Windows サーバ + Cloudflare Tunnel**(推奨) | 0円(ドメイン代のみ) | 受信ポート不要、無料 WAF/CDN/DDoS 対策、動的 IP でも可 |
| Windows サーバ + Caddy | 0円 | 固定 IP と 80/443 開放が必要。Let's Encrypt 自動更新 |
| Docker Compose(Windows/Linux) | 0円 | `infrastructure/docker`。web / worker / postgres / caddy |
| Vercel + Supabase(無料枠) | 0円〜 | `output: standalone` を外し `DATABASE_URL` を Supabase に向けるだけで移行可。無料枠停止時は上記へ戻せる |

## 抽象化層 (§40)
| Provider | 現行実装 | 差し替え先の例 |
| --- | --- | --- |
| AuthProvider | LocalPasswordProvider(自前) | Google / Microsoft / SSO / Passkey |
| NotificationProvider | Webhook(worker) | メール、LINE Notify 代替、Teams |
| MapProvider | なし(OpenStreetMap へのリンクのみ) | 任意の地図タイル。距離計算は自前のため不要 |
| StorageProvider | ローカルディスク(backups) | S3 互換 / Cloudflare R2 無料枠 |

基幹ロジック(職員、勤怠、GPS 判定、リスク、権限、監査)は全て `packages/` と `modules/` 内で完結しており、外部サービス停止時も動作します。
