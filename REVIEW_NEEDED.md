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
  ✅ 分野の在庫不足は 2026-08-22 に解消: service-cloud `ind` に3問（120→123問）、sharing-visibility `obj` に5問・`model` に2問（81→88問）を追加。**全8資格で模試が公式比率どおりに全分野から出せる状態**になった（validate-data の在庫不足警告が消滅）。
  追加10問の裏取り: すべて Salesforce 公式ドキュメントを直接取得して確認済み（Apex 開発者ガイドの sharing キーワード／ユーザーモード既定・Apex リファレンスの Security.stripInaccessible・DRAES の暗黙の共有・スコープルール／制限ルール開発者ガイド・Trailhead の View All Fields／項目権限／Agent Analytics 指標定義／Command Center for Service／Service Intelligence）。各問の `reference_url` に該当ページを設定。
  ✅ **2026-08-22 に増問完了**: sharing-visibility を 88→132問（obj+18 / model+12 / other+8 / rec+6 の44問）。模試1回の消費は 74%→**45%**、分野別の乖離も公式ウェイト±2pt 以内（obj -1.2 / rec +1.9 / other -0.1 / model -0.6）。validate-data の出題プール警告は消滅。
  作成と検証を**別エージェントに分離**して実施。検証で見つかった主な誤りと対応:
    - 【重大】所有権スキューの緩和策で公式の source/target が逆転（公式原文 `Keep them out of public groups that can be used as the source for sharing rules.`）→ 正解・誤答・解説すべて訂正
    - 【重大】ケースの組織の共有設定に「親レコードに連動」を選ばせる問題＝**設定不可能**（`DefaultCaseAccess` の有効値は None/Read/Edit/ReadEditTransfer。`ControlledByParent` を持つのは `DefaultContactAccess`）→ 子オブジェクトを取引先責任者へ差し替え
    - 既存 #33 と論点が重複する1問を**不採用**（45→44問）
    - 日本語UI用語の誤り3件（「Apex 共有再計算」→「Apex 共有の再適用」／「セッションのアクティブ化が必要」→「セッションの有効化が必要」／「区分」→「ディビジョン」「大量ポータルユーザー」→「高ボリュームポータルユーザ」「親レコードにより制御」→「親レコードに連動」）
    - `System.AccessType` の値の記載漏れ（UPSERTABLE を含む4値）／未検証の数値主張（「20件は旧上限」）の削除／版数固定URL(234.0)・`get_document_content` 形式URLの canonical 化
  ⚠️ 追加44問はすべて `source:'gen'`。論点の出どころは各問の `origin` に記録（official-docs 30 / examtopics.com 5 / salesforceben.com 2 / issacc.com 2 / apexhours・validexamdumps・focusonforce・quizlet・dumpsmate 各1）。**だいきの最終確認を推奨。**
  ✅ 検証で「確度：中」と留保が付いていた3点は、2026-08-22 に **PDF 経路（`api_meta.pdf`）で公式原文を取得して確定済み**（合成判断ではなくなった）:
    - #94「すべて編集（Modify All）を付けても項目レベルセキュリティは残る」→ `modifyAllRecords` の定義は "all records ... regardless of the sharing settings for the object" ＝レコードと共有設定の話で、項目は API 63.0 以降の別権限 `viewAllFields`（"all fields and field data ... can be viewed"）が担う。
    - #90「ミュート権限セットは単独でユーザーに割り当てられない」→ `MutingPermissionSet` は "used in conjunction with PermissionSetGroup"、"settings enabled by MutingPermissionSet are turned off for the permission set group that it's a component of"。
    - #103「必須項目は項目権限を変更できない」→ `PermissionSetFieldPermissions` に "In API version 30.0 and later, permissions for required fields can't be retrieved or deployed."
    あわせて、前バッチ #85（View All Fields が参照専用か編集可か公式に明記が無い、として保留していた点）も `viewAllFields` の定義 "can be viewed" で**参照**と確定し、解説に反映済み。

- ✅ 既存データの不具合を1件修正（2026-08-22）: sharing-visibility #11
  現状: 「ケース（標準オブジェクト）を Apex 管理共有で共有し、共有理由（rowCause）を定義する」という設問だったが、公式は `Apex sharing reasons and Apex managed sharing recalculation are only available for custom objects.` と明記しており、標準オブジェクトでは共有理由を定義できず設問が成立しない。
  対応: 題材をカスタムオブジェクト「案件審査」に差し替え、解説に公式原文と「標準オブジェクトでは RowCause は 'Manual' になる」旨を追記。
  ⚠️ 追加分は AI 生成（`source: 'gen'`）。公式ドキュメントの記述と1問ずつ突き合わせてはいるが、**だいきの最終確認を推奨**（特に #85 View All Fields の「読み取り専用かどうか」は公式ページに明記が無く、問題文でもその点は問うていない）。

## 検証レッドで巻き戻した項目

<!-- ここに記録 -->
