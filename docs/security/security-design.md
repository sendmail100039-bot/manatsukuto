# セキュリティ設計

## 通信・境界 (§27, §28, §46)
- 外部通信は HTTPS のみ。Windows サーバでは **Caddy**(自動 Let's Encrypt)または **Cloudflare Tunnel**(受信ポート開放不要、無料 WAF/CDN 付き)で TLS 終端し、アプリは `127.0.0.1:3000` でのみ待ち受ける。
- PostgreSQL は `listen_addresses='localhost'` + ファイアウォールで 5432 を遮断(`infrastructure/windows/firewall.ps1`)。Docker 構成でもポートを公開しない。
- セキュリティヘッダ(CSP、X-Frame-Options DENY、HSTS、nosniff、Permissions-Policy geolocation=self)を `apps/web/next.config.ts` で付与。

## 認証 (§30, §31)
- `AuthProvider` 抽象化(`packages/auth/src/provider.ts`)。MVP は `LocalPasswordProvider`(scrypt N=16384, r=8, p=1, 64B)。ネイティブモジュール不要で Windows でも動作。
- セッションは DB 管理(`user_sessions`)。Cookie にはランダムトークンのみ、DB にはその SHA-256 を保存。HttpOnly / Secure / SameSite=Lax。
- MFA(TOTP, RFC 6238)を `head_office` / `security_admin` / `system_admin` に必須化。シークレットは `APP_SECRET` 由来鍵で AES-256-GCM 暗号化保存。リカバリーコードはハッシュ保存・単回使用。
- 初回ログイン時パスワード変更強制(`must_change_password`)。

## Brute Force / Rate Limit (§46)
- ユーザー単位: 連続失敗 N 回(既定 5)で `lock_minutes`(既定 15 分)ロック。
- IP 単位: 15 分あたり失敗回数上限(既定 50)。
- 存在しないユーザーでもハッシュ計算を行い、応答時間差を抑制。
- 設定は `system_settings["auth.lockout"]`。

## CSRF (§46)
- Cookie SameSite=Lax に加え、全ての変更系リクエストで `Origin`(または `Referer`)を `APP_ORIGIN` / `X-Forwarded-Host` と照合(`isTrustedOrigin`)。Next.js の Server Actions も同様に Origin を検証する。

## Replay Attack・重複打刻 (§48, §49)
- クライアントは打刻ごとに UUID `requestId` と `clientTime` を送信。
- `requestId` は `idempotency_keys`(PK)と `attendance_events.request_id`(unique)で単回使用。
- `clientTime` とサーバ時刻の差が `requestMaxAgeSeconds`(既定 300 秒)を超える要求は拒否(再送パケットの再利用防止)。
- 職員単位の advisory lock + 「open レコードは 1 件」の部分ユニーク索引で連打・同時送信を排他。

## GPS 判定 (§18–§22)
- 距離は haversine(地球半径 6,371,008.8 m)でサーバ計算。外部 API 不使用。
- GPS 精度円は距離判定に **含めない**(大きな精度値で拠点を「覆う」偽装を防ぐ)。精度不良は別途加点。
- Impossible Travel: 前回打刻との距離 ≥ 5 km かつ 推定速度 > 200 km/h(既定、変更可)。
- リスクスコア重み・閾値は `system_settings["security.risk"]` で変更可能(§21「後から変更可能」)。
- 判定結果は打刻を **拒否しない**。REVIEW / HIGH_RISK は `security_events` として本部の確認対象になるだけで、勤怠の自動変更・欠勤扱い・削除は行わない(§26)。

## 情報の分離 (§23, §25)
- `/api/attendance/punch` の応答は `{type, serverTime, displayTime, message, locationName}` のみ。リスク情報は含まない(統合テストで検証)。
- Security 画面は `security.*` 権限でガードし、GPS 詳細・端末詳細はさらに `security.location.read` / `security.device.read` で表示制御。
- 管理者による GPS/リスク閲覧はそれ自体を監査ログに記録(`security.gps_viewed`, `security.risk_viewed`)。

## 監査ログ (§34, §35)
- 追記専用。DB トリガーで UPDATE / DELETE を拒否。アプリ用 DB ロールに DELETE 権限を与えない運用を推奨。
- 記録対象: ログイン成功/失敗、ログアウト、MFA、出勤、退勤、打刻拒否、修正申請/承認/却下、CSV 出力、職員・拠点・端末・ユーザー・権限変更、GPS 異常、セキュリティイベント作成/確認、GPS/リスク閲覧、設定変更。

## Secret 管理 (§38)
- `.env` は `.gitignore` 済み。`APP_SECRET`、`DATABASE_URL` 等は環境変数。CI では GitHub Secrets を使用。

## 残課題(Phase 2)
- Mock Location / Device Integrity / App Integrity はネイティブアプリ(Play Integrity / App Attest)からの申告値を受け付ける口のみ実装。ブラウザからは取得できない。
- Rate Limit はアプリ層のログイン/打刻のみ。全体の L7 レート制限は Cloudflare または Caddy プラグインで補う。
- Passkey / 外部 IdP は `AuthProvider` の追加実装で対応。
