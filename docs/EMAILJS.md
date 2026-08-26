# メール通知の設定（EmailJS・任意）

`firebase-config.js` の `window.SFQ_EMAILJS` に3つのIDを入れると、
**利用申請 / 停止解除の申請 / 利用者からのDM** が発生したときに管理者のメールへ通知が届く。
**空のままなら何も送らない**（既存の動作には影響しない）。サーバ不要・Firebase の Blaze プラン不要。

> ⚠️ 宛先（管理者のメールアドレス）は EmailJS のテンプレート側にだけ書く。
> **リポジトリには絶対に書かない**（公開リポジトリなのでソースに書くと誰でも読める）。

## 手順（5分・無料枠 200通/月）

1. <https://www.emailjs.com/> で登録（Googleアカウントでログイン可）
2. **Email Services** → Add New Service → Gmail を選び、**通知を受け取りたい Gmail アカウント**を接続
   → 表示される **Service ID** をコピー
3. **Email Templates** → Create New Template
   - **To Email** … 受け取りたいメールアドレスを**テンプレート側に直接書く**
     （宛先をテンプレートに固定するので、公開キーが露出しても他人へメールを送る踏み台にはならない）
   - **Subject** … `{{subject}}`
   - **Content** … 例:
     ```
     {{subject}}
     お名前: {{user_name}}
     ログインID: {{user_id}}
     日時: {{at}}
     内容: {{detail}}
     サイト: {{site}}
     ```
   - 保存して **Template ID** をコピー
4. **Account → General → API Keys** の **Public Key** をコピー
   （Private Key は使わない。ブラウザから送るため公開キーだけでOK）
5. `firebase-config.js` の `SFQ_EMAILJS` に3つを貼り付ける
6. 任意: EmailJS の Account → Security の **Allowed origins** に公開ドメインを入れておくと、
   他サイトからの悪用を防げる
7. 貼り付けたあとは `node tools/bump-version.js` を1回実行してから push
   （Service Worker がキャッシュするため。実行しない場合は2回目の読み込みから反映）
8. 反映後、管理者ビューのダッシュボードに「✉️ メール通知 🟢有効」が出る。
   「✉️ テスト送信」で実際に届くか確認できる（失敗時は理由を表示）

## 実装メモ

- 送信口は `cloud-sync.js` の `notifyAdminMail(kind, info, cb)` 1本だけ（`kind` は `apply`/`unblock`/`dm`/`test`）。
- 送信は「操作した利用者のブラウザ」から EmailJS の REST API を直接叩く fire-and-forget。
  失敗しても申請やDMの保存は成功させる。DM のみ端末ローカルで5分に1通へ間引く。
- DM の通知には本文の先頭120字を含める（EmailJS を経由する）。含めたくない場合は
  `notifyAdminMail` の呼び出しから `detail` を外す。
- 取りこぼしが問題になる場合は `notifyAdminMail` の中身だけを Cloud Functions や
  GitHub Actions 方式に差し替えればよい（呼び出し側は不変）。
