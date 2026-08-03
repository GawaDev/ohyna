# セキュリティ方針

## 想定する提供形態

Ohyna はサーバに配置し、利用者がブラウザから利用します。

- アプリ本体（`python -m ohyna serve`）はリバースプロキシの背後に置く
- TLS（HTTPS）・認証・レート制限・アクセスログはプロキシまたは IdP で実施する
- Python プロセスは内部ネットワーク上で待ち受ける
- 公開面では認証済みリクエストだけをアプリへ渡す

開発時の既定バインドは `127.0.0.1` です。脅威モデルと HTTP 制約の詳細は [docs/spec/06-セキュリティ.md](./docs/spec/06-セキュリティ.md) を参照してください。

## 脆弱性の報告

セキュリティ上の問題を発見した場合は、公開の Issue に攻撃手順の詳細を書く前に、非公開で連絡してください。

優先順:

1. [GitHub Security Advisory（Private vulnerability reporting）](https://github.com/GawaDev/ohyna/security/advisories/new)
2. [Issue](https://github.com/GawaDev/ohyna/issues)（公開してよい範囲の連絡）またはメンテナへの個別連絡

ソース: [https://github.com/GawaDev/ohyna](https://github.com/GawaDev/ohyna)

報告に含めてほしい情報:

- 影響を受ける版
- 再現手順
- 想定される影響範囲

## 運用上の要点

- 本文・PDF 作成 API は計算コストが高いため、プロキシでレート制限する
- CORS は許可 Origin に付与する。別オリジンが必要なら環境変数 `OHYNA_ALLOWED_ORIGINS`（カンマ区切り）を使う
