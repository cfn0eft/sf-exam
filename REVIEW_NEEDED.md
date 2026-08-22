# REVIEW_NEEDED — 人間レビュー待ち

> 自動では触れない論点や、検証レッドで巻き戻した項目をここに退避する。だいきのレビュー後に対応する。
> 各件は次を1ブロックで書く: **対象（ファイル/question id 等）・現状・疑問点・出典案（または巻き戻した理由）**。

## 試験の正誤に関わる疑い（データは触らずここに記録）

- ✅ 解決済み（2026-07-30）: certifications/experience-cloud/data/questions.json #85 と #116（重複＋正解矛盾）
  経緯: ほぼ同一の設問（Experience Cloud の Google アナリティクスで管理者がレポートできる項目・同一の5選択肢）で正解集合が食い違っていた。
  裏取り: Salesforce 公式（「Track Your Salesforce Sites with Google Analytics」/「Track User Engagement with Google Analytics 4」）は、追跡対象として「Salesforce オブジェクト別のページビュー」「検索アクティビティ」「ログイン（ユーザー ID/種別）」を明記。
    → #85 の正解が公式どおり。#116 は正しい「オブジェクト別ページビュー」を落として「サポートへのお問い合わせページのアクティビティ」（公式に無い）を正解にしており、解説も「オブジェクト別ページビューは追跡不可」と公式に反する記述だった。
  対応: 重複かつ誤答の #116 を削除し、公式に正しい #85 を残した（experience-cloud 132→131問）。LP の CERTS meta も 131問へ更新。

## 公式確認待ち（二次ソースのみで裏が取れていない）

- **改称した2資格の試験コード（`CRT-251` / `CRT-261`）が今も有効か**（2026-08-22 時点で未確認）
  経緯: 公式の「Salesforce Certification Name Changes FAQ」で、Sales Cloud Consultant →「Salesforce Certified **Agentforce Sales** Consultant」、Service Cloud Consultant →「Salesforce Certified **Agentforce Service** Consultant」への改称（2026-07-24 施行）を確認し、資格名は反映済み。
  未確認: `CRT-xxx` は認定準備コースの番号で、改称にあわせて振り直された可能性がある。検索結果には `trailheadacademy.salesforce.com/certificate/exam-service-consultant---Service-Con-201` という別体系のスラッグも見えている。
  対応: 公式で新旧どちらのコードが有効か確認する。**別コードに変わっていた／該当コースが無くなっていた場合は、CLAUDE.md の「擬似コード禁止」ルールに従って `examCode` を空文字にする**（副題は `.filter(Boolean)` で自動的に省かれる）。現状は据え置き。
  ※ 日本語表記「Agentforce Sales コンサルタント」は、公式FAQが英語のみだったため**リポジトリ内の既存表記に合わせた暫定訳**。Salesforce Japan の正式な日本語名が判明したら合わせる。

- **Agentforce Specialist のブループリント（5分野か6分野か・各%）**（未確認）
  現状: リポジトリは agents 35 / prompt 20 / data360 20 / deploy 10 + gov 10 / orch 5。
  二次ソースが2説に割れている（説A: AI Agents 35 / Prompt Engineering 20 / Data Cloud for Agentforce 20 / Development Lifecycle 20 / Multi-Agent Interoperability 5＝現状と合計一致。説B: Dev Lifecycle and Observability 15 / Multi-Agent Interoperability 15）。
  出典案: 公式試験ガイド https://help.salesforce.com/s/articleView?id=005298924&type=1&language=en_US
  ※ weight は LOOP.md 上「不可侵」なので、公式で確定するまで触らない。

- **2027-02-01 廃止の24資格に当サイトの8資格が含まれていないか**（未確認）
  二次ソースでは Administrator / Advanced Admin / Platform App Builder / Platform Developer I・II は残留と明記。Sharing and Visibility Architect・Experience Cloud Consultant は廃止リストに見当たらないが、完全なリストは未確認。

## 高リスク領域で要判断（認証/Firestore/ブループリント比率/storageKey 等）

- ✅ 対応済み（2026-08-22）: Firestore セキュリティルールをリポジトリ管理化（root `firestore.rules`）
  経緯: 手順書のコードブロックが唯一の出典で差分が追えず、本人書込が `access` 1フィールドしか制限していなかった。
  対応: ①本人の書込を `selfKeys()` のホワイトリストに限定（`maintOk`＝メンテ回避の自己付与／`approvedAt`＝休眠失効の起点／`notices`／`fbReplies`／`adminLog` を管理者専用に）②`allow delete` を管理者のみに（停止中の人が自 doc を消して blocked を帳消しにする穴をふさぐ）③管理者判定に `adminUids()` を追加。
  補足: `stores.<cert>.acquiredDate`（資格ロック解除）は**本人が書けるままにした**。アプリに「取得済みにする」ボタンがある正規の自己申告操作で、サーバ側で本人と区別できないため。ロック解除は学習体験の仕掛けであってセキュリティ境界ではない、という整理。
  ✅ 2026-08-22 に本番へ適用済み（だいきがコンソールへ貼って公開・管理者ビューの起動と一般アカウントの進捗保存を確認）。管理者判定は `adminUids()` の uid 固定に移行し、`adminEmails()` は `[]`（メール判定は廃止）。
  未対応: `@firebase/rules-unit-testing` による CI 検証（エミュレータが要るので別途）。ルールを直したら**コンソールへ貼り直す**運用は変わらない（自動デプロイは無い）。

- 模試のブループリント再現ずれ（2026-08-22 に再測定・状況が変わりました）
  ✅ sales-cloud は解消済み: 200問まで増えた結果、全5分野が必要数を満たし乖離ゼロ（記録当時の「app 分野だけで52%」は当時の在庫不足によるもの）。
  ✅ エンジン側の是正: `pickWeightedExam` を①最大剰余法（合計が必ず examN・丸め不利が末尾分野に固定されない）②不足分は「在庫の残る分野へウェイト比で再配分」（従来は全問題からランダム補填＝在庫の多い分野へ寄っていた）に変更。weight は不可侵のまま触っていない。
  🔴 **残るのはデータ作業（人手）**。`node tools/validate-data.js` が毎回警告で可視化します:
    - service-cloud: `ind`（業界知識）が必要7問に対し在庫4問 … **3問不足**
    - sharing-visibility: `obj` 必要16/在庫11・`model` 必要11/在庫9 … **7問不足**。加えて81問中60問＝1回の模試で全体の74%を消費＝毎回ほぼ同じ出題になるため、分野を問わず増問が要る

## 検証レッドで巻き戻した項目

<!-- ここに記録 -->
