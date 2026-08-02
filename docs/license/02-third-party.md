# 第三者コンポーネント

本ソフトウェアは次のオープンソース／公開リソースに依存します。  
製品本体のライセンスは [MIT License](./01-mit.md) です。  
各コンポーネントにはそれぞれのライセンスが適用されます。

実行時に CDN やフォントサービスへ接続する場合があります（PDF／プレビュー／内容チェック）。

最終確認（2026-07-31）: Python 依存は BSD / MIT / Apache / PSF 系のみ。GUI の production 依存はほぼ MIT。例外として `argparse`（JS）が **Python-2.0**（パーミッシブ。再配布可）。**GPL / AGPL / SSPL は検出なし**。

---

## 1. Python 実行時依存

| パッケージ | 用途 | ライセンス |
|------------|------|-------------------|
| Markdown | Markdown → HTML | BSD-3-Clause |
| pymdown-extensions | Markdown 拡張 | MIT |
| Pygments | コードハイライト | BSD-2-Clause |
| playwright | Chromium 印刷・図／数式検証 | Apache-2.0 |
| PyYAML | ドキュメント設定 / YAML フェンス | MIT |
| bleach | HTML サニタイズ | Apache-2.0 |

Playwright が取得する **Chromium** バイナリは Playwright の配布条件に従います（本製品の配布物には含めません）。

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

プレビュー・PDF・画面で Google Fonts 等から読み込む場合があります。

| フォント例 | ライセンス |
|------------|-------------------|
| Noto Sans JP / Noto Serif JP | SIL Open Font License 1.1 |
| IBM Plex Mono | SIL Open Font License 1.1 |
| Inter | SIL Open Font License 1.1 |

---

## 4. 画面（GUI）の主な依存

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

## 5. 仕様・規格の参照について

CommonMark、GFM、ISO 216、BCP 47、JSON Schema、CSS Paged Media などは、実装の根拠・互換の説明として参照しています。  
規格文書そのものを再配布しているわけではありません。製品が契約する範囲との境界は [準拠仕様マップ](../spec/10-準拠仕様マップ.md) を参照してください。

---

## 6. 同梱アセット

| 内容 | 注意 |
|------|------|
| 表紙背景画像 | 本製品向けに生成したオリジナル画像。第三者ストック素材ではない。ライセンスは本体と同じ MIT |
| アプリアイコン（🐣） | Google Noto Color Emoji（U+1F423）SVG。Copyright 2013 Google LLC。画像リソースは Apache-2.0（`brand/NOTO-EMOJI-NOTICE.txt`） |
| 印刷用スタイル・色テーマ | 本体と同じ MIT |
| 画面のビルド成果 | 上記 GUI 依存のライセンスを含む |
