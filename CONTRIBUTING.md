# 貢献ガイド

ソース: [https://github.com/GawaDev/ohyna](https://github.com/GawaDev/ohyna)  
プルリクエスト・Issue: [Issues](https://github.com/GawaDev/ohyna/issues)  
公開デモ: [https://ohyna.onrender.com/](https://ohyna.onrender.com/)

版の正本は [`VERSION`](./VERSION) です。リリース手順は [docs/spec/07-開発者ガイド.md](./docs/spec/07-開発者ガイド.md) の「版」と [`CHANGELOG.md`](./CHANGELOG.md) を参照してください。

## 開発環境

リポジトリルートで:

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
# または: pip install -e .
python -m playwright install chromium

cd web
npm install
npm run build
cd ..

python -m ohyna serve --host 127.0.0.1 --port 8787
```

文書の置き場は [`docs/INDEX.md`](./docs/INDEX.md)。挙動を変える変更は、実装と `docs/` を同じ作業単位で更新します。

画面ヘルプは `_DOCS_CATALOG` の掲載表に従い、本文をページ内で完結させます。アーキテクチャ、API・CLI、セキュリティ詳細、開発者ガイドはリポジトリ側で更新します。

## 変更時の確認

[docs/spec/07-開発者ガイド.md](./docs/spec/07-開発者ガイド.md) のチェックリスト。最低限:

```bash
cd web && npm run build
python -m ohyna pdf web/src/sample.md -o out/sample.pdf
```

## プルリクエスト

- 利用者向け文言は操作が分かる表現にする
- 依存や CDN・フォントを増やしたら [THIRD_PARTY.md](./THIRD_PARTY.md)、[`third_party/`](./third_party/)、[`docs/license/02-third-party.md`](./docs/license/02-third-party.md) を同じ作業単位で更新する
- ヘルプ掲載文書はカタログ内リンクと正規 URL で自己完結させる
- セキュリティに関わる変更は [SECURITY.md](./SECURITY.md) と [docs/spec/06-セキュリティ.md](./docs/spec/06-セキュリティ.md) を確認する
- `themes/covers/manifest.json` はリポジトリ相対パスで書く
- GUI を変えたら `cd web && npm run build` で `gui/` を同じコミットに含める

## ライセンス

貢献はリポジトリの [LICENSE](./LICENSE)（MIT）の条件で提供されるものとします。
