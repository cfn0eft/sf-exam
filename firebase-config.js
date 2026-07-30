/* =============================================================
   firebase-config.js  —  ★ここだけ編集すればOK★
   -------------------------------------------------------------
   Firebase コンソールで取得した設定を下の {} の中に貼り付けてください。
   手順は「Firebaseセットアップ手順.md」を参照。
   PC版・モバイル版どちらもこの1ファイルを読み込むので、編集は1か所だけです。
   ============================================================= */

/* -------------------------------------------------------------
   【セキュリティに関する注記】（重要）
   ・下の apiKey は Firebase の「Web 用キー」で、ブラウザに配布される
     “公開前提”の値です。秘密鍵ではありません。
     → GitHub のシークレットスキャンが「Google API Key leaked」と
        警告することがありますが、これは false positive。
        ローテーションや無効化は不要です（やるとアプリが壊れるだけ）。
   ・本当のアクセス制御は「Firestore セキュリティルール」で行います。
     progress/{uid} を「本人＋管理者だけが read/write」に制限すること。
     詳細は SECURITY.md と「certifications/sf-admin/Firebaseセットアップ手順.md」
     のステップ5を参照。ここがテストモード(allow if true)だと本当に危険。
   ・このキーは Google Cloud 側で「HTTP リファラー制限」済み。
     許可: https://cfn0eft.github.io/*  と  http://localhost/*
     → 公開ドメインを増やすときは、同じキーの許可リストにも必ず追加すること
        （追加し忘れるとログイン/同期が 403 で止まる）。
   ------------------------------------------------------------- */

window.SFQ_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCNMqhh8G6h1IEI1L5Q19G4p-CdMLrNDrA",
  authDomain: "sf-admin-7da9c.firebaseapp.com",
  projectId: "sf-admin-7da9c",
  storageBucket: "sf-admin-7da9c.firebasestorage.app",
  messagingSenderId: "296303681021",
  appId: "1:296303681021:web:037f67498c896cd6ea4d94",
  measurementId: "G-PQSXG5S47Z"
};

/* =============================================================
   メール通知（任意・EmailJS）
   -------------------------------------------------------------
   利用申請 / 停止解除の申請 / 利用者からのDM があったとき、管理者の
   メールアドレスに知らせます。**空のままなら何も送りません**（既存の
   動作には影響しません）。サーバ不要・Firebase の Blaze プラン不要。

   ▼ 設定手順（5分・無料枠 200通/月）
    1. https://www.emailjs.com/ で登録（Googleアカウントでログイン可）
    2. 「Email Services」→ Add New Service → Gmail を選び、受信したい
       Gmail アカウント（nero.donatu55@gmail.com）を接続
       → 表示される Service ID をコピー
    3. 「Email Templates」→ Create New Template
       ・To Email … nero.donatu55@gmail.com を**直接ここに書く**
         （宛先はテンプレート側に固定します。下のキーが漏れても他人へ
           メールを送る踏み台にはなりません）
       ・Subject … {{subject}}
       ・Content … 例:
             {{subject}}
             お名前: {{user_name}}
             ログインID: {{user_id}}
             日時: {{at}}
             内容: {{detail}}
             サイト: {{site}}
       → 保存して Template ID をコピー
    4. 「Account」→ General → API Keys の **Public Key** をコピー
       （Private Key は使いません。ブラウザから送るため公開キーだけでOK）
    5. 下の3つに貼り付けて commit → push
    6. 任意: EmailJS の Account → Security で「Allowed origins」に
       https://cfn0eft.github.io を入れておくと、他サイトからの悪用を防げます
    7. 貼り付けたあとは `node tools/bump-version.js` を1回実行してから push
       （このファイルは Service Worker がキャッシュするため。実行しない場合は
         2回目の読み込みから反映されます）
    8. 反映後、管理者ビューのダッシュボードに「✉️ メール通知 🟢有効」が出ます。
       「✉️ テスト送信」で実際に届くか確認できます（失敗時は理由を表示）

   ※ DM の通知には本文の先頭120字を含めます（EmailJS を経由します）。
     含めたくない場合は cloud-sync.js の notifyAdminMail の呼び出しから
     detail を外してください。
   ============================================================= */
window.SFQ_EMAILJS = {
  serviceId:  "",   // 例: "service_xxxxxxx"
  templateId: "",   // 例: "template_xxxxxxx"
  publicKey:  ""    // 例: "AbCdEfGhIjKlMnOp"（Public Key。秘密鍵ではありません）
};

/* ---- 以下は通常は編集不要です ---- */

// 「ID＋パスワード」方式のため、ID を内部的にメールアドレスへ変換します。
// 例: ID「daiki」→「daiki@sfquiz.local」（実在しないドメインでOK）
window.SFQ_LOGIN_DOMAIN = "sfquiz.local";

// 進捗を保存する Firestore のコレクション名
window.SFQ_COLLECTION = "progress";

// 管理者ID（このIDでログインした時だけ、全アカウントの詳細を閲覧・管理できます）
// 複数指定も可: ["admin", "daiki"]
// ※ここを変更したら、Firestoreの「ルール」の管理者メールも合わせて変更してください（手順書参照）
window.SFQ_ADMIN_IDS = ["admin"];
