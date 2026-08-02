# 04. API と CLI

HTTP サーバは `python -m ohyna serve` で起動します。開発時の既定は `127.0.0.1:8787`。  
本番はリバースプロキシ配下で公開します（[06-セキュリティ.md](./06-セキュリティ.md)）。  
リクエストボディ上限は **8 MiB**（超過時 `413`）。

対象は **1 Markdown → 1 PDF**（および同じ文書の静的解析・プレビュー）です。

---

## 1. HTTP 共通

### CORS

- `Origin` ヘッダが無い通常の同一オリジン取得: CORS ヘッダなし
- 許可する Origin:
  - リクエストの Host と一致する `http` / `https`
  - 開発用 `127.0.0.1` / `localhost` のポート `8787` と `5173`（Vite）
  - 環境変数 `OHYNA_ALLOWED_ORIGINS`（カンマ区切り）に列挙した Origin
- それ以外: CORS を付けない。`OPTIONS` は `403`
- `Access-Control-Allow-Origin: *` は使わない

### エラー JSON

多くの失敗は `{ "error": "..." }` です。公開文言は例外メッセージ先頭行を最大 240 文字に切り詰めます。

---

## 2. GET

| パス | 応答 |
|------|------|
| `/` / `/gui` / `/gui/` | `gui/index.html` |
| `/gui/*` | 静的ファイル（`..` 拒否。無ければ 404） |
| `/health` / `/api/health` | `{ ok, service, version, gui, bindHint, endpoints, presets }` |
| `/styles` | `{ "presets": [ ... ] }` |
| `/docs` / `/docs/` | `{ "docs": [ { id, title, group, url } ] }`（カタログ掲載かつ実在ファイルのみ） |
| `/docs/<file>.md` | カタログ許可リスト内の Markdown 本文。それ以外は 404 |

---

## 3. POST `/analyze`

Markdown の静的解析。プレビュー／PDF は生成しません。

### 検査項目

詳細は [08-入力解読仕様.md](./08-入力解読仕様.md) を参照してください。要約:

1. **文書設定** — front matter と `ohyna:`、必須キー、列挙値（`code`: `SETTINGS_*`）
2. **Markdown 構造** — フェンス閉止、見出し、リンク／画像、数式区切り
3. **コードフェンス** — Pygments 言語、JSON／YAML、図・数式フェンスの形式
4. **Mermaid** — `` ```mermaid ``（図）と `` ```mermaid code `` を `render_flowchart_svg` で検証。不明な追加トークンは `MERMAID_FENCE_MODE`
5. **KaTeX** — `$` / `$$` / `\(...\)` / `\[...\]` および数式フェンスを実描画検証

### リクエスト

```json
{ "markdown": "..." }
```

### 応答（200）

```json
{
  "ok": true,
  "errors": 0,
  "warnings": 0,
  "diagnostics": [
    {
      "severity": "error",
      "message": "...",
      "line": 12,
      "category": "mermaid",
      "code": "MERMAID_RENDER"
    }
  ]
}
```

- `ok` は `errors === 0` と同値です
- `severity` は `error` / `warning` / `info`
- `code` は安定 ID（機械可読。一覧は [08](./08-入力解読仕様.md)）
- GUI のチェックバッジはこの結果を表示します

解析処理自体の例外は `400` です。

---

## 4. POST `/preview`

Markdown → プレビュー用 HTML。

### リクエスト

```json
{ "markdown": "..." }
```

- 空の markdown → `400` `markdown is required`
- 体裁は Markdown 先頭の `ohyna:` ブロックを使う

### 静的解析ゲート

処理の前に `/analyze` 相当を実行します。  
**error が 1 件以上 → HTTP 422**

```json
{
  "ok": false,
  "error": "静的解析エラーが N 件あるため処理できません",
  "diagnostics": [ ... ],
  "errors": N,
  "warnings": M
}
```

warning のみなら通過します。

### 成功応答

`{ "html": "<!DOCTYPE html>..." }`

生成例外は `400` です。

GUI は文書設定未完了のときこの API を呼びません。HTTP を直接叩く場合も解析ゲートは常に掛かります。

---

## 5. POST `/pdf`

リクエスト形は `/preview` と同じ（`{ "markdown": "..." }`）です。静的解析ゲートも同じ（error 時 **422**）。

成功時は `application/pdf`（ファイル名 `document.pdf`）を返します。

生成例外は `400` です。

---

## 6. CLI

```
python -m ohyna [--list-styles] <command> ...
```

| コマンド | 役割 |
|----------|------|
| `--list-styles` | 色テーマ名を一覧して終了 |
| `render [input] [-o out] [-s style]` | Mermaid → SVG。stdin 可。入力が `.md` なら先頭の ` ```mermaid ` を抽出 |
| `pdf <input.md> -o out.pdf [options]` | Markdown → PDF（1 ファイル） |
| `serve [--host] [--port]` | HTTP + GUI（ブラウザ／PWA） |

### `pdf` の要点

| 項目 | 内容 |
|------|------|
| 入力 | `.md` 1 ファイル |
| 出力 | `-o` に `.pdf` パス |
| 表紙 | `--no-cover` 以外。FM の `cover` を尊重（未指定は表紙あり） |
| 上書き | `--title` / `--subtitle` / `--part-label` / `-s` / `--theme-css` / `--work-dir` |
| 静的解析ゲート | **なし**（HTTP `/pdf` とは異なる） |

CLI はバッチ・自動処理用途を想定するため解析ゲートを設けません。品質ゲートが必要なときは利用者が HTTP `/analyze` を先に実行します。

各サブコマンドの引数は `-h` を参照してください。

---

## 7. Python API（要約）

```python
from ohyna import (
    markdown_to_pdf,
    markdown_to_preview_html,
    markdown_file_to_pdf,
    render_flowchart_svg,
    list_presets,
)

markdown_to_pdf(md_text, "out.pdf")
```

公開シンボルの一覧は `ohyna.__all__` を参照してください。
