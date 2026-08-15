# MANATSUKUTO website

MANATSUKUTO（マナツクト）公式Webサイトの公開用ソースです。

## Structure

- `site/` — GitHub Pagesへ公開する静的サイト
- `.github/workflows/pages.yml` — GitHub Pagesの公開ワークフロー
- `docs/HANDOFF.md` — プロジェクト引き継ぎ書（現状と残タスク）

## Local preview

```powershell
python -m http.server 4173 --directory site
```

Open `http://127.0.0.1:4173/` in a browser.

## Contact form

The initial form uses the visitor's email application and does not transmit form data to a third-party form service. A future provider endpoint can be configured in `site/assets/site-config.js` after its privacy, retention, quota, and notification settings are approved.

## Brand assets

The B2 Segmented M direction is approved, but the final logo file and rights review are pending. Until that review is complete, the site uses the approved `MANATSUKUTO` text name and does not include a provisional logo image.
