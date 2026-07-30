# sf-exam (SFadmin)

Salesforce 認定資格の学習用クイズサイト。GitHub Pages で配信される静的サイト。

- 公開URL: https://cfn0eft.github.io/sf-exam/
- リポジトリ: https://github.com/cfn0eft/sf-exam (main ブランチ)
- ローカル: `C:\Users\Nerod\ドキュメント\sf-exam`
- 対応資格（全8資格 LP 公開済）: Administrator (合格済・437問) / Platform App Builder (445問) / Developer (499問) / Agentforce Specialist (138問) / Sales Cloud コンサル (200問) / Service Cloud コンサル (120問) / Experience Cloud コンサル (132問) / Sharing & Visibility アーキテクト (81問)

---

## アーキテクチャ（2026-05-25 完全共通エンジン化）

**全資格で共通のロジックを1本に統一済み。資格を増やすときもエンジンには触らない。**

```
sf-exam/
├── index.html            # LP (gateway)。資格カードは末尾の CERTS 配列から自動生成。お知らせバナー＋モーダルも持つ
├── quiz-engine.js        # 全資格共通の単一エンジン（約2950行）
├── quiz.css              # 全資格共通
├── changelog.js          # アップデート履歴データ window.SFQ_CHANGELOG（LP・全資格で共有・唯一の出典）
├── figures.js            # 図解データ window.SFQ_FIGURES（全資格共有・唯一の出典。色は持たずクラス＋幾何のみのインラインSVG）
├── firebase-config.js    # ユーザー編集する唯一の Firebase 設定
├── cloud-sync.js         # ログイン/同期ロジック（編集不要）
├── manifest.webmanifest  # PWA
├── sw.js                 # Service Worker（キャッシュ版数の更新は tools/bump-version.js で。手作業更新は廃止）
├── tools/                # 開発ツール（下記「開発ツール・CI」参照。サイト配信には含まれない）
├── .github/workflows/ci.yml  # push/PR 毎に validate-data + test-engine + test-cloud-sync を実行
├── docs/HISTORY.md       # 過去リリースの実装メモ（CLAUDE.md から退避したアーカイブ）
└── certifications/
    └── {slug}/
        ├── index.html    # 薄いシェル（共通DOM雛形＋CERT_CONFIG＋engine読込）
        └── data/
            ├── questions.json   # 各問 domain・multi 内蔵に正規化。任意で fig/expFig（figures.js図名）／diff（難易度1=易2=標準3=難）／case+scenario（ケーススタディ束ね）。解説は解答後に全文をまとめて表示
            ├── domains.json     # {domains:[{code,name,weight,emoji}], map?}
            ├── vocab.json       # 章配列 {chapter,terms:[{title,jaName,enName,definition,examPoints[],questions[]}]}（用語に任意で fig）
            ├── navmap.json      # [{title,content}] 設定マップ
            ├── cram.json        # [{title,content}] 直前対策（教科書タブ）
            ├── compare.json     # [{title,domain,content}] 比較表（教科書タブ）
            └── lessons.json     # [{title,…}] 授業（スライド学習）。無い資格は空配列扱い（ホーム導線も非表示）
```

**ロジックを直すのは `quiz-engine.js` の1ファイルだけ。各資格の中身は `data/*.json` を編集する。**

シェルのスクリプト読込順: `CERT_CONFIG` → `quiz-engine.js` → `cloud-sync.js`（同期は engine 定義の `__getStore/__setStore/__refreshUI` に依存）。

エンジンは IIFE で包まずグローバル関数のまま（HTML の inline onclick 依存）。

### 資格別パラメータ

| 資格 | slug | examCode | examN | examMin | pass | storageKey | 分野 |
|---|---|---|---|---|---|---|---|
| Administrator | sf-admin | ADM-201 | 60 | 105 | 65 | sfq_v4 | 8 (cfg/obj/auto/data/sales/service/prod/agf) |
| App Builder | app-builder | CRT-403 | 60 | 105 | 63 | sfqab_v1 | 5 (fund/data/logic/ui/deploy) |
| Developer | developer | CRT-450 | 60 | 105 | 68 | sfqdev_v1 | 4 (fund/logic/ui/deploy) |
| Agentforce Specialist | agentforce | （なし） | 60 | 105 | 73 | sfqaf_v1 | 6 (agents/prompt/data360/deploy/gov/orch) |
| Sales Cloud コンサル | sales-cloud | CRT-251 | 60 | 105 | 69 | sfqsales_v1 | 5 (strat/app/life/data/ai) |
| Service Cloud コンサル | service-cloud | CRT-261 | 60 | 105 | 67 | sfqservice_v1 | 8 (ind/strat/design/know/channel/case/analytics/integ) |
| Experience Cloud コンサル | experience-cloud | CRT-271 | 60 | 105 | 62 | sfqexp_v1 | 8 (admin/share/brand/auth/theme/basics/custom/adopt) |
| Sharing & Visibility アーキテクト | sharing-visibility | （なし） | 60 | 120 | 67 | sfqsva_v1 | 4 (obj/rec/other/model) |

Developer は公式4分野（基礎23/自動化とロジック30/UI25/テスト・リリース22）で **2026-06-13 に LP 公開済み**。問題は **499問**（生成オリジナル217＋タイソンブログ由来215＋jpnshiken由来67）。出題設定に出典フィルタあり。2026-06-21 に出典横断（tyson↔jpn 29件・gen↔tyson 1件）の重複30問を統合（同一問題は tyson を残して相手を削除）し、解答誤り3問（#414 VFのLightning風スタイル／#492 トランザクション制御／#382 ltng:require の機能）を公式仕様に合わせて修正。同日 sf-admin も出典横断の重複23問を統合（460→437問）。文字3-gram は訳ゆれ（同一英語原文の和訳違い）に弱く取りこぼすため、意味ベースで全件照合した（最終確認は人手が前提）。境界ペア（同じ正解だがシナリオ/形式が別）は別問題として残置。

Admin 8分野の公式ブループリント (2025/12/15改訂): Configuration15/ObjectManager&LightningAppBuilder15/Automation15/Data&Analytics17/Sales&Marketing10/Service&Support10/Productivity&Collaboration10/Agentforce8。

App Builder 5分野: 基礎23/データ22/ロジック&自動化28/UI17/リリース10。

### 新資格を追加する手順（これだけ）

1. `certifications/{slug}/data/` にJSONを置く（questions/domains/vocab/navmap は必須、cram/compare は任意）
2. 既存シェル `index.html` を複製し `CERT_CONFIG` を差し替え
3. ルート LP の `CERTS` 配列に1件追加

エンジン・CSS・同期は触らない。追加後は `node tools/validate-data.js` で整合を確認する。

---

## 開発ツール・CI（2026-06-11 新設）

`tools/` の Node スクリプト（依存パッケージなし・node 単体で動く）:

- `node tools/validate-data.js` — データ・アセット整合の一括検証。questions/vocab 等のスキーマ、`fig`/`expFig` が figures.js に実在するか、`case`⇔`scenario` 対応、キャッシュ版数3点セットの整合、主要JSの構文、changelog 形式。**データや図を編集したら必ず実行**（エラーで exit 1）
- `node tools/test-engine.js` — エンジン純粋ロジックのスモークテスト（SRS・難易度推定・復習判定・XP/レベル・模試抽出・store 正規化・重複回避・逆算ペース）。DOMスタブ＋vm でエンジンを丸ごと読み込んで検証。**quiz-engine.js を編集したら必ず実行**
- `node tools/test-cloud-sync.js` — クラウド同期・管理者ビューの集計ロジックのスモークテスト。**cloud-sync.js を編集したら必ず実行**
- `node tools/bump-version.js` — キャッシュ無効化3点セット（sw.js CACHE / SHELL の ?v= / 各HTMLの ?v=）を一括繰り上げ。`--dry` で確認のみ。**手作業での版数更新は廃止**
- `node tools/feedback-to-tasks.js <json>` — 管理者ビューで⬇JSONしたフィードバックを、対応優先度順の Markdown チェックリストに変換（Claude に貼って修正作業を依頼する用）
- `node tools/check-links.js` — 全問題の `reference_url` の死活チェック（404/410 のみエラー。help.salesforce.com の 403 はボット対策なので警告扱い）

`.github/workflows/ci.yml` が push / PR 毎に validate-data + test-engine + test-cloud-sync を自動実行する。`check-links.yml` は週1（月曜 6:00 JST）＋手動実行。

---

## クラウド同期 (Firebase Auth + Firestore)

- 簡易ID＋パスワード方式（内部で `ID@sfquiz.local` に変換）
- Firestore は `progress/{uid}` に保存。doc 構造は `{ stores: { '<slug>': store, ... }, name, email, updated, feedback:[], access, maintOk, approvedAt, expiredAt }`（資格別名前空間。複数資格が同じ uid を共有しても上書きされない）
- `access` は利用承認フラグ（**doc 直下**）。`'approved'`=利用可／`'pending'`（既定・未設定含む）=承認待ち／`'blocked'`=停止。**管理者だけが `approved` を付与でき**（Firestore ルールで本人は `access` を `approved` に書けない）、`approved` 以外は cloud-sync が全面ロック画面（`#sfqc-lock`）を出して問題に触らせない（ホワイトリスト方式）。新規登録は `pending` の doc を生成して管理者ビューに可視化。管理者ビューの各アカウントに「✅ 承認 / ⏸ 停止」トグル＋承認状態フィルタあり。承認待ち画面には「お名前」入力＋利用申請フォームがあり、`doApplyAccess()` が本人 doc に `name` と `req:{name,ts}` を書く（access は pending 維持なのでルール変更不要で本人書込可）。管理者ビューは申請名と「📝 申請 日時」を表示。承認済みは localStorage `sfq_access_<uid>` に控え、オフライン再ログイン時のみ素通し（停止時はクリア）。**この機能は Firestore ルール変更が必須**（`certifications/sf-admin/Firebaseセットアップ手順.md` ステップ5）。⚠️ 既存ユーザーも `access` 未設定＝承認待ちになるため、導入後に管理者ビューで承認が必要。
- **休眠アカウントの承認失効（30日）**: `INACTIVE_DAYS = 30`（`cloud-sync.js`）。承認済みでも「最終アクセス」から30日を超えるとログイン時に自分で `access:'pending'` に戻し（ルール変更不要＝本人は pending へ書ける）、`req` を消して**そのままログアウト**する。次回ログインで「⏳ 利用承認が失効しました」ロック＋申請フォーム＝**再申請が必要**。進捗（`stores`）は消さないので再承認すれば元どおり。起点は `lastSeen`（在席ハートビート）・`lastLogin`・`approvedAt`（管理者の承認日時）の**最も新しいもの**（ログインしたまま使い続けている人の誤失効と、再承認直後の再失効を防ぐ）。記録がまったく無い古い doc は起点なし＝失効させない。オフライン素通し用の localStorage `sfq_access_<uid>` も `{v,ts}` 形式にして30日で失効（旧形式の素の `'approved'` は後方互換で素通し）。管理者は対象外。判定は純粋関数 `accessExpired(data, now)` / `cachedApprovalValid(uid, now)`（`tools/test-cloud-sync.js` で検証）。管理者ビューのユーザータブに「🧹 休眠アカウント … 承認を一括解除」（`sweepExpiredAccess`）があり、ログインしてこない休眠分もまとめて棚卸しできる。失効した doc には `expiredAt`/`expiredDays` が入り、申請一覧・ユーザー一覧に「🧹 休眠失効」チップが出る（新規登録の申請と区別できる）
- `maintOk` は「メンテナンス中でも利用できる」フラグ（**doc 直下**・既定 false）。`true` の間は `checkMaintenance()` が `maintenance.html` への転送をスキップし、代わりに橙バナー「🛠 ただいまメンテナンス中です（このアカウントは利用を許可されています）」を出す。**緊急全停止（`fullStop`）にも効く**。付与/解除は管理者ビューのユーザー一覧の「🛠 メンテ許可」ボタン（＋選択して一括／`🛠 メンテ許可` 絞り込みチップ／メンテ節に許可人数）。**Firestore ルール変更は不要**（既存の `isAdmin()` 全権で管理者だけが書ける）。本人 doc のライブ購読で付与/解除が即時反映され、すでに `maintenance.html` にいる人も `checkExempt()` がトップへ戻す。⚠️ `maintenance.js` の `MANUAL_MAINTENANCE`（手動オーバーライド）は Firebase を見ないため対象外＝そのときはプレビュー合言葉 `?preview=` を使う。判定は純粋関数 `maintShouldBlock(st, exempt, preview)` に切り出し済み（`tools/test-cloud-sync.js` で検証）
- `feedback` は不具合報告/ご意見の配列（**doc 直下・各 store とは別**）。本人 doc への `arrayUnion` で追加（既存ルールのまま＝本人は自 doc 書込可、ルール変更不要）。未ログイン時は localStorage `sfq_feedback_pending` に退避し、次回ログインで `flushPendingFeedback()` が一括送信
- 保存は `doc.update(new FieldPath('stores',CERT_KEY), st, ...)` で当該資格のサブストアを丸ごと置換（deep-merge 回避）
- 保存は 0.8秒デバウンス。`save()` が `window.__cloudSave()` をフック

### ページ役割 (SFQ_PAGE_ROLE)

- `gateway` = ルート LP：ログイン必須のゲートウェイ。進捗 doc は読み書きしない。`window.SFQ_PAGE_ROLE='gateway'`
- `client` = 各クイズページ：進捗を同期。ログイン強制しない。未ログイン時はホームへ誘導。`window.SFQ_HOME_URL='../../index.html'`
- 明示指定が無ければ `__setStore` の有無で自動判定

### メール通知（任意・EmailJS / 2026-07-30 追加）

- 利用申請・停止解除の申請・利用者からのDM が発生したとき、管理者のメールへ通知する。設定は `firebase-config.js` の `window.SFQ_EMAILJS = {serviceId, templateId, publicKey}`（**空なら完全に無効＝既存動作に影響なし**。設定手順はそのファイルのコメントに記載）
- 送信は「操作した利用者のブラウザ」から EmailJS の REST API を直接叩く＝**サーバ不要・Blaze プラン不要**。宛先（To）は EmailJS 側のテンプレートに固定するため、公開キーが露出しても他人へメールを送る踏み台にはならない
- `notifyAdminMail(kind, info, cb)` が唯一の送信口。`kind` は `apply`／`unblock`／`dm`／`test`。通常は fire-and-forget（失敗しても申請やDMの保存は成功させる）。DM のみ端末ローカルで5分に1通へ間引く（`mailThrottled`）
- 管理者ビューのダッシュボードに「✉️ メール通知（🟢有効/🟡未設定）＋テスト送信」。テスト送信だけは HTTP 結果を受け取って成否を表示する
- 取りこぼし（利用者の回線や拡張機能で `api.emailjs.com` が塞がれた1件）が問題になる場合は、`notifyAdminMail` の中身だけを Cloud Functions（Blaze 必須）や GitHub Actions 定期実行に差し替えればよい（呼び出し側は不変）
- ⚠️ DM の通知には本文の先頭120字を含める（EmailJS を経由する）。不要なら呼び出しから `detail` を外す
- 判定は純粋関数 `mailEnabled` / `mailParams` / `mailThrottled`（`tools/test-cloud-sync.js` で検証）

### 管理者ビュー

- 管理者ID = `admin` (`SFQ_ADMIN_IDS=["admin"]`)
- 全アカウント一覧・リセット・削除・CSV書き出し可
- **停止中（blocked）からの「解除の申請」**: 停止中も同じロック画面のフォームから申請できる（ボタンは「この内容で解除を申請する」）。`doApplyAccess` は停止中のとき **`access` を書き換えず `req:{name,ts,unblock:true}` だけ書く**＝自分では停止を解除できない。管理者ビューでは「🔔 申請（あなたの対応待ち）」に「📩 解除申請 <日付>」として並び、停止中チップにも件数（📩N）が出る。却下は「停止中のまま」の文言になる。⚠️ Firestore ルールは `access=='pending'` への自己書込に `resource.data.access != 'blocked'` の条件を追加済み（`Firebaseセットアップ手順.md` ステップ5・既存プロジェクトは貼り直し推奨。アプリは新旧どちらでも動く）
- 申請フォームの名前欄は**常に空欄**で出す（ログインIDを自動で入れると管理者が誰か判別できないため、毎回入力してもらう）
- **承認待ちは2つに分けて表示**（`accessStateOf`）: `applied`=「📩 承認待ち（申請あり）」＝本人が申請済み＝**管理者が承認すべき状態**／`noreq`=「✋ 未申請」＝まだ本人が申請していない（管理者は待つだけ・承認しても可）。チップ・絞り込み（`adminAccess`）・件数表示すべてこの判定を共通利用。通知バッジ（`isApplicant`）は従来どおり `applied` のみを数える。利用者側のロック画面も「⏳ 承認をお待ちください」（申請済み）と「✋ 利用の申請をしてください」（未申請）で出し分ける
- 選択したアカウントの承認を一括解除＝一括操作バーの「⏳ 承認解除」（`bulkUnapprove`）。`access` を `pending` に戻し `req`／`expiredAt` を消す＝本人は**再申請が必要**（進捗は残る）。対象は「✅ 承認済み」だけで**停止中（blocked）は対象外**。全員に効かせるときは絞り込みを解除してから「すべて選択」→「⏳ 承認解除」
- 休眠アカウントの棚卸し＝「🧹 休眠アカウント／承認を一括解除」（30日以上アクセスがない承認済みを承認待ちに戻す。本人は次回ログインで再申請）
- メンテナンス中でも利用できるアカウントの指定（`maintOk`）＝ユーザー一覧の「🛠 メンテ許可」トグル／選択して一括付与・解除／絞り込みチップ／メンテ節に「🛠 メンテ中も利用可 N人」
- フィードバック/不具合報告も全 doc から集約表示（資格・種類で絞り込み／JSON・CSV書き出し＝Claudeに渡す用／各件「対応済み（削除）」で報告者 doc から `arrayRemove`）
- 管理者ID変更時は `firebase-config.js` の `SFQ_ADMIN_IDS` と Firestore ルールのメール両方を変える

---

## Firebase セキュリティ

- **Web の apiKey は公開前提**。GitHub のシークレットスキャン警告は false positive
- 本当の防御は Firestore ルール（本人 uid 一致のみ read/write）
- API キーは Google Cloud Console で **HTTP リファラー制限済み**：`https://cfn0eft.github.io/*` と `http://localhost/*` のみ許可
- **新ドメインを追加したら必ずこの許可リストにも追加**しないと 403 で壊れる
- ログイン不調時の切り分け順: ①リファラー制限 → ②Firestore ルール → ③Auth 承認済みドメイン

---

## 進捗データ構造 (localStorage / Firestore 共通)

```js
store = {
  bm: [],           // ブックマーク配列
  hist: {id:{c,w,last,lc,wr}}, // 解答履歴 (c=正答数,w=誤答数,last='c'|'w'=直近の正誤, lc=1:直近「自信なし」→まぐれ正解の復習判定, wr='unknown'|'careless'|'narrow'=誤答理由タグ#1)
  streak, vm, tbm,
  srs: {id:{ivl,ease,reps,due}},  // SM-2 簡易版
  daily: {'YYYY-MM-DD': 解答数},
  notes: {id: text},
  examDate, goal,
  exams: [],        // 模試履歴（最新50件）。各要素 {ts,pct,ok,n,pass,byd,secsUsed,custom}（n=問題数, custom=カスタム模試か。推移グラフはフル(n===examN)のみで描画）
  badges: {id: date},
  dc: {d:'YYYY-MM-DD', ids:[], done:0}, // デイリーチャレンジ（その日の10問を固定。done=1で完了）。日付が変わると再構成
  acquiredDate: '', // 資格取得日（''=未取得）。ホーム/マイページ/試験結果で「取得済み」を主張表示
  time: {tot, dom:{code:{sec,n}}, hour:{h:{c,w,sec}}}, // 学習時間 総/分野別/時間帯別 #18
  sum: {id: text},  // 自分の言葉で説明（Feynman）#6
  xp: 0,            // 経験値。レベルは levelInfo() で算出 #12
  missions: {wk:'YYYY-MM-DD', claimed:{id:1}}, // 週ミッション（日曜はじまり・claimedはXP付与済み）#16
  rdz: [{d:'YYYY-MM-DD', p:pct}] // 合格確度の日次スナップショット（推移グラフ）#17
}
```

新フィールドを足すときは `loadStore` 既定・`__setStore` 正規化・`resetAll` の3箇所すべてに追加すること。

クラウド同期しない**ローカル専用キー**（localStorage 直）: `<storageKey>_examstate`（試験の中断・再開）／`<storageKey>_recentexam`（模試の重複回避＝直近2回の出題ID）／`sfq_news_seen`・`sfq_onboarded`・`sfq_fontsize` など端末設定。

---

## デプロイ

**Claude が Bash ツールで `git add`→`commit`→`push` まで自分で実行する**（このリポジトリでは Bash から GitHub への push が通ることを確認済み）。コマンドを提示して終わりにしない。push 完了まで見届けて結果を報告する。

```bash
cd /c/Users/Nerod/ドキュメント/sf-exam
git add <変更ファイル>     # または git add -A
git commit -m "<日本語1行>"
git push origin main
```

- 認証は **cfn0eft** アカウント。過去に `mashi-18` の古い認証がキャッシュされて 403 になった事故あり。詰まったら `printf "protocol=https\nhost=github.com\n\n" | git credential reject` でリセット
- **編集したら頼まれなくても自分で commit/push まで実行する**（Bash ツールで完結。コマンド提示だけで止めない）

### キャッシュ無効化（重要）

- `quiz-engine.js` / `quiz.css` / `cloud-sync.js` / `changelog.js` / `figures.js` を更新したら **`node tools/bump-version.js` を1回実行する**（3点セット＝sw.js の CACHE／SHELL 配列の ?v=／両シェル＋ルート index.html の ?v= を一括繰り上げ。手作業更新は漏れ事故が起きたため廃止）。
- 理由: SW は stale-while-revalidate でキャッシュ優先のため、版数を上げないとブラウザが旧 JS/CSS を掴み続ける（実際にこの事故を確認済み）。`?v=` クエリで URL を変えることで確実に新版を取得させる。版数の混在は `tools/validate-data.js`（CI）が検知する。
- 学習データ `certifications/*/data/*.json` も v18 から `SHELL` でプリキャッシュ（初回訪問からオフライン学習可）。データ更新は stale-while-revalidate で2回目読込から自動反映される。初回配信から即時反映したいときだけ CACHE 版数を上げる。

### アップデートのお知らせ（ユーザー向け変更は必ず告知してからコミット）

**新機能の追加・既存機能の更新など「利用者が気づく変更」を入れたら、お知らせも必ず追記して同じコミットに含める**（リリース作業の一部。コミット前のチェックリストに入れる）。

1. `changelog.js` の `window.SFQ_CHANGELOG` の**先頭**に1件追記する。
   - 形式: `{id:'YYYY-MM-DD[末尾a/b…]', date:'YYYY-MM-DD', title:'短い見出し', items:['絵文字 …','…']}`
   - `id` は一意（同日に複数回出すなら末尾に `a`/`b`…）。`date` は実施日の絶対日付（相対表現は使わない）。
   - **同日に既存エントリがあれば新規追加せず、その先頭エントリの `items` に箇条書きを足す**（1日1リリースにまとめる。`title` は内容に合わせて更新可）。
2. `changelog.js` を更新したので**キャッシュ版数も繰り上げる**（`node tools/bump-version.js` を実行）。
3. 機能変更とお知らせを**1つのコミット**にまとめて push する。

- **対象**: ユーザー向けの新機能・UI/挙動の変更・体感できる改善や不具合修正。
- **対象外**: ドキュメントのみ・内部リファクタ・利用者に見えないデータ修正（無理に載せない）。
- 文言は**利用者目線**でやさしく（実装名でなく「何ができるか」）。先頭に絵文字、1項目1行。
- 仕組み: 先頭 `id` と `localStorage 'sfq_news_seen'` の不一致で、LPのバナーと各資格ホームのベルに自動で「NEW」が出る。データは LP・全資格で共有（`changelog.js` が唯一の出典）。

### ローカル開発時のログインバイパス

- `cloud-sync.js` に **localhost / 127.0.0.1 / file:// ではログイン・同期をスキップ**する分岐あり（Firebase のリファラー制限で localhost から認証できないため）。ローカルでは進捗は localStorage のみ。本番（github.io）は通常どおりログイン必須。
- モック（`mockups/*.html`）は Firebase 非依存なので元々ログイン不要。

---

## 運用ルール（編集時の常設方針）

### 公式ソース第一
- 問題追加・解説の事実主張は **Trailhead / help.salesforce.com を第一優先**
- 二次ソース（tysonblog, Focus on Force, Quizlet 等）は裏取り材料としてのみ使う
- 新規問題は必ず公式 URL を特定して `reference_url` に入れる
- 公式が見つからない論点は問題化を見送るか、不確実性を先に共有する

### 資格の基本情報（examCode / pass / examN / LP表示）
- **`examCode`（資格カード／ホームの副題に表示）には、実在する公式コードまたはコミュニティで定着した認定準備コース番号 `CRT-xxx` だけを入れる。擬似コード（`Sales-Con-201` のような独自の創作）は禁止**。該当コードが無い資格（アーキテクト系・Agentforce など）は **空文字 `""`** にする（副題は `.filter(Boolean)` で自動的に省く）。
  - 既知コード: 管理者 `ADM-201` / App Builder `CRT-403` / Developer I `CRT-450` / Sales Cloud `CRT-251` / Service Cloud `CRT-261` / Experience(Community) Cloud `CRT-271`。Agentforce・Sharing & Visibility は公式コードが無いため空。
- **`pass`（合格ライン）・`examN`・`examMin` は公式試験ガイド準拠**。公式PDFは bot 対策で取得不可(403)のため、focusonforce / Salesforce Ben など公式ガイド転載値で裏取りする。既知の合格ライン: Admin 65 / App Builder 63 / Developer 68 / Agentforce 73 / Sales Cloud 69 / Service Cloud 67 / Experience Cloud 62 / Sharing & Visibility 67（時間はコンサル/Specialist=105分・アーキテクト=120分、採点対象は全資格60問）。
- **LP（ルート `index.html`）の `CERTS[].meta` の問題数・用語数・合格%は、データ実数および shell の `pass` と一致させる**（資格を増問したら meta も更新）。

### Distractor（不正解選択肢）の品質
- 「ぱっと見正解と区別がつかない」レベルで作る
- NG: 「両者は機能的に同じ」「システムエラーになる」のような無意味な選択肢／「Apex 以外に方法はない」のような極端な断定／常識で否定できる馬鹿げた選択肢
- OK: 公式に実在する別概念をぶつける／過去にはそうだったが今は違う情報／隣接機能で正しいことを誤って書く／境界値の微妙なズレ
- 正解だけ突出して長く・詳しくしない。全選択肢を同程度の文長にそろえる
- 多答問題は 4 段階の弁別を作る（明らかな正解・微妙な正解・ありそうな誤り・明らかな誤り）

### Commit メッセージ
- **必ず日本語で書く**、**1行に収める**（80〜120字以内）
- 複数行・ヒアドキュメント・`\n` を含む `-m` は絶対に提案しない（Git Bash の `>` プロンプト事故）
- 長文が必要なら `git commit -F message.txt` を案内する
- 良い例: `sf-admin: +120問追加 268→388問（シナリオ76%、公式比±0.6pt以内）`

### 結果報告の体裁
- 作業途中の進捗説明と**最終報告を視覚的に分離**する。最終報告は必ず `---`（区切り線）＋見出し（例 `## ✅ 完了報告`）から始め、どこからが報告か一目で分かるようにする
- 報告内は「やったこと / 検証 / 残り」を見出しで定型化する

---

## 環境上の落とし穴

### bash マウントの stale 問題（自動接続時）
- 以前は sf-exam の bash マウントがホスト編集を反映しなかった
- **`request_cowork_directory` で接続し直すと双方向で正常になる**ことを 2026-05-26 に確認
- それでも **バイナリ（PNG等）は Write ツールで書けない** → outputs 経由で `present_files`、ユーザーが手動配置
- 削除は既定で不可（`Operation not permitted`）。`allow_cowork_file_delete` で許可してから `rm`

### 検証時の注意
- ホストファイルの真の内容は Read/Grep/Glob を信頼する
- bash で構文・機能検証するときはロジックを heredoc で再現して `node` で回す

---

## 残タスク（2026-06-11 時点）

- **Developer の問題拡充**：499問（生成217＋タイソン215＋jpnshiken67）公開済み。タイソン215問の reference_url は developer.salesforce.com の安定した公式ガイド11種に集約しているため、高頻度論点は今後より具体的な公式URLへ精緻化の余地あり。vocab/navmap のさらなる拡充も可。
- **出典横断の重複チェック**：`tools/validate-data.js` の `checkCrossSourceDuplicates` が、Salesforce用語の訳ゆれを正規化したうえで①問題文＋選択肢の3-gram類似度（sim≥0.5）と②正解集合の一致（正解sim≥0.7かつ本文sim≥0.32）の2系統で出典横断の重複疑いを警告する（CIは止めない＝判断は人手）。ただし**文字ベースなので「同一英語原文の和訳違い」は取りこぼす**（実際に admin で14件・developer で複数を当初の素の3-gramが見逃した）。新ダンプ取込時は警告を入口にしつつ、**最終確認は意味ベースで人手**で行うこと。
- （バックログ）図解の拡充：高頻出論点に図を追加できる。`figures.js` に1図足し、`questions.json` の `expFig`/`fig`（または `vocab.json` の `fig`）に図名を入れ、`validate-data.js` で参照確認するだけ（現在23点＋エイリアス5）。
- （バックログ）ケーススタディ（#25）のさらなる拡充：`questions.json` の既存問題に `case`+`scenario` を足すだけ（現在 sf-admin 6件・app-builder 5件）。

### 完了済み（2026-06-11）開発基盤＋学習機能＋コンテンツ拡充（キャッシュ v35・アセット `?v=33`）

- **開発ツール・CI 新設**: `tools/validate-data.js`（データ・版数・図参照の一括検証）／`tools/test-engine.js`（エンジン純粋ロジック14テスト、vm＋DOMスタブ方式）／`tools/bump-version.js`（キャッシュ3点セット一括繰り上げ）／`tools/feedback-to-tasks.js`（フィードバックJSON→対応タスクMD）。`.github/workflows/ci.yml` で push/PR 毎に自動実行。
- **逆算ペース**: `paceReco(daysLeft)`＝未着手＋要復習の残数÷受験日までの日数。`renderPlan` が `#plan-cd` 直後に `#plan-reco` を動的生成して表示、`adoptPace(n)` でワンタップで `store.goal` に採用。CSS `.plan-reco`/`.plan-reco-btn`。
- **模試の重複回避**: ローカル専用キー `<storageKey>_recentexam` に直近2回の出題IDを保持（`recentExamIds`/`pushRecentExam`・`finishExam` で記録）。`freshFirst()` が新鮮な問題を前に並べ、`pickWeightedExam`・カスタム模試の抽出で直近出題を後回しに。
- **ケーススタディ +7件**: sf-admin に ck-obj/uc-sales/ck-auto/dh-data（計6件）、app-builder に ck-data/uc-ui/uc-deploy（計5件）。既存問題への `case`+`scenario` 付与のみ。
- **図解 +4点**: sf-admin/import-tools・sf-admin/case-automation・app-builder/order-of-execution・app-builder/external-objects（＋app-builder/import-tools エイリアス）。問題16問・教科書用語8語に付与（公式事実と整合確認済み）。
- **CLAUDE.md 棚卸し**: 過去リリースの実装メモを `docs/HISTORY.md` へ退避。エンジン行数・データ構成（cram/compare）・キャッシュ手順の記述を現状に同期。

### 完了済み（2026-06-11 第2弾）問題品質監査＋PWA＋Developer骨組み（キャッシュ v36・アセット `?v=34`）

- **選択肢の文長バランス監査**: 「正解だけ突出して長い」73問（sf-admin 55・app-builder 18）の不正解選択肢を、実在する隣接概念ベースの誤答にリライトして文長を揃えた（正解文は不変・解説の該当行も連動更新）。再発防止として `validate-data.js` に文長バランス警告（正解が不正解の1.8倍超かつ40字超）を追加。app-builder #1/#156 の問題文完全一致は #1 をシナリオ形式に差別化して解消。
- **reference_url 死活チェック**: `tools/check-links.js`＋`.github/workflows/check-links.yml`（週1cron＋手動）。404/410 のみ失敗、help.salesforce.com の 403（ボット対策）は警告扱い。
- **PWAショートカット**: manifest に `shortcuts` 4件（Admin/AB × デイリー/模試）。エンジンに `handleLaunchShortcut()`（`?go=daily|exam` を解釈し、`history.replaceState` で再発火防止）。
- **Developer 骨組み**: `certifications/developer/`（シェル＋公式4分野 domains.json＋空データ5本、pass 68%・storageKey `sfqdev_v1`）。問題0問のため LP 未掲載。
- **エンジンテスト拡充**: 14→17件（finishExam 採点・週ミッション達成/XP・ショートカット起動）。DOMスタブを要素返却型に強化。

### 完了済み（2026-06-11 第3弾）検索キーワード補完＋図解2点＋解説増補（キャッシュ v37・アセット `?v=35`）

- **キーワード絞り込みの欠落解消**: sf-admin の生成問題78問（id192-269）に `keywords` を付与（既存語彙を優先再利用）。全833問がキーワード絞り込みに登場するようになった。
- **図解 +2点**: sf-admin/approval-process（承認プロセスのしくみ。エントリ条件→申請ロック→ステップ→4タイミングの自動アクション）／app-builder/governor-limits（主なガバナ制限とループ外一括処理の定石）。相互エイリアス3本（ab/approval-process・sf/governor-limits・sf/order-of-execution）。問題23問・用語3語に付与（1問ずつ整合確認済み）。
- **解説増補**: app-builder #171（サンドボックス選択）に各選択肢の不正解理由（容量・本番データ有無・リフレッシュ間隔）を追記し `sandbox-types` 図を付与。

過去のリリース履歴（2026-05-31〜2026-06-08）の実装メモは **`docs/HISTORY.md`** を参照。

---

## 関連ドキュメント

- `Firebaseセットアップ手順.md` — 初期設定（プロジェクト作成・キー貼り付け・Firestore ルール）
- `SECURITY.md` — Firebase apiKey 公開の方針
