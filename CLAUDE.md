# sf-exam (SFadmin)

Salesforce 認定資格の学習用クイズサイト。GitHub Pages で配信される静的サイト。

- 公開URL: https://cfn0eft.github.io/sf-exam/
- リポジトリ: https://github.com/cfn0eft/sf-exam (main ブランチ)
- ローカル: `C:\Users\Nerod\ドキュメント\sf-exam`
- 対応資格: Administrator (合格済) / Platform App Builder (現在のフォーカス) / Developer (未着手)

---

## アーキテクチャ（2026-05-25 完全共通エンジン化）

**全資格で共通のロジックを1本に統一済み。資格を増やすときもエンジンには触らない。**

```
sf-exam/
├── index.html            # LP (gateway)。資格カードは末尾の CERTS 配列から自動生成。お知らせバナー＋モーダルも持つ
├── quiz-engine.js        # 全資格共通の単一エンジン（約1230行）
├── quiz.css              # 全資格共通
├── changelog.js          # アップデート履歴データ window.SFQ_CHANGELOG（LP・全資格で共有・唯一の出典）
├── figures.js            # 図解データ window.SFQ_FIGURES（全資格共有・唯一の出典。色は持たずクラス＋幾何のみのインラインSVG）
├── firebase-config.js    # ユーザー編集する唯一の Firebase 設定
├── cloud-sync.js         # ログイン/同期ロジック（編集不要）
├── manifest.webmanifest  # PWA
├── sw.js                 # Service Worker（更新時は CACHE 文字列を上げる。現在 v34／アセット ?v=32）
└── certifications/
    └── {slug}/
        ├── index.html    # 薄いシェル（共通DOM雛形＋CERT_CONFIG＋engine読込）
        └── data/
            ├── questions.json   # 各問 domain・multi 内蔵に正規化。任意で fig/expFig（figures.js図名）／diff（難易度1=易2=標準3=難）／case+scenario（ケーススタディ束ね）。解説は解答後に全文をまとめて表示
            ├── domains.json     # {domains:[{code,name,weight,emoji}], map?}
            ├── vocab.json       # 章配列 {chapter,terms:[{title,jaName,enName,definition,examPoints[],questions[],fullContent}]}
            └── navmap.json      # [{title,content}] 設定マップ
```

**ロジックを直すのは `quiz-engine.js` の1ファイルだけ。各資格の中身は `data/*.json` を編集する。**

シェルのスクリプト読込順: `CERT_CONFIG` → `quiz-engine.js` → `cloud-sync.js`（同期は engine 定義の `__getStore/__setStore/__refreshUI` に依存）。

エンジンは IIFE で包まずグローバル関数のまま（HTML の inline onclick 依存）。

### 資格別パラメータ

| 資格 | slug | examN | examMin | pass | storageKey | 分野 |
|---|---|---|---|---|---|---|
| Administrator | sf-admin | 60 | 105 | 65 | sfq_v4 | 8 (cfg/obj/auto/data/sales/service/prod/agf) |
| App Builder | app-builder | 60 | 105 | 63 | sfqab_v1 | 5 (fund/data/logic/ui/deploy) |

Admin 8分野の公式ブループリント (2025/12/15改訂): Configuration15/ObjectManager&LightningAppBuilder15/Automation15/Data&Analytics17/Sales&Marketing10/Service&Support10/Productivity&Collaboration10/Agentforce8。

App Builder 5分野: 基礎23/データ22/ロジック&自動化28/UI17/リリース10。

### 新資格を追加する手順（これだけ）

1. `certifications/{slug}/data/` に4つのJSONを置く
2. 既存シェル `index.html` を複製し `CERT_CONFIG` を差し替え
3. ルート LP の `CERTS` 配列に1件追加

エンジン・CSS・同期は触らない。

---

## クラウド同期 (Firebase Auth + Firestore)

- 簡易ID＋パスワード方式（内部で `ID@sfquiz.local` に変換）
- Firestore は `progress/{uid}` に保存。doc 構造は `{ stores: { '<slug>': store, ... }, name, email, updated, feedback:[] }`（資格別名前空間。複数資格が同じ uid を共有しても上書きされない）
- `feedback` は不具合報告/ご意見の配列（**doc 直下・各 store とは別**）。本人 doc への `arrayUnion` で追加（既存ルールのまま＝本人は自 doc 書込可、ルール変更不要）。未ログイン時は localStorage `sfq_feedback_pending` に退避し、次回ログインで `flushPendingFeedback()` が一括送信
- 保存は `doc.update(new FieldPath('stores',CERT_KEY), st, ...)` で当該資格のサブストアを丸ごと置換（deep-merge 回避）
- 保存は 0.8秒デバウンス。`save()` が `window.__cloudSave()` をフック

### ページ役割 (SFQ_PAGE_ROLE)

- `gateway` = ルート LP：ログイン必須のゲートウェイ。進捗 doc は読み書きしない。`window.SFQ_PAGE_ROLE='gateway'`
- `client` = 各クイズページ：進捗を同期。ログイン強制しない。未ログイン時はホームへ誘導。`window.SFQ_HOME_URL='../../index.html'`
- 明示指定が無ければ `__setStore` の有無で自動判定

### 管理者ビュー

- 管理者ID = `admin` (`SFQ_ADMIN_IDS=["admin"]`)
- 全アカウント一覧・リセット・削除・CSV書き出し可
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

- `quiz-engine.js` / `quiz.css` / `cloud-sync.js` / `changelog.js` を更新したら **3点セットでバージョンを上げる**:
  1. `sw.js` の `CACHE` 文字列（例 `sf-exam-v5` → `v6`）
  2. アセット参照 `?v=5` → `?v=6`：両シェル `certifications/*/index.html`（`changelog.js`・`cloud-sync.js` はルート `index.html` でも参照するので一緒に繰り上げる）
  3. `sw.js` の `SHELL` 配列内の `?v=5` → `?v=6`（`changelog.js?v=` も含む）
- 理由: SW は stale-while-revalidate でキャッシュ優先のため、版数を上げないとブラウザが旧 JS/CSS を掴み続ける（実際にこの事故を確認済み）。`?v=` クエリで URL を変えることで確実に新版を取得させる。
- 学習データ `certifications/*/data/*.json` も v18 から `SHELL` でプリキャッシュ（初回訪問からオフライン学習可）。データ更新は stale-while-revalidate で2回目読込から自動反映される。初回配信から即時反映したいときだけ CACHE 版数を上げる。

### アップデートのお知らせ（ユーザー向け変更は必ず告知してからコミット）

**新機能の追加・既存機能の更新など「利用者が気づく変更」を入れたら、お知らせも必ず追記して同じコミットに含める**（リリース作業の一部。コミット前のチェックリストに入れる）。

1. `changelog.js` の `window.SFQ_CHANGELOG` の**先頭**に1件追記する。
   - 形式: `{id:'YYYY-MM-DD[末尾a/b…]', date:'YYYY-MM-DD', title:'短い見出し', items:['絵文字 …','…']}`
   - `id` は一意（同日に複数回出すなら末尾に `a`/`b`…）。`date` は実施日の絶対日付（相対表現は使わない）。
   - **同日に既存エントリがあれば新規追加せず、その先頭エントリの `items` に箇条書きを足す**（1日1リリースにまとめる。`title` は内容に合わせて更新可）。
2. `changelog.js` を更新したので**キャッシュ版数も繰り上げる**（上記「キャッシュ無効化」3点セット＋`SHELL` の `changelog.js?v=`）。
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

## 残タスク（2026-06-02 時点）

- アクティブな残タスクなし。
- （バックログ）図解の拡充：高頻出論点に図を追加できる。`figures.js` に1図足し、`questions.json` の `expFig`/`fig` に図名を入れるだけ。
- （バックログ）3資格目（Developer 等）の立ち上げ ＝「4JSON＋シェル複製＋LP CERTS に1行追加」だけ。着手は別途相談。
- （バックログ）ケーススタディ（#25）の拡充：`questions.json` の既存問題に `case`+`scenario` を足すだけ（現状は各資格2件の種）。

### 完了済み（2026-06-08b）アプリ内フィードバック（不具合報告）→クラウド蓄積→管理者ビュー（キャッシュ v34・アセット `?v=32`）

- **GitHub Issue 起票を廃止し、アプリ内フォームに置換**。`reportQuestion(id)` は `openFeedback({qid})` を開くだけに変更。一般のご意見はマイページ「サポート」・使い方ガイド（`GUIDE` の `act:'feedback'`）からも起動。
- **エンジン**（`quiz-engine.js`）: `openFeedback/renderFeedback/submitFeedback`＋`FB_CATS`（種類7択：不具合/正解誤り/解説誤り/選択肢/日本語/要望/その他）。報告オブジェクト `{fid,ts,cert,qid,cat,msg,qtext,ref,ua,ver,url}`。モーダルは `.sc-box` 流用＋`.fb-*` CSS（テーマ追従）。Esc（`handleKey` に `fb-modal`）/背景クリックで閉じる。
- **保存経路**: ログイン中は `window.__cloudSubmitFeedback(report)`（cloud-sync）が本人 `progress/{uid}` の **doc 直下 `feedback[]` へ `arrayUnion`**（Firestore ルール変更不要）。未ログイン/ローカルは `localStorage 'sfq_feedback_pending'` に退避→`flushPendingFeedback()` が次回ログインで一括送信。
- **管理者ビュー**（`cloud-sync.js`）: `loadAdmin` が全 doc の `feedback` を集約（`adminFeedback`）。上部に一覧セクション（`feedbackSectionHTML`・資格/種類で絞り込み・`⬇JSON`/`⬇CSV` 書き出し・各件「対応済み（削除）」＝報告者 doc から `arrayRemove`）。管理者の全 doc 書込は既存 reset/delete と同じ権限。
- 両資格・ライト/ダークでローカル実機確認。`node --check`（cloud-sync/engine/changelog）通過。

### 完了済み（2026-06-08）選択肢別の誤り解説を廃止（キャッシュ v33・アセット `?v=31`）

- 第7弾の「選択肢ごとの誤り解説」を**機能ごと撤去**。`quiz-engine.js` から `perChoiceWhy` 関数を削除し、`checkAnswer` は常に解説全文を解説ボックスにまとめて表示（第7弾以前の挙動に復帰）。
- 連動して削除/修正: `quiz.css` の `.choice-why`/`.cw-ok`/`.cw-ng`/`.exp-note-sm`/`.choice.done{flex-wrap}`、GUIDE の専用項目と学習モード説明、オンボーディング「学ぶ」文言、README の機能表、`changelog.js` に廃止告知を1件追加。
- ローカル実機で □形式問題を解答し、選択肢下解説ゼロ・全文インライン表示・コンソールエラーなしを確認。

### 完了済み（2026-06-02・第7弾）学習を深める18機能＋使い方ガイド＋オンボーディング刷新（キャッシュ v32・アセット `?v=30`）

- **使い方ガイド（機能カタログ・チュートリアル）**: 全機能を分類別に説明＋`act` で「開く」即試行できる常設オーバーレイ（`GUIDE` 配列／`openGuide`/`guideAct`、`.gd-*` CSS）。導線は **トップバー❓（`#btn-guide`）・マイページの大ボタン・初回オンボーディング末尾の案内** の3点。機能追加時は `GUIDE` 配列に1行足すだけ。
- **オンボーディング刷新**: `OB_STEPS` を3→5ステップ（ようこそ→学ぶ→測る→復習→続ける＋ガイド誘導）に刷新。`OB_VERSION`（現 '2'）を導入し、内容更新時に上げると `sfq_onboarded` 不一致で**全ユーザーに一度だけ再表示**。最終ステップに使い方ガイドボタン、`replayOnboarding()` をガイド先頭の「🎬 かんたんツアー」から再生可能。


5フェーズ＝各1コミット。ロジックは `quiz-engine.js` 1本＋両シェル＋`quiz.css`＋`changelog.js`＋データ。

- **Phase1 つまずき分析**: 誤答理由タグ（`hist.wr`=unknown/careless/narrow・解説欄で選択）／学習時間（`store.time`＝総/分野別{sec,n}/時間帯別{c,w,sec}、`recStudyTime` を `checkAnswer` で計測）／自信キャリブレーション（lc×正誤）／弱点の根本原因レポート。統計に `#analysis`（`renderAnalysis`）新設。
- **Phase2 学習・復習体験**: 段階的ヒント（`showHint`・分野→誤答を薄く、Hキー）／類題リンク（`relatedQuestions`）／Feynman要約（`store.sum`）／間違いノート（`openNotebook`）／重点ループ（`startLeech`・`isLeech`=w≥2、`beginStudyWith{loop}` で2連続正解まで再投入）。
- **Phase3 難易度**: `qDiff`（データ`diff`優先→未設定は正答率推定）／`diffPillHTML`（学習バッジ）／難易度フィルタ（`fDiffSet`・チップ）／分野×難易度ヒート（`diffHeatHTML`）。
- **Phase4 ゲーミフィケーション**: XP・レベル（`store.xp`・`levelInfo`・`recH`で付与）／獲得演出（`celebrate` 紙吹雪）／デイリーゴール祝い（`maybeGoalCheer`）／週ミッション（`weeklyMissions`/`checkMissions`・`store.missions`）／合格確度トレンド（`snapReadiness`・`store.rdz`・`readinessTrendHTML`）。ホームに `#gamecard`（`renderGame`）。
- **Phase5 コンテンツ**: 選択肢別の誤り解説＝既存解説(□形式)を実行時解析（`perChoiceWhy`）し各選択肢下に表示（**※2026-06-08 に廃止。`perChoiceWhy` 削除・解説は常に全文をまとめて表示に戻した**）／全833問に`diff`を構造ヒューリスティックで付与（易28/標準47/難25%）／ケーススタディ（`case`+`scenario`・`openCases`/`beginCase`、既存の同一企業×分野問題を束ねた種を各資格2件）。
- store 追加（time/sum/xp/missions/rdz、hist.wr）は `loadStore`/`__setStore`/`resetAll` の3箇所へ反映済み。両資格でローカル実機検証・コンソールエラーなし。

### 完了済み（2026-06-02・第6弾）図解・図つき解説／教科書にも図（キャッシュ v25・アセット `?v=23`）

- **図解アセット `figures.js`（`window.SFQ_FIGURES`）を新設＝全資格共通の唯一の出典**。キーは `"<slug>/<name>"`、値は**色を持たない**インラインSVG文字列（クラス＋幾何情報のみ）。LP は読み込まない（資格シェルのみ、`changelog.js` と同様にエンジンより先に読む）。資格をまたいで使い回す図は末尾でエイリアス（例 `window.SFQ_FIGURES['app-builder/sandbox-types']=window.SFQ_FIGURES['sf-admin/sandbox-types']`）。
- **テーマはアプリの `[data-theme=dark]` に追従**（OS の `prefers-color-scheme` ではない＝当アプリのダークは手動トグルのため）。色は `quiz.css` の `.qfig svg` パレット（ライト＋`[data-theme=dark]`）で一括定義。**インライン展開なので CSS 変数が継承され**正しく切り替わる。`<img>`/`<object>` だと追従しないため必ずインライン。
- **エンジン配線**: `figHTML(name)`/`setFig(elId,name)`/`openFig(figEl,ev)`/`closeFig()`（`escH` 直後）。描画先＝学習解説（`checkAnswer`）・設問（`renderSQ`#s-qfig）・試験設問（`renderEQ`#e-qfig）・試験見直し（`examReviewHTML`）・高速めくり（`qkReveal`）・**教科書の用語詳細（`showTD`#td-fig／`#td-fig-blk` を出し分け）**。図はタップで拡大（ライトボックス `#fig-lb`、`handleKey` の Esc で閉じる）。
- **データ**: 任意キーで図名（`figures.js` の `<name>`）を指定。①`questions.json` の各問に `expFig`（解説図・基本こちら／答えを誘導しない）か `fig`（設問図）。②`vocab.json` の用語に `fig`（教科書の用語詳細に表示）。今回 **問題: sf-admin 19・app-builder 21／教科書: sf-admin 11・app-builder 16** に付与（公式事実と図の整合を1件ずつ確認。入力規則/View All 等の不一致は付与しない）。
- **収録図 17点**（色なしクラス制御・整形式検証済・両資格＋ライト/ダークで実機確認）:
  - sf-admin(9): record-access / security-layers / relationships / lead-conversion / role-hierarchy / profile-permset / automation-tools / report-formats / sandbox-types
  - app-builder(8): relationships / record-triggered-flow / app-builder-regions / rollup-summary / deployment / flow-types / declarative-vs-code / page-assignment
- **図を増やす手順**: ①`figures.js` に `"<slug>/<name>": '<svg ...>…</svg>'`（既存の標準クラス `fig/box/card/ink/sub/ttl/b-*/t-*/ln*/ar` だけを使う。新色が要るときだけ `quiz.css` の `.qfig svg` パレットに変数追加）②`questions.json` の `expFig`/`fig`、または `vocab.json` 用語の `fig` に図名を追加 ③キャッシュ版数繰り上げ。
- 旧 `certifications/*/img/*.svg`（第6弾前半でファイル生成した10点）は `figures.js` に統合し**削除済み**（テーマが media-query 依存で当アプリのトグルに追従しなかったため）。
- 確認用 `_diagram-gallery.html`（`figures.js`＋`quiz.css` で全図をライト/ダーク表示）はローカル専用・**未コミット**。

### 完了済み（2026-06-01・第5弾）カスタム模試 / 網羅率 / アプリ更新（キャッシュ v23・アセット `?v=21`）

- **カスタム模試**: `startExam(opts)` を拡張（`{n, weak, domains[], timed}`）。ランタイムの問題数は定数 `EXAM_N` でなく `eN`、時間は `eTimed`/`eBudget`（timed=残り減算・untimed=経過加算）。ホームに `🎛️ カスタム模試` ボタン→モーダル（`openCustomExam`/`renderCustomExam`/`startCustomExam`、`ce*` 状態）。中断・再開も可変長対応（保存に `n/timed/budget`）。標準「試験」ボタンは従来どおり60問・時間制限あり。
- **学習カバレッジ**: 統計ページ上部に `renderCoverage`（全問の解答率＋全分野の着手率、未着手をまとめて学習 `startUnseen`）。`#coverage` を両シェルの統計に設置。
- **アプリを更新**: マイページに `updateApp`（caches 全削除＋SW `registration.update()`→再読み込み）。版数を上げた直後でも待たず最新化。
- 模試推移グラフはフル（`n===EXAM_N`）のみで描画し、履歴一覧はカスタムに `N問` タグを表示。`store.exams` に `n`/`custom` を記録。

### 完了済み（2026-06-01・第4弾）お知らせをLPと全ホームへ展開（キャッシュ v22・アセット `?v=20`）

- **履歴データを `changelog.js`（`window.SFQ_CHANGELOG`）に集約**＝唯一の出典。LP・両資格シェルが `quiz-engine.js` より先に読み込む。
- **ルートLP**: ヒーロー直下に目立つお知らせバナー `#lp-news`＋モーダル（LP内に自己完結の `lp*` 関数群／LP配色に合わせたCSS）。未読時「NEW」、開封で既読化。
- **各資格ホーム**: ホーム本体のカードを廃止し、トップバーに**ベル `#btn-news`＋未読ドット `#news-dot`**を新設。押すと既存モーダルがポップアップ。`renderNews` はベルのドット表示のみ担当。
- 既読キー `localStorage 'sfq_news_seen'` は同一オリジンでLP/資格ページ共有（どちらかで開けば双方既読）。
- **新リリースの告知手順（最新）**: `changelog.js` の `window.SFQ_CHANGELOG` 先頭に `{id,date,title,items[]}` を1件足すだけ（id は一意に）。LP・全ホームに自動でNEWが出る。

### 完了済み（2026-06-01・第3弾）ホームにアップデートのお知らせ（キャッシュ v21・アセット `?v=19`）

- **更新履歴のお知らせ**: エンジンの `CHANGELOG`（全資格共通・過去4リリース掲載）をホームのカード `#news-card`＋一覧モーダル（`buildNewsModal`/`openNews`/`closeNews`）で表示。未読時のみ「NEW」を出し、開封で既読化。
- 未読判定は `localStorage 'sfq_news_seen'` と `CHANGELOG[0].id` の不一致で行う（同期対象外・端末ローカル）。`renderNews` を `homeStats` から呼ぶ。`Esc`／背景クリックで閉じる（`handleKey` が news/ショートカット両モーダルに対応）。
- **新リリースの告知手順**（※第4弾で更新）: 当初は `quiz-engine.js` 内 `CHANGELOG`＋ホームカード `#news-card`。現在は **`changelog.js` に集約＋トップバーのベル**方式（第4弾参照）。

### 完了済み（2026-06-01・第2弾）便利機能6点追加（キャッシュ v20・アセット `?v=18`）

- **試験の設問別ペース計測**: 1秒タイマーで現在問の `eQTime[i]` を加算。結果に時間管理コーチ `renderPaceCard`（使用時間／1問平均／目安ペース＝`EXAM_MIN*60/EXAM_N`、超過した上位3問へジャンプ）。結果リスト各行にも所要時間バッジ。`finishExam` が `secsUsed` を履歴へ記録。
- **試験の中断・再開**: クラウド非同期のローカル専用キー `<storageKey>_examstate` に保存（`saveExamState` を `renderEQ`/タイマー5秒毎/`goBack` で）。ホームに再開バナー `#resume-banner`（`renderResumeBanner`/`resumeExam`/`discardExam`）。`startExam`/`finishExam` で `clearExamState`。
- **模試スコアの推移グラフ**: マイページ「模試の記録」に `examTrendHTML`（SVG 折れ線＋合格ライン＋直近20回、履歴一覧8件）。`store.exams` を利用。
- **文字サイズ調整**: マイページに 小/標準/大。`applyFontSize` が `body[data-fs]` を設定＋`localStorage 'sfq_fontsize'`。本文テキスト（問題・選択肢・解説・用語・高速めくり）のみ拡縮（固定バーに影響しない方式）。
- **オフライン表示／PWA追加**: `renderOnlineState`＋`online/offline` で `#offline-bar`。`beforeinstallprompt` を捕捉し `window.__deferredInstall`、マイページに「アプリを追加」行（`installPWA`、未対応時は非表示）。
- **高速めくり総ざらい**: 新ページ `#pg-quick`（`startQuick`/`renderQK`/`qkReveal`/`qkNav`/`setQkMode`）。問題→タップで答え＋要点表示→送り。対象=すべて/要復習/ブックマーク/弱点。ホーム `.quick-entry` から起動。要点は解説先頭行から記号・正解文の重複を除去。

### 完了済み（2026-06-01）便利機能5点追加（キャッシュ v19・アセット `?v=17`）

- **問題フリーワード検索**（ホーム）: `applyFilters` に `fText` を統合（問題文・選択肢・解説・キーワード・問題IDを横断）。検索バー `#f-text`＋`onQSearch`/`clearQSearch`。ヒット数付き「学習 N問」ボタン（0件は無効）。既存の出題フィルタと AND 結合。
- **デイリーチャレンジ**（ホーム「今日やる」先頭 `.dc-row`）: その日の10問を `store.dc{d,ids,done}` に固定（SRS期日→要復習→弱点→未着手→補填の順で構成）。`buildDailySet`/`startDaily`/`renderDaily`。完走で `dcActive`→`studyDone` が `done=1` をマーク、ホームに「✓ 完了」表示。日付が変わると再構成。
- **キーボードショートカット一覧**: `?` キー（`handleKey`）またはマイページから `toggleShortcutHelp` で `.sc-help` モーダル表示。`Esc`／背景クリックで閉じる。
- **進捗JSONバックアップ**（マイページ）: `exportProgress`（`sfquiz-<slug>-YYYY-MM-DD.json` を DL）／`importProgress`（`__setStore`＋`save` で復元・クラウドにも反映、不正データは拒否）。ローカル専用ユーザーの端末移行・消失対策。
- **問題報告ボタン**: 学習の解説欄に `.report-link`。`reportQuestion` が GitHub Issue をプリフィル起票（`REPO_URL`=`https://github.com/cfn0eft/sf-exam`、`CERT_CONFIG.repoUrl` で上書き可）。
- store に `dc` 追加に伴い `loadStore`/`__setStore`/`resetAll` の3箇所へ既定・正規化を反映済み。両資格（sf-admin/app-builder）で動作・コンソールエラーなしを localhost で検証。

### 完了済み（2026-05-31）UI/機能の大型アップデート（キャッシュ v16）

- **試験モード強化**: 問題ナビゲータ（`renderNavPalette`/`eJump`）・フラグ（`eFlag`/`toggleEFlag`）・採点前の未回答警告（`confirmFinishExam`）・スコアリング表示（`renderScoreRing`）・弱点コールアウト（`renderWeakCallout`）。
- **学習モード強化**: 選択肢を番号付き（`.cmark`）＋ `role=button`/`aria-pressed`/Spaceキー選択・色状態・`aria-live`。下部スティッキー操作バー（study-actbar）。誤答だけ復習（`redoWrong`/`sLastWrong`）。
- **ホーム再設計**: hero＋primary2＋todo＋stat3＋設定アコーディオン。ストリークバナー（`#hh-streak`）・オンボーディング（`maybeOnboard`/OB_STEPS/localStorage `sfq_onboarded`）・合格可能性サマリー（`renderStatsSummary`）。
- **マイページ（👤）**: ヘッダーのダークトグル隣に `#btn-mypage`。`renderMypage`/学習計画（`saveMyPlan`/`clearMyPlan`）/ダーク切替（`setDarkMode`）。
- **資格取得済み機能**: `store.acquiredDate` 新設（3資格別 localStorage＋Firestore同期）。`acquireCert`/`unacquireCert`。主張①ホームhero金バッジ＋リボン（`renderHomeAcq`/`#hh-acq`/`#hh-ribbon`/`.home-hero.acq`）、②試験合格時ボタン（`renderExamAcq`/`#e-acq`）、③トップLPカードの金バッジ（`.acq-badge`/`.card.acq`、同一オリジン localStorage で判定）。
- **管理者ビュー拡充**（cloud-sync.js）: 全体ダッシュボード/KPI（`adminDashboardHTML`）・分野別集計バー・問題別正答率分析（折りたたみ `<details class="sfqc-itemwrap">`）・フィルタ/並べ替え強化（資格/活動/合格、'rate'/'days' ソート、休眠バッジ）。
- **ヘッダーのアカウントバッジ重なり修正**: コンパクトpill＋ドロップダウン（`#sfqc-badge-toggle`/`#sfqc-menu`、right:56px でダークボタンを回避、client ロールでは非表示）。
- **過去の精査済み**: App Builder 用語集（5章83語）/設定マップ（10件）を公式照合・事実誤りなし・公式URL付与。`_verify` 13問を現行仕様へ補正し全除去（WFR/PB→レコードトリガーフロー/Apexトリガー、Twitter依存 id152→フォームファクタ表示制御）。445問・整合性維持。

---

## 関連ドキュメント

- `Firebaseセットアップ手順.md` — 初期設定（プロジェクト作成・キー貼り付け・Firestore ルール）
- `SECURITY.md` — Firebase apiKey 公開の方針
