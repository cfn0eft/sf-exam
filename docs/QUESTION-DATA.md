# 問題データの管理・配信

## 構成

- 公開アプリ: `cfn0eft/sf-exam`。問題本文・選択肢・正解・解説を含めない。
- 非公開原本: `cfn0eft/sf-exam-data`。原本・監査資料・移行前のGit履歴を管理する。
- 配信: Firebase `sf-admin-7da9c` の `questionBanks/{slug}` とバージョン別チャンク。
- `question-catalog.json` はID・分野・出典区分・件数・ハッシュだけの公開メタデータ。

## 取得制限

認証済みかつ `progress/{uid}.access == approved` が必要。専門5資格には管理者専用の `specialistAccess == true` も必要。
管理者は `firestore.rules` のUIDで判定する。画面の管理者フラグは読み取り権限を与えない。
学習順序は学習支援のためのUI制約であり、本人が書き換えられる学習履歴をセキュリティ上の権限として使わない。
30日休眠失効と強制ログアウトは既存アプリの運用機能。時刻の偽装に耐える期限付き権限ではない。

問題はサーバーから取得し、全チャンクの件数とSHA-256を照合する。ページを開いている間だけメモリに保持する。
認証・承認・専門許可・接続状態が変わったらメモリを破棄し、学習ページを再読み込みする。
通信失敗時に公開JSONや永続キャッシュから取得するフォールバックはない。
受け取り済みの問題を正規利用者が保存・転載することまで防ぐ仕組みではない。

## 更新

1. 非公開原本を編集し、問題IDを維持する。
2. `SFQ_PRIVATE_DATA_ROOT` に非公開リポジトリの絶対パスを設定する。
3. `node tools/build-question-bank.js` で分割データと公開メタデータを生成する。
4. `node tools/validate-data.js` とエンジン・同期・進行・問題配信テストを実行する。
5. 非公開側をcommit/pushし、同リポジトリの `tools/publish.js --upload` で全問照合後に公開版を切り替える。
6. 公開側のメタデータ・お知らせ・版数を更新して公開する。

原本は公開側のフォルダーに戻さない。公開CIは架空問題を使って構造・参照・出題ロジックを検証する。
本文・選択肢・解説・公式URLの検証は必ず非公開原本で実施する。
権限テスト: `npx firebase emulators:exec --only firestore --project demo-sfq-bank "node tools/test-bank-rules.js"`。

## ローカル画面検証

`npm ci --ignore-scripts` とJava 21を準備し、`npx firebase emulators:start --only auth,firestore --project demo-sfq-bank` を起動する。
別ターミナルで `node tools/serve-dev.js` を起動する。プレビューURLは `http://127.0.0.1:4328/`。
エミュレーターにテスト用アカウント・承認・問題を用意して利用する。本番のデータや認証には接続しない。

## 復旧

非公開リポジトリにある公開前manifestと既存チャンクを照合し、`tools/publish.js --rollback <history.json>` で前版へ戻す。
旧JSONの再公開は行わない。アプリを戻す場合も認証付き配信に対応したコミットを選ぶ。
初回移行以前の履歴は非公開アーカイブとローカルのGit bundleで保管する。
