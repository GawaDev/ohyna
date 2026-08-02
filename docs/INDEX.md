# Ohyna 文書索引

版: **1.0.0**

## 最重要（配信の境界）

**サービス利用者（デプロイされた画面を使う人）が読めるのは、画面ヘルプに載っている文書だけです。**  
GitHub・リポジトリ直下のファイル・開発用パスは見えません。

| 区分 | 誰向け | 置き場 | 画面ヘルプ |
|------|--------|--------|------------|
| 利用者向け | 編集・PDF を使う人 | `docs/manual/`・ヘルプ掲載の `spec/`・`license/` | **出す**（`_DOCS_CATALOG`） |
| 開発・運用向け | 構築・改修・公開する人 | リポジトリ（README / SECURITY / 非掲載の spec など） | **出さない** |

ヘルプ掲載文書の規則:

1. **画面ヘルプだけで自己完結**する（「リポジトリの ○○.md を見て」は禁止）
2. ヘルプ内の他章へのリンクは可（同じカタログ内）
3. ソースパス（`ohyna/...` や `web/src/...`）や `pip` / `npm` 手順を書かない
4. 章を増減したら `ohyna/server.py` の `_DOCS_CATALOG` を同じ作業単位で更新する

---

## 画面ヘルプに出す文書（カタログ）

### マニュアル

| 章 | ファイル |
|----|----------|
| はじめに | `manual/01-intro.md` |
| 画面とファイル操作 | `manual/02-ui-and-files.md` |
| ドキュメント設定 | `manual/03-settings.md` |
| 本文の書き方 | `manual/04-writing.md` |
| 確認と PDF 出力 | `manual/05-preview-and-pdf.md` |
| 困ったとき | `manual/06-troubleshooting.md` |

### 仕様書（利用者向け契約）

| 文書 | 内容 |
|------|------|
| [spec/00-概要と方針.md](./spec/00-概要と方針.md) | 製品の目的と利用者向け方針 |
| [spec/03-文書設定リファレンス.md](./spec/03-文書設定リファレンス.md) | front matter キー |
| [spec/05-印刷とプレビュー.md](./spec/05-印刷とプレビュー.md) | 用紙・プレビュー／PDF の要約 |
| [spec/08-入力解読仕様.md](./spec/08-入力解読仕様.md) | 入力契約 |
| [spec/09-出力仕様.md](./spec/09-出力仕様.md) | 出力契約 |
| [spec/10-準拠仕様マップ.md](./spec/10-準拠仕様マップ.md) | 外部仕様との境界 |

### ライセンス

| 文書 | 内容 |
|------|------|
| [license/01-mit.md](./license/01-mit.md) | MIT License（本文） |
| [license/02-third-party.md](./license/02-third-party.md) | 第三者コンポーネント |

---

## リポジトリ専用（画面ヘルプに出さない）

開発・運用者がリポジトリを持っている前提の文書です。サービス利用者向けヘルプには載せません。

| 文書 | 内容 |
|------|------|
| [spec/01-アーキテクチャ.md](./spec/01-アーキテクチャ.md) | 構成・モジュール |
| [spec/04-APIとCLI.md](./spec/04-APIとCLI.md) | HTTP・CLI・Python API |
| [spec/06-セキュリティ.md](./spec/06-セキュリティ.md) | 脅威モデル・デプロイ制約 |
| [spec/07-開発者ガイド.md](./spec/07-開発者ガイド.md) | ビルド・チェックリスト |
| [spec/11-サイトメタとWebMCP.md](./spec/11-サイトメタとWebMCP.md) | llms.txt・sitemap・WebMCP 調査 |
| [../README.md](../README.md) | 開発クイックスタート |
| [../SECURITY.md](../SECURITY.md) | 脆弱性報告（メンテナ向け） |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | 貢献 |
| [../LICENSE](../LICENSE) / [../THIRD_PARTY.md](../THIRD_PARTY.md) | ライセンス正本（ヘルプ版は `docs/license/`） |
