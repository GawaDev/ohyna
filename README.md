# Ohyna

**Ohyna**（Open Hybrid Note App／おひな）— 日本語ドキュメント向け **Markdown → 印刷品質 PDF**（Web GUI / API / 公式 Mermaid.js）。1 つの Markdown から 1 つの PDF を作ります。

サーバに展開し、一般利用者がブラウザから使うことを想定しています。  
**開発・運用の文書索引は [`docs/INDEX.md`](docs/INDEX.md)。** デプロイ済み画面の利用者が読めるのはヘルプ（`_DOCS_CATALOG`）に載った文書だけです。

| | |
|--|--|
| ライセンス | [MIT](./LICENSE) |
| 第三者表記 | [THIRD_PARTY.md](./THIRD_PARTY.md) |
| セキュリティ | [SECURITY.md](./SECURITY.md) |
| 貢献 | [CONTRIBUTING.md](./CONTRIBUTING.md) |

版: **1.0.0**

## クイックスタート（開発）

```bash
cd ohyna
pip install -r requirements.txt
python -m playwright install chromium
python -m ohyna serve --host 127.0.0.1 --port 8787
```

ブラウザ: [http://127.0.0.1:8787/](http://127.0.0.1:8787/)  
（インストール可能な **PWA** としても使えます）

```bash
python -m ohyna pdf doc.md -o out.pdf
```

## 本番デプロイ（概要）

```text
利用者 → HTTPS（認証・レート制限付きリバースプロキシ） → serve（内部のみ）
```

- TLS・認証・レート制限はプロキシ／IdP 側で実施する（アプリ単体に認証はない）
- `serve` はインターネットへ直接晒さない
- 別オリジンから API を呼ぶ場合のみ `OHYNA_ALLOWED_ORIGINS` を設定する
- 詳細は [docs/spec/06-セキュリティ.md](docs/spec/06-セキュリティ.md) / [SECURITY.md](./SECURITY.md)

## 文書一覧

索引: [`docs/INDEX.md`](docs/INDEX.md)

| 区分 | 場所 |
|------|------|
| マニュアル | [`docs/manual/`](docs/manual/) |
| 仕様書 | [`docs/spec/`](docs/spec/) |
| ライセンス | [`docs/license/`](docs/license/)（ヘルプ配信の自己完結本文。開発者向け正本はルート LICENSE / THIRD_PARTY.md） |

GUI ヘルプに出す文書はカタログ掲載分のみ（利用者向けマニュアル／契約仕様／ライセンス）。アーキテクチャ・API・セキュリティ詳細・開発者ガイドはリポジトリ専用です（一覧は INDEX）。

## 運用上の必須事項

- **本番はリバースプロキシ配下**（HTTPS・認証・レート制限。生の `serve` を公開しない）
- GUI・HTTP プレビュー／PDF: **タイトル・色テーマ・フォント・言語** を含む `ohyna:` ブロックが必要
- 静的解析で **error があるとプレビュー更新・PDF 生成を行わない**
- 最終確認は **PDF生成**後の確認モーダル（画面プレビューは高速近似）

## サイトメタ（公開時）

| パス | 内容 |
|------|------|
| `/llms.txt` | LLM／エージェント向け索引 |
| `/sitemap.xml` | URL 一覧 |
| `/robots.txt` | クローラ案内 |
| `/.well-known/security.txt` | 脆弱性連絡先 |

本番では `OHYNA_PUBLIC_ORIGIN`（例: `https://notes.example.com`）と `OHYNA_SECURITY_CONTACT` を設定してください。詳細は [docs/spec/11-サイトメタとWebMCP.md](docs/spec/11-サイトメタとWebMCP.md)。

## GUI 再ビルド

```bash
cd web && npm install && npm run build
```

## ライセンス

本リポジトリのソースおよび同梱の表紙 WebP（`themes/covers/`）は [MIT License](./LICENSE) です。  
利用しているライブラリ・CDN・フォント等は [THIRD_PARTY.md](./THIRD_PARTY.md) を参照してください。
