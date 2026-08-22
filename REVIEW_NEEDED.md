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

- Firestore セキュリティルールがリポジトリに存在しない（`certifications/sf-admin/Firebaseセットアップ手順.md` のコードブロックが唯一の出典）。
  現状: 本人書込が `access` 1フィールドしか制限しておらず、`maintOk`（メンテ回避の自己付与）・`lastSeen/approvedAt`（休眠失効の無効化）・`stores.<cert>.acquiredDate`（資格ロック解除）を本人が書ける。admin 判定が改変可能な `token.email`＋未実在ドメインに依存。
  対応案: `firestore.rules` をリポジトリへコミット→本人書込を許可フィールドのホワイトリスト化→admin 判定を uid/Custom Claims 化→`@firebase/rules-unit-testing` を CI へ。※コンソール操作を伴うため、だいきの承認と手順書更新をセットで。
  注記: この修正が入るまで、CLAUDE.md／cloud-sync.js の「maintOk の付与は管理者だけ」の記述は現行ルールでは成立していない（要訂正）。

- 模試のブループリント再現ずれ（新5資格）。sales-cloud は app 分野だけで模試の約52%（乖離+22pt）、sharing-visibility は81問中60問＝毎回74%が同一。domains.json の weight は LOOP.md 上「不可侵」なので、weight を変えずに「分野別の問題数を足す／再分類する」方向でしか是正できない＝人手データ作業。

## 検証レッドで巻き戻した項目

<!-- ここに記録 -->
