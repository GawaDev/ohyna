# Ohyna 文書索引

版: **1.0.0**

| | |
|--|--|
| ソース | [https://github.com/GawaDev/ohyna](https://github.com/GawaDev/ohyna) |
| デモ | [https://ohyna.onrender.com/](https://ohyna.onrender.com/) |

## 配信の区分

サービス利用者が読めるのは、画面ヘルプに掲載された文書です。リポジトリ直下のファイルや開発用パスは、利用者の閲覧対象外です。

| 区分 | 対象読者 | 置き場 | 画面ヘルプ |
|------|----------|--------|------------|
| 利用者向け | 編集・PDF を使う人 | `docs/manual/`、ヘルプ掲載の `spec/`・`license/` | 掲載する |
| 開発・運用向け | 構築・改修・公開する人 | リポジトリ（README、SECURITY、非掲載の spec など） | 掲載しない |

ヘルプ掲載文書の規則:

1. 画面ヘルプだけで自己完結する（リポジトリファイルへの誘導を書かない）
2. ヘルプ内の他章へのリンクは可（同じカタログ内）
3. ソースパスや `pip` / `npm` 手順を書かない
4. 章を増減したら `ohyna/server.py` の `_DOCS_CATALOG` を同じ作業単位で更新する

---

## 画面ヘルプに掲載する文書

### マニュアル

| 章 | ファイル |
|----|----------|
| はじめに | `manual/01-intro.md` |
| 画面とファイル操作 | `manual/02-ui-and-files.md` |
| ドキュメント設定 | `manual/03-settings.md` |
| 本文の書き方 | `manual/04-writing.md` |
| 確認と PDF 出力 | `manual/05-preview-and-pdf.md` |
| 困ったとき | `manual/06-troubleshooting.md` |

### 仕様書（利用者向け）

| 文書 | 内容 |
|------|------|
| [spec/00-概要と方針.md](./spec/00-概要と方針.md) | 製品の目的と方針 |
| [spec/03-文書設定リファレンス.md](./spec/03-文書設定リファレンス.md) | front matter キー |
| [spec/05-印刷とプレビュー.md](./spec/05-印刷とプレビュー.md) | 用紙・プレビュー／PDF |
| [spec/08-入力解読仕様.md](./spec/08-入力解読仕様.md) | 入力契約 |
| [spec/09-出力仕様.md](./spec/09-出力仕様.md) | 出力契約 |
| [spec/10-準拠仕様マップ.md](./spec/10-準拠仕様マップ.md) | 外部仕様との境界 |

### ライセンス

| 文書 | 内容 |
|------|------|
| [license/01-mit.md](./license/01-mit.md) | MIT License |
| [license/02-third-party.md](./license/02-third-party.md) | 第三者コンポーネント |

---

## リポジトリ専用（ヘルプ非掲載）

| 文書 | 内容 |
|------|------|
| [spec/01-アーキテクチャ.md](./spec/01-アーキテクチャ.md) | 構成・モジュール |
| [spec/04-APIとCLI.md](./spec/04-APIとCLI.md) | HTTP・CLI・Python API |
| [spec/06-セキュリティ.md](./spec/06-セキュリティ.md) | 脅威モデル・配置制約 |
| [spec/07-開発者ガイド.md](./spec/07-開発者ガイド.md) | ビルド・チェックリスト |
| [spec/11-サイトメタとWebMCP.md](./spec/11-サイトメタとWebMCP.md) | llms.txt・sitemap・WebMCP |
| [../README.md](../README.md) | 開発時の起動手順 |
| [../SECURITY.md](../SECURITY.md) | 脆弱性報告 |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | 貢献 |
| [../LICENSE](../LICENSE) / [../THIRD_PARTY.md](../THIRD_PARTY.md) | ライセンス本文（ヘルプ版は `docs/license/`） |
