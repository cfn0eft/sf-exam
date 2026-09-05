/* firebase-config.js — 設定値だけを置くファイル。手順は docs/ を参照。 */

window.SFQ_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCNMqhh8G6h1IEI1L5Q19G4p-CdMLrNDrA",
  authDomain: "sf-admin-7da9c.firebaseapp.com",
  projectId: "sf-admin-7da9c",
  storageBucket: "sf-admin-7da9c.firebasestorage.app",
  messagingSenderId: "296303681021",
  appId: "1:296303681021:web:037f67498c896cd6ea4d94",
  measurementId: "G-PQSXG5S47Z"
};

window.SFQ_EMAILJS = {
  serviceId:  "service_5lywlqe",
  templateId: "template_j139e3s",
  publicKey:  "Xdy5x_z6ZnTmFzgPr"
};

window.SFQ_LOGIN_DOMAIN = "sfquiz.local";
window.SFQ_COLLECTION = "progress";
window.SFQ_ADMIN_ID_HASHES = ["8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918"];

/* 接続・端末情報（管理者ビューの利用者詳細に表示）
 * - IP は末尾を伏せて保存し、生の IP は Firestore に残さない
 * - Cloudflare で接続元 IP/国、ipwho.is で ASN/回線組織を確認する
 * - corporateNetworks に会社の VPN 出口 IP 帯や回線組織名を登録すると
 *   「登録企業回線（一致）」として表示できる
 * - IPv4 CIDR（例: 203.0.113.0/24）と IP の完全一致に対応
 */
window.SFQ_NETWORK_MONITORING = {
  enabled: true,
  retainDays: 30,
  traceUrl: "https://www.cloudflare.com/cdn-cgi/trace",
  lookupUrl: "https://ipwho.is/{ip}",
  corporateNetworks: [
    // { name: "会社名", cidrs: ["203.0.113.0/24"], orgPatterns: ["会社の回線組織名"] }
  ]
};
