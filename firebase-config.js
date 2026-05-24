/* =============================================================
   firebase-config.js  —  ★ここだけ編集すればOK★
   -------------------------------------------------------------
   Firebase コンソールで取得した設定を下の {} の中に貼り付けてください。
   手順は「Firebaseセットアップ手順.md」を参照。
   PC版・モバイル版どちらもこの1ファイルを読み込むので、編集は1か所だけです。
   ============================================================= */

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
