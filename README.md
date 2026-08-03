# Ohyna

**Ohyna**（Open Hybrid Note App／おひな）は、Markdown 文書を A4 の印刷向け PDF に変換するアプリケーションです。Web GUI・HTTP API・CLI を備え、1 つの Markdown から 1 つの PDF を出力します。

| | |
|--|--|
| ソース | [github.com/GawaDev/ohyna](https://github.com/GawaDev/ohyna) |
| デモ | [ohyna.onrender.com](https://ohyna.onrender.com/) |
| ライセンス | [MIT](./LICENSE) |
| 第三者表記 | [THIRD_PARTY.md](./THIRD_PARTY.md) |
| セキュリティ | [SECURITY.md](./SECURITY.md) |
| 貢献 | [CONTRIBUTING.md](./CONTRIBUTING.md) |
| 文書索引 | [`docs/INDEX.md`](docs/INDEX.md) |

版: **1.0.0**（正本 [`VERSION`](./VERSION) / 変更履歴 [`CHANGELOG.md`](./CHANGELOG.md)）

## 開発時の起動

リポジトリルートで:

```bash
pip install -r requirements.txt
python -m playwright install chromium
python -m ohyna serve --host 127.0.0.1 --port 8787
```

ブラウザ: [http://127.0.0.1:8787/](http://127.0.0.1:8787/)  
PWA としてもインストールできます。

```bash
python -m ohyna pdf doc.md -o out.pdf
```

パッケージとして入れる場合:

```bash
pip install -e .
```

## 本番配置

```text
利用者 → HTTPS（認証・レート制限付きリバースプロキシ） → serve（内部ネットワーク）
```

- TLS・認証・レート制限はプロキシまたは IdP で実施する
- `serve` は内部ネットワーク上で待ち受ける
- 別オリジンから API を呼ぶ場合は `OHYNA_ALLOWED_ORIGINS` を設定する
- 詳細: [SECURITY.md](./SECURITY.md)、[docs/spec/06-セキュリティ.md](docs/spec/06-セキュリティ.md)

## 文書

| 区分 | 場所 |
|------|------|
| マニュアル | [`docs/manual/`](docs/manual/) |
| 仕様書 | [`docs/spec/`](docs/spec/) |
| ライセンス（ヘルプ用） | [`docs/license/`](docs/license/) |

文書の区分は [`docs/INDEX.md`](docs/INDEX.md)。

## 運用上の要点

- 本番はリバースプロキシ配下（HTTPS・認証・レート制限）
- プレビュー／PDF には、タイトル・色テーマ・フォント・言語を含む `ohyna:` 設定が必要
- 検査で error が 0 件のとき、プレビュー更新と PDF 作成が進む
- 配布・印刷の確認は PDF 確認画面。画面プレビューは編集用の近似

## 公開時のサイトメタ

| パス | 内容 |
|------|------|
| `/llms.txt` | エージェント向け索引 |
| `/sitemap.xml` | URL 一覧 |
| `/robots.txt` | クローラ向け案内 |
| `/.well-known/security.txt` | 脆弱性連絡先 |

本番では `OHYNA_PUBLIC_ORIGIN`（デモ例: `https://ohyna.onrender.com`）と `OHYNA_SECURITY_CONTACT` を設定する。詳細は [docs/spec/11-サイトメタとWebMCP.md](docs/spec/11-サイトメタとWebMCP.md)。

## GUI の再ビルド

```bash
cd web && npm install && npm run build
```

成果物は `gui/` に出力されます。ソースを変えたら同じ作業単位で再ビルドしてください。

## コンテナ / Render

Docker イメージで起動できます（Chromium 同梱）。

```bash
docker build -t ohyna .
docker run --rm -p 8787:8787 -e PORT=8787 ohyna
```

[Render](https://render.com/) ではリポジトリの `render.yaml`（Blueprint）を使います。PDF 作成のため **Standard（2 GB）以上** を推奨します。公開デモは [https://ohyna.onrender.com/](https://ohyna.onrender.com/) です（`OHYNA_PUBLIC_ORIGIN` は Blueprint で同 URL を指定）。

## ライセンス

ソースおよび同梱の表紙画像（`themes/covers/`）は [MIT License](./LICENSE)。  
依存ライブラリ・CDN・フォント等は [THIRD_PARTY.md](./THIRD_PARTY.md)。
