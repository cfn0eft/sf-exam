# コードの補足メモ（配信ファイルから退避したもの）

公開サイトで配信する JS/CSS/HTML には、個人情報や運用手順をコメントで書かない方針にした
（ブラウザの「ソースを表示」で誰でも読めるため）。各ファイルの役割と、コードだけでは分かりにくい
設計判断をここにまとめる。細かい経緯は git 履歴を参照。

## ファイルの役割

| ファイル | 役割 |
|---|---|
| `quiz-engine.js` | 全資格共通のクイズエンジン。各資格ページは `window.CERT_CONFIG` を定義してこの1本だけを読む。データは `CERT_CONFIG.dataDir` 配下の JSON を実行時 fetch。HTML の inline onclick が依存するため IIFE で包まずグローバル関数のまま。 |
| `cloud-sync.js` | Firebase Auth（ID＋パスワード）＋ Firestore の同期と管理者ビュー。編集不要で、設定は `firebase-config.js` に置く。 |
| `progression.js` | 資格のロック解除（直列進行）の唯一の出典。LP と全資格ページが共有する。 |
| `changelog.js` | アップデート履歴の唯一の出典。先頭に1件足すと未読判定（localStorage `sfq_news_seen` と先頭 id の不一致）で全員に「NEW」が出る。 |
| `figures.js` | 図解の唯一の出典。キーは `"<slug>/<name>"`。色を持たずクラス＋幾何だけのインラインSVG で、テーマ追従は `quiz.css` の `.qfig svg` 側に集約。描画は `figHTML()/setFig()/openFig()`。 |
| `maintenance.js` | メンテナンスの手動オーバーライドとプレビュー合言葉（→ `docs/MAINTENANCE.md`）。 |
| `sw.js` | PWA の Service Worker。 |

## 設計判断のメモ

- **模試の分野別出題数（`examQuota`）**: 最大剰余法で weight どおりに配分する。分野ごとに独立して
  `Math.round` すると合計が n からずれ、最後の `slice(0,n)` で「配列の末尾＝`domains.json` の後ろの分野」
  だけが系統的に切り捨てられていた。在庫が足りない分野は在庫までに丸め、あふれた分は在庫の残る分野へ
  weight 比で配り直す（不足分を全問題からランダム補填すると在庫の多い分野に寄る）。
- **休眠アカウントの承認失効（`accessExpired`・30日）**: 起点は `lastSeen`・`lastLogin`・`approvedAt` の
  最も新しいもの。ログインしたまま毎日使っている人の誤失効と、再承認直後の再失効を防ぐため。
  進捗（`stores`）は消さない。管理者は対象外。
- **Service Worker のキャッシュ方針**: HTML＝ネットワーク優先（ハードリロードなしで更新を反映）、
  `?v=` 付きの JS/CSS＝キャッシュ優先＋裏で更新、学習データ `data/*.json`＝別キャッシュ `DATA_CACHE`
  （`CACHE` 版数を上げても消えない＝毎リリースで全資格ぶんを再ダウンロードさせない）、
  クロスオリジン（Firebase 等）＝ネットワーク優先。
- **進行のロック（`progression.js`）**: アドミン → アプリビルダー → デベロッパー → 残り5資格から1つ選択。
  取得済みにした資格は学習ロック（中身を見ずに「取得済み」だけ押して先取りするのを防ぐ）。
  判定はクラウド（`window.SFQ_PROGRESS` ＋ `'sfq-progress'` イベント）と localStorage 走査の2系統。
- **メンテ画面の既定値（`maintenance.html` の `CFG`）**: 管理者ビューからのライブ切替で来た場合は
  Firestore の設定が優先。`CFG` は手動オーバーライド時や Firestore が読めないときの既定。
  `start`/`end` は JST の `+09:00` 付き ISO 8601、`id` は空なら開始日から `MNT-YYYYMMDD-01` を自動採番、
  `contact` は空なら非表示。
- **ルート LP のログイン**: LP は進捗ストアを持たない `gateway` ロール。未ログインだとログイン画面で覆われ
  資格カードを選べない。Firebase 未設定のときは締め出しを避けるため自動で同期なし通過。
