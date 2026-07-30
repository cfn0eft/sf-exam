# REVIEW_NEEDED — 人間レビュー待ち

> 自動では触れない論点や、検証レッドで巻き戻した項目をここに退避する。だいきのレビュー後に対応する。
> 各件は次を1ブロックで書く: **対象（ファイル/question id 等）・現状・疑問点・出典案（または巻き戻した理由）**。

## 試験の正誤に関わる疑い（データは触らずここに記録）

- ✅ 解決済み（2026-07-30）: certifications/experience-cloud/data/questions.json #85 と #116（重複＋正解矛盾）
  経緯: ほぼ同一の設問（Experience Cloud の Google アナリティクスで管理者がレポートできる項目・同一の5選択肢）で正解集合が食い違っていた。
  裏取り: Salesforce 公式（「Track Your Salesforce Sites with Google Analytics」/「Track User Engagement with Google Analytics 4」）は、追跡対象として「Salesforce オブジェクト別のページビュー」「検索アクティビティ」「ログイン（ユーザー ID/種別）」を明記。
    → #85 の正解が公式どおり。#116 は正しい「オブジェクト別ページビュー」を落として「サポートへのお問い合わせページのアクティビティ」（公式に無い）を正解にしており、解説も「オブジェクト別ページビューは追跡不可」と公式に反する記述だった。
  対応: 重複かつ誤答の #116 を削除し、公式に正しい #85 を残した（experience-cloud 132→131問）。LP の CERTS meta も 131問へ更新。

## 高リスク領域で要判断（認証/Firestore/ブループリント比率/storageKey 等）

- Firestore セキュリティルールがリポジトリに存在しない（`certifications/sf-admin/Firebaseセットアップ手順.md` のコードブロックが唯一の出典）。
  現状: 本人書込が `access` 1フィールドしか制限しておらず、`maintOk`（メンテ回避の自己付与）・`lastSeen/approvedAt`（休眠失効の無効化）・`stores.<cert>.acquiredDate`（資格ロック解除）を本人が書ける。admin 判定が改変可能な `token.email`＋未実在ドメインに依存。
  対応案: `firestore.rules` をリポジトリへコミット→本人書込を許可フィールドのホワイトリスト化→admin 判定を uid/Custom Claims 化→`@firebase/rules-unit-testing` を CI へ。※コンソール操作を伴うため、だいきの承認と手順書更新をセットで。
  注記: この修正が入るまで、CLAUDE.md／cloud-sync.js の「maintOk の付与は管理者だけ」の記述は現行ルールでは成立していない（要訂正）。

- 模試のブループリント再現ずれ（新5資格）。sales-cloud は app 分野だけで模試の約52%（乖離+22pt）、sharing-visibility は81問中60問＝毎回74%が同一。domains.json の weight は LOOP.md 上「不可侵」なので、weight を変えずに「分野別の問題数を足す／再分類する」方向でしか是正できない＝人手データ作業。

## 検証レッドで巻き戻した項目

<!-- ここに記録 -->
