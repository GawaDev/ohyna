# 第三者コンポーネント

本ソフトウェアは次のオープンソース／公開リソースに依存します。  
製品本体のライセンスはリポジトリ直下の [LICENSE](./LICENSE)（MIT）です。  
各コンポーネントにはそれぞれのライセンスが適用されます。

> **開発者向け:** 画面ヘルプ用の自己完結版は [`docs/license/02-third-party.md`](./docs/license/02-third-party.md) です。依存表記を変えたらヘルプ版も同じ作業単位で更新し、ヘルプ版から本ファイルや `third_party/` へリンクしないこと。

実行時に CDN やフォントサービスへ接続する場合があります（PDF／プレビュー／解析）。  
オフライン専用運用や再配布形態を変える場合は、同梱方針と表記を見直してください。

依存の詳細一覧（手更新）:

| ファイル | 内容 |
|----------|------|
| [third_party/python.md](./third_party/python.md) | `requirements.txt` 由来の Python パッケージ |
| [third_party/npm-production.csv](./third_party/npm-production.csv) | `web/` の production 依存（ルート `ohyna-web` 自身は除外） |

最終確認（2026-07-31）: Python 依存は BSD / MIT / Apache / PSF 系のみ。npm production はほぼ MIT。例外として `argparse`（JS）が **Python-2.0**（パーミッシブ。再配布可）。

---

## 1. Python 実行時依存（`requirements.txt`）

| パッケージ | 用途 | ライセンス |
|------------|------|-------------------|
| Markdown | Markdown → HTML | BSD-3-Clause |
| pymdown-extensions | Markdown 拡張 | MIT |
| Pygments | コードハイライト | BSD-2-Clause |
| playwright | Chromium 印刷・図／数式検証 | Apache-2.0 |
| PyYAML | Front matter / YAML フェンス | MIT |
| bleach | HTML サニタイズ | Apache-2.0 |

Playwright が取得する **Chromium** バイナリは Playwright の配布条件に従います（リポジトリには含めません。`python -m playwright install chromium` で導入）。

詳細版・推移依存は [third_party/python.md](./third_party/python.md)。

---

## 2. 実行時に参照しうる外部エンジン（CDN）

| コンポーネント | 用途 | ライセンス | 参照 |
|----------------|------|-------------------|------|
| Mermaid.js | 図の描画 | MIT | jsDelivr `mermaid@11` |
| @mermaid-js/mermaid-zenuml | ZenUML 図 | 各パッケージの表記に従う | jsDelivr |
| KaTeX | 数式の描画 | MIT | jsDelivr（ピン固定版） |

CDN 上の配布物そのものの著作権は各プロジェクトに帰属します。本製品はそれらを呼び出して利用します。

---

## 3. フォント（Web / PDF）

プレビュー・PDF・GUI で Google Fonts 等から読み込む場合があります。

| フォント例 | ライセンス |
|------------|-------------------|
| Noto Sans JP / Noto Serif JP | SIL Open Font License 1.1 |
| IBM Plex Mono | SIL Open Font License 1.1 |
| Inter | SIL Open Font License 1.1 |

フォントファイルをリポジトリに同梱して再配布する場合は、各 OFL の条件（ライセンス文の添付など）を守ってください。現状の「URL 参照」運用でも、クレジットを本ファイルに残します。

---

## 4. GUI（`web/`）の主な依存

Node 依存のライセンスは `web/package.json` / lock ファイルおよび [third_party/npm-production.csv](./third_party/npm-production.csv) を参照してください。代表例:

| パッケージ | 用途 | ライセンス |
|------------|------|-------------------|
| React / React DOM | UI | MIT |
| Mantine | UI コンポーネント | MIT |
| CodeMirror 関連 | エディタ | MIT |
| Tabler Icons | アイコン | MIT |
| js-yaml | YAML | MIT |
| marked | ヘルプ表示等 | MIT |
| react-pdf / pdf.js | PDF 確認表示 | Apache-2.0（pdf.js）等 |
| argparse（JS、推移依存） | 設定解析系の推移 | Python-2.0 |
| Vite / 周辺ツール | ビルド | MIT 等 |

---

## 5. 仕様・規格の「参照」について

CommonMark、GFM、ISO 216、BCP 47、JSON Schema、CSS Paged Media などは、**実装の根拠・互換の説明として参照**しています。  
規格文書そのものを再配布しているわけではありません。製品契約（Ohyna Markdown）と外部仕様の境界は [docs/spec/10-準拠仕様マップ.md](./docs/spec/10-準拠仕様マップ.md) を参照してください。

---

## 6. 同梱アセット

| 場所 | 内容 | 注意 |
|------|------|------|
| `themes/covers/**/*.webp` | 表紙背景（style × pattern） | **本プロジェクト向けに生成したオリジナル画像**。第三者ストック素材ではない。ライセンスは本体と同じ MIT（[themes/covers/README.md](./themes/covers/README.md)） |
| `brand/noto-emoji-u1f423.svg` ほか | アプリアイコン（🐣） | Google Noto Color Emoji U+1F423。Copyright 2013 Google LLC。画像リソースは Apache-2.0（[brand/NOTO-EMOJI-NOTICE.txt](./brand/NOTO-EMOJI-NOTICE.txt)） |
| `themes/` その他 | 印刷 CSS・色テーマ | 本体と同じ MIT |
| `gui/` | ビルド済みフロント | `web/` からの生成物。依存のライセンスは上記に含む |

表紙 WebP を第三者素材へ差し替える場合は、その素材のライセンス・クレジットを本ファイルに追記してください。  
`manifest.json` にマシン固有の絶対パスを書かないでください。

---

## 7. 表記の更新

依存を追加・交換したときは、同じ作業単位で本ファイル・`third_party/` の一覧・必要なら [docs/spec/10-準拠仕様マップ.md](./docs/spec/10-準拠仕様マップ.md) の Rendering Profile を更新してください。
