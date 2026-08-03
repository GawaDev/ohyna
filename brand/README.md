# Ohyna ブランドアセット

アプリアイコンの🐣は **Google Noto Color Emoji**（U+1F423）の SVG をそのまま使用します。

| ファイル | 用途 |
|----------|------|
| `noto-emoji-u1f423.svg` | 上流 Noto グリフ（改変なし） |
| `ohyna-mark.svg` | 白角丸地に Noto グリフ（枠なし・ヘッダ正本） |
| `pwa-192.png` / `pwa-512.png` | PWA icons（`purpose: any`） |
| `pwa-maskable-512.png` | maskable 用（安全余白付き） |
| `ohyna-icon-master.png` ほか | `render_icons.py` で生成する PNG |
| `og.png` / `screenshots/` | `render_social.py` で生成（OGP・PWA） |
| `NOTO-EMOJI-NOTICE.txt` | 帰属・ライセンス案内 |
| `APACHE-2.0.txt` / `NOTO-EMOJI-OFL.txt` | ライセンス本文 |

生成: `python brand/render_icons.py` → `web/public/` へもコピー。  
OGP／PWA 用: `python brand/render_social.py` → `web/public/og.png` と `web/public/screenshots/`。  
マニフェスト項目は `web/src/appIdentity.ts`（`vite.config.ts` から参照）で定義。
