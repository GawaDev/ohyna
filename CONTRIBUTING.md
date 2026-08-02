# 貢献ガイド

## 開発環境

```bash
cd ohyna
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m playwright install chromium

cd web
npm install
npm run build
cd ..

python -m ohyna serve --host 127.0.0.1 --port 8787
```

文書構成は [`docs/INDEX.md`](./docs/INDEX.md) を参照してください。挙動を変える変更は、実装と `docs/` を同じ作業単位で更新してください。

画面ヘルプには利用者向け文書のみを載せます。アーキテクチャ、API・CLI、セキュリティ詳細、開発者ガイドはリポジトリ専用とし、ヘルプ本文は画面だけで自己完結させてください。

## 変更時の確認

[docs/spec/07-開発者ガイド.md](./docs/spec/07-開発者ガイド.md) のチェックリストに従ってください。最低限:

```bash
cd web && npm run build
python -m ohyna pdf web/src/sample.md -o out/sample.pdf
```

## プルリクエスト

- 利用者向け文言は操作が分かる表現にする（実装都合の括弧注釈を避ける）
- 依存や CDN・フォントを増やしたら [THIRD_PARTY.md](./THIRD_PARTY.md)、[`third_party/`](./third_party/)、[`docs/license/02-third-party.md`](./docs/license/02-third-party.md) を同じ作業単位で更新する
- ヘルプ掲載文書にリポジトリ外ファイルへの誘導を書かない
- セキュリティに関わる変更は [SECURITY.md](./SECURITY.md) と [docs/spec/06-セキュリティ.md](./docs/spec/06-セキュリティ.md) を確認する
- `themes/covers/manifest.json` にマシン固有の絶対パスを書かない

## ライセンス

貢献はリポジトリの [LICENSE](./LICENSE)（MIT）の条件で提供されるものとします。
