# 11. サイトメタと WebMCP

版: **1.0.0**（正本 `VERSION`）  

対象: 開発・運用（画面ヘルプには出さない）

| | |
|--|--|
| ソース | [https://github.com/GawaDev/ohyna](https://github.com/GawaDev/ohyna) |
| 公開デモ | [https://ohyna.onrender.com/](https://ohyna.onrender.com/) |

正規 URL 定数: `ohyna/project_meta.py`（`/health`・README と共通）。

---

## 1. 公開サイトメタ

`serve` は次をルートで配信します（ひな型はリポジトリの `site/`）。

| パス | 役割 |
|------|------|
| `/llms.txt` | LLM／エージェント向けの要約インデックス（[llms.txt](https://llmstxt.org/)） |
| `/llms-full.txt` | ヘルプカタログ本文の連結（長大。必要時のみ） |
| `/webmcp.json` | ブラウザ WebMCP で登録するツールの静的カタログ |
| `/sitemap.xml` | 公開 URL 一覧（検索エンジン向け） |
| `/robots.txt` | クローラへの Allow／Disallow。POST API は Disallow |
| `/.well-known/security.txt` | 脆弱性報告の連絡先（[RFC 9116](https://www.rfc-editor.org/rfc/rfc9116)） |
| `/gui/` | GUI（HTML の OGP／canonical に絶対 URL。PWA マニフェスト・Service Worker） |
| `/gui/og.png` | Open Graph／Twitter カード画像（1200×630） |
| `/gui/manifest.webmanifest` | Web App Manifest（icons・screenshots 含む） |

### 環境変数

| 変数 | 用途 |
|------|------|
| `OHYNA_PUBLIC_ORIGIN` | sitemap／llms／OGP の絶対 URL オリジン（デモ: `https://ohyna.onrender.com`） |
| `OHYNA_SECURITY_CONTACT` | `security.txt` の `Contact:` を上書き（URL または `mailto:`） |

未設定時、オリジンは `Host` と `X-Forwarded-Proto` から推定します（`127.0.0.1` / `localhost` は `http`、それ以外は `https`）。  
GUI の `index.html` 内 `__OHYNA_ORIGIN__` は配信時にこのオリジンへ置換します。

### 運用メモ

- 本番では必ず `OHYNA_PUBLIC_ORIGIN` と実連絡先の `OHYNA_SECURITY_CONTACT` を設定する
- `robots.txt` はプレビュー／PDF／解析 API を Disallow する（クロール負荷と誤用防止）
- `llms.txt` のリンク先はヘルプカタログと一致させる
- `/health` の `webmcp` フィールドでページ URL・カタログ・注意書きを返す
- OGP 画像の再生成: `python brand/render_social.py`
- PWA screenshots（実画面）: `python brand/capture_pwa_screenshots.py`（`ohyna serve` 起動済み）

---

## 2. WebMCP

### 2.1 何か

**WebMCP**（Web Model Context Protocol）は、W3C Web Machine Learning Community Group が進めている**ブラウザ向けの提案仕様**です。Web ページが、開いているタブ上で AI エージェント向けの **ツール（関数＋説明＋入力スキーマ）** を登録できるようにします。

- 仕様ドラフト: [WebMCP](https://webmachinelearning.github.io/webmcp/)（Community Group Report。W3C 勧告ではない）
- 着想元: サーバ側の [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
- API（実装差あり）:
  - 先行実装・チュートリアル: `navigator.modelContext.registerTool({ name, description, inputSchema, execute })`
  - 現行ドラフト／Chrome ドキュメント: `document.modelContext.registerTool(..., { signal })`
- Ohyna は **navigator → document** の順で `registerTool` を探す。第2引数 `{ signal }` がある実装ではそれを使い、無い実装ではツール定義のみで登録する

### 2.2 Ohyna の実装

実装: `web/src/webmcp.ts`（セッション準備後にメインウィンドウで登録。対応していれば `AbortSignal` で解除）。  
静的カタログ: `site/webmcp.json` → `GET /webmcp.json`。

| ツール | 内容 | 注記 |
|--------|------|------|
| `ohyna_describe` | 製品概要とツール名一覧 | `readOnlyHint` |
| `ohyna_get_status` | 未保存・検査ゲート・PDF 状態など | `readOnlyHint` |
| `ohyna_get_markdown` | 編集中 Markdown 全文 | `readOnlyHint` |
| `ohyna_set_markdown` | Markdown 全文の置き換え | `untrustedContentHint` |
| `ohyna_get_document_settings` | `ohyna:` 設定の要約 | `readOnlyHint` |
| `ohyna_analyze` | `/analyze` 相当の検査 | `readOnlyHint` |
| `ohyna_refresh_preview` | プレビュー再取得 | |
| `ohyna_prepare_pdf` | PDFを作成＋確認 UI | ディスク保存は利用者の保存操作 |
| `ohyna_print_pdf` | OS 印刷ダイアログへ | 未作成なら作成してから |
| `ohyna_open_help` | ヘルプを開く（任意 `docId`） | |

動作条件:

- `navigator` / `document` いずれかに `modelContext.registerTool` があるブラウザで登録する
- Permissions Policy の `tools`（既定 `'self'`）。`index.html` に `Permissions-Policy: tools=(self)` を明示
- セキュアコンテキスト（HTTPS／localhost）が前提になりやすい
- PDF のファイル保存・ファイルピッカーは OS UI で完了する
- プレビューは体裁確認用（ズーム・スクロール可）

### 2.3 フラグ

既定 ON。無効化: ローカルストレージ `ohyna-webmcp=0` のうえ再読込。

### 2.4 MCP との違い

| | MCP | WebMCP |
|--|-----|--------|
| 実行場所 | サーバ／デーモン | **ブラウザのタブ内**（ページの JS） |
| 寿命 | 常駐 | タブを閉じると消える |
| 用途 | どこからでもデータ・操作 | **開いているサイト上**での操作 |

バックエンド MCP とページ上の WebMCP を併用できます。本製品の WebMCP はタブ内登録です。
