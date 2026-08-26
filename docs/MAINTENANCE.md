# メンテナンス（サイト一時非公開）の運用

通常のオン/オフは**管理者ビューからライブで**行える（push 不要）。
`maintenance.js` が担うのは次の2つだけ。

## ① 手動オーバーライド（緊急停止）

`maintenance.js` の `MANUAL_MAINTENANCE` を `true` にすると、ログインや Firebase の状態に関係なく
すべてのページが `maintenance.html` へ強制転送される（Firebase が落ちている等の非常時用）。

```
1. MANUAL_MAINTENANCE を true にする
2. node tools/bump-version.js
3. git add -A && git commit && git push origin main
```

## ② プレビュー合言葉

メンテ中でも中身を確認するための合言葉。URL に `?preview=<合言葉>` を付けるとメンテをすり抜け、
以後その端末（タブ）は記憶して素通りする。ライブ切替・手動オーバーライドの両方に効く。

- 合言葉そのものはリポジトリに置かない。`maintenance.js` の `PREVIEW_HASH` に **SHA-256 ダイジェストだけ**を保存する。
- 合言葉は**推測されにくい長いもの**にする（公開リポジトリではダイジェストも読めるため、短い語は総当たりで破られる）。
- 変更するときは新しい合言葉のダイジェストを生成して貼り替える:

```bash
node -e "console.log(require('crypto').createHash('sha256').update('新しい合言葉').digest('hex'))"
# または: printf '新しい合言葉' | shasum -a 256
```

## メンテを素通りできる例外

`cloud-sync.js` の純粋関数 `maintShouldBlock(st, exempt, preview)` が判定する。例外は2つで、
どちらも緊急全停止（`fullStop`）にも効く。

1. `exempt` … 管理者が「🛠 メンテ許可」を付けたアカウント（`progress/{uid}.maintOk`）
2. `preview` … プレビュー合言葉を知っている端末

管理者自身は `checkMaintenance()` の冒頭で対象外。
なお `MANUAL_MAINTENANCE` は Firebase を見ないため `maintOk` は効かない＝そのときは合言葉を使う。
