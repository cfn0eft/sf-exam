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
