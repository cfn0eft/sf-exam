# 管理者IDの運用（平文で置かない）

## いまの仕組み

- 配信ファイル `firebase-config.js` には**管理者IDのハッシュだけ**を置く。

  ```js
  window.SFQ_ADMIN_ID_HASHES = ["<SHA-256 ハッシュ>"];
  ```

- `cloud-sync.js` はログインIDを `sanitizeId`（小文字化＋`a-z0-9._-` 以外を除去）で正規化し、
  SHA-256 を取ってこの配列と照合する。一致したときだけ管理者ビューのボタンを出す。
- **本当の権限は Firestore ルールの UID 判定**（`firestore.rules` の `adminUids()`）が持つ。
  クライアント側の判定は「管理者向けUIを出すかどうか」だけで、他人の進捗を読める権限とは別物。
- 旧来の `window.SFQ_ADMIN_IDS = ["admin"]`（平文）も後方互換で動く。
  ハッシュが1件でも設定されていればハッシュ判定が優先される。

> ⚠️ ハッシュ化は「ソースを見ただけでは管理者IDが分からない」ための対策。
> `admin` のような短い一般語はハッシュから総当たりで簡単に逆引きできるので、
> **推測されにくいIDに変えて初めて意味がある**。

## 管理者IDを変更する手順

1. **新しいIDでアカウントを作る**
   サイトのログイン画面から「新規登録」で、新しい管理者ID＋強いパスワードを登録する
   （内部的に `<新ID>@sfquiz.local` のアカウントになる）。

2. **UID を控える**
   Firebase コンソール → **Authentication → Users** で、いま作ったアカウントの **ユーザー UID** をコピー。

3. **Firestore ルールに UID を足す**
   リポジトリの `firestore.rules` の `adminUids()` に UID を追加し、
   Firebase コンソール → **Firestore → ルール** に貼って公開する。
   （`firestore.rules` が唯一の出典。コンソール側だけ直すと次回上書きされる）

4. **ハッシュを生成して貼る**

   ```bash
   node tools/admin-id-hash.js <新しい管理者ID>
   ```

   出力された `window.SFQ_ADMIN_ID_HASHES = [...]` の行を `firebase-config.js` に貼り替える。

5. **キャッシュ版数を上げて push**

   ```bash
   node tools/bump-version.js
   git add -A && git commit -m "管理者IDを変更" && git push origin main
   ```

6. **動作確認**
   新しいIDでログインして「👑 管理者ビュー」が出ること、一覧が読めることを確認する。
   確認できたら、古い管理者アカウント（`admin` など）の UID を `adminUids()` から外し、
   Firebase コンソールの Authentication からそのアカウントを削除する。

## うまくいかないとき

| 症状 | 見るところ |
|---|---|
| 管理者ビューのボタンが出ない | `SFQ_ADMIN_ID_HASHES` のハッシュとログインIDが一致しているか（`node tools/admin-id-hash.js <ID>` で再生成して比較）。Service Worker のキャッシュが古い可能性もあるので `bump-version.js` を実行したか確認 |
| ボタンは出るが一覧の読み込みに失敗する | Firestore ルールの `adminUids()` に、そのアカウントの UID が入っているか（クライアント判定とルール判定は別物） |
