# Ohyna

**Ohyna**（Open Hybrid Note App／おひな）は、Markdown 文書を A4 の印刷向け PDF に変換するアプリケーションです。Web GUI・HTTP API・CLI を備え、1 つの Markdown から 1 つの PDF を出力します。

| | |
|--|--|
| ライセンス | [MIT](./LICENSE) |
| 第三者表記 | [THIRD_PARTY.md](./THIRD_PARTY.md) |
| セキュリティ | [SECURITY.md](./SECURITY.md) |
| 貢献 | [CONTRIBUTING.md](./CONTRIBUTING.md) |
| 文書索引 | [`docs/INDEX.md`](docs/INDEX.md) |

版: **1.0.0**

## 開発時の起動

```bash
cd ohyna
pip install -r requirements.txt
python -m playwright install chromium
python -m ohyna serve --host 127.0.0.1 --port 8787
```

ブラウザ: [http://127.0.0.1:8787/](http://127.0.0.1:8787/)  
PWA としてもインストールできます。

```bash
python -m ohyna pdf doc.md -o out.pdf
```

## 本番配置

```text
利用者 → HTTPS（認証・レート制限付きリバースプロキシ） → serve（内部ネットワーク）
```

- TLS・認証・レート制限はプロキシまたは IdP で実施する
- `serve` をインターネットに直接公開しない
- 別オリジンから API を呼ぶ場合は `OHYNA_ALLOWED_ORIGINS` を設定する
- 詳細: [SECURITY.md](./SECURITY.md)、[docs/spec/06-セキュリティ.md](docs/spec/06-セキュリティ.md)

## 文書

| 区分 | 場所 |
|------|------|
| マニュアル | [`docs/manual/`](docs/manual/) |
| 仕様書 | [`docs/spec/`](docs/spec/) |
| ライセンス（ヘルプ用） | [`docs/license/`](docs/license/) |

画面ヘルプに載せる文書と、リポジトリ専用の開発者向け文書の区分は [`docs/INDEX.md`](docs/INDEX.md) を参照してください。

## 運用上の要点

- 本番ではリバースプロキシ配下で運用する（HTTPS・認証・レート制限）
- プレビュー／PDF には、タイトル・色テーマ・フォント・言語を含む `ohyna:` 設定が必要
- 検査で error があるあいだは、プレビュー更新と PDF 生成を行わない
- 配布・印刷の確認は PDF 作成後の確認画面で行う（画面プレビューは編集用の近似表示）

## 公開時のサイトメタ

| パス | 内容 |
|------|------|
| `/llms.txt` | エージェント向け索引 |
| `/sitemap.xml` | URL 一覧 |
| `/robots.txt` | クローラ向け案内 |
| `/.well-known/security.txt` | 脆弱性連絡先 |

本番では `OHYNA_PUBLIC_ORIGIN`（例: `https://notes.example.com`）と `OHYNA_SECURITY_CONTACT` を設定してください。詳細は [docs/spec/11-サイトメタとWebMCP.md](docs/spec/11-サイトメタとWebMCP.md) です。

## GUI の再ビルド

```bash
cd web && npm install && npm run build
```

## コンテナ / Render

Docker イメージで起動できます（Chromium 同梱）。

```bash
docker build -t ohyna .
docker run --rm -p 8787:8787 -e PORT=8787 ohyna
```

[Render](https://render.com/) ではリポジトリの `render.yaml`（Blueprint）を使います。PDF 生成のため **Standard（2 GB）以上** を推奨します。デプロイ後、`OHYNA_PUBLIC_ORIGIN` に公開 URL（例: `https://ohyna.onrender.com`）を設定してください。

## ライセンス

本リポジトリのソースおよび同梱の表紙画像（`themes/covers/`）は [MIT License](./LICENSE) です。  
依存ライブラリ・CDN・フォント等は [THIRD_PARTY.md](./THIRD_PARTY.md) を参照してください。
