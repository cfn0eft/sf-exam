<div align="center">

# ☁️ SF Exam — Salesforce 認定資格 学習アプリ

**Salesforce 認定資格に、本番さながらの比率で挑む。学習・試験・復習・暗記・統計をひとつに。**

[![Live](https://img.shields.io/badge/▶_Live_Demo-cfn0eft.github.io%2Fsf--exam-2EA043?style=for-the-badge)](https://cfn0eft.github.io/sf-exam/)

![Vanilla JS](https://img.shields.io/badge/Vanilla_JS-no_framework-F7DF1E?logo=javascript&logoColor=black)
![Authentication](https://img.shields.io/badge/問題配信-認証必須-5A0FC8)
![Firebase](https://img.shields.io/badge/Firebase-Auth_+_Firestore-FFCA28?logo=firebase&logoColor=black)
![GitHub Pages](https://img.shields.io/badge/GitHub_Pages-deployed-222?logo=github)
![Questions](https://img.shields.io/badge/総問題数-2364-1f6feb)
![Static Site](https://img.shields.io/badge/site-static-success)

</div>

---

## 📖 概要

**SF Exam** は、Salesforce 認定資格の合格を目指すための学習用クイズアプリです。
画面はGitHub Pagesの静的サイト、問題はFirebaseの認証・利用承認を確認して配信します。問題の取得にはオンライン接続が必要です。
全資格で共通エンジンを使用します。問題原本と変更履歴は別の非公開リポジトリで管理します。

**問題の編集・配信・ローカル検証は [問題データ管理手順](docs/QUESTION-DATA.md) を参照してください。**

> 試験モードは**公式の出題比率（ブループリント）どおり**に問題を抽出するので、本番に近い感覚で実力を測れます。

---

## ✨ 主な機能

| | 機能 | 説明 |
|---|---|---|
| 📝 | **学習モード** | 1 問ずつ解いて、詳しい解説をその場で確認 |
| ⏱️ | **試験モード** | 公式比率で 60 問を出題・制限時間つき・分野別スコアで採点。直近2回に出た問題は出にくい |
| 🔁 | **復習モード** | 間違えた問題・★ブックマークだけを集中的に再出題 |
| 🧠 | **SRS（間隔反復）** | SM-2 ベースの忘却曲線で「そろそろ忘れる問題」を自動で出題 |
| 📚 | **教科書 / 設定画面マップ** | 設定のナビ手順や「どこで何を設定するか」を体系化 |
| 🗂️ | **用語帳** | 重要用語を定義・試験ポイント・関連問題リンク付きで暗記 |
| 📊 | **統計** | 分野別の習熟度・弱点分野からの出題・実績バッジ・週次レポート・学習ヒートマップ |
| 🎯 | **受験プラン** | 受験日カウントダウン・デイリー学習目標・逆算ペース（残り問題数から1日ノルマを自動算出） |
| ☁️ | **クラウド同期** | 簡易 ID/PW でログインすると進捗を端末間で同期（任意・Firebase） |
| 🔐 | **アクセス承認制** | 管理者が承認したアカウントだけ問題にアクセス可（ホワイトリスト）。未承認は承認待ち画面でお名前を入力して利用申請できる |
| 👑 | **管理者ビュー** | 全アカウントの進捗・統計を集約。承認/停止/却下/削除、新規申請の通知バッジ、フィードバック集約、CSV/JSON 書き出し |
| 🏷️ | **出典フィルタ** | 「タイソンブログ / jpnshiken / AI 生成」を複数選択で切り替え。学習・試験・SRS・復習すべてに反映 |
| 🌙 | **その他** | ダークモード / 未回答・自信なしフィルタ / 個人メモ / 選択肢シャッフル / キーボードショートカット |

---

## 📚 収録資格

| 資格 | 試験コード | 問題数 | 分野 | 用語 | 授業 | 合格ライン |
|---|---|---:|---:|---:|---:|---:|
| **Salesforce 認定 Platform アドミニストレーター** | Plat-Admn-201 | **437 問** | 8 分野（Agentforce 含む） | 94 語 | 14 本 | 65% |
| **Salesforce 認定 Platform アプリケーションビルダー** | Plat-Admn-202 | **445 問** | 5 分野 | 83 語 | 10 本 | 73% |
| **Salesforce 認定 Platform デベロッパー** | Plat-Dev-201 | **499 問** | 4 分野 | 75 語 | 19 本 | 68% |
| **Salesforce 認定 Agentforce Specialist** | AI-201 | **211 問** | 6 分野 | 26 語 | — | 72% |
| **Salesforce 認定 Agentforce Sales コンサルタント**<br><sub>旧 Sales Cloud コンサルタント</sub> | Sales-Con-201 | **213 問** | 5 分野 | 67 語 | — | 69% |
| **Salesforce 認定 Agentforce Service コンサルタント**<br><sub>旧 Service Cloud コンサルタント</sub> | Service-Con-201 | **200 問** | 8 分野 | 75 語 | — | 78% |
| **Salesforce 認定 Experience Cloud コンサルタント** | EX-Con-101 | **188 問** | 8 分野 | 68 語 | — | 65% |
| **Salesforce 認定 Sharing and Visibility アーキテクト** | Plat-Arch-205 | **200 問** | 4 分野 | 54 語 | — | 58% |

**全 8 資格・計 2,393 問**を収録。専門5資格の内容と公式出題範囲を再監査中です。Service の出題比率、および Agentforce・Service・Experience・Sharing and Visibility の合格ラインは、2026-09-13 に日本語の公式受験ガイドを確認して更新しました。Experience は同日、Jpnshiken由来7問と公式資料ベースの12問を追加し、既存16問を修正しました。Sharing and VisibilityもJpnshiken由来7問と公式資料ベースの11問を追加し、既存11問を修正しました。Serviceは公開103問から未収録5論点、日本語版131問から累計34論点、Tysonの一般記事から1論点を追加しています。直近の15問追加で200問となり、既存Q121の指標の誤りと10問の分野を見直しました。旧分類の学習時間は保持し、新しい集計と区別します。131問の全件監査は未完了で、7件を保留し、既存対応分も継続監査します。同日のSharing監査では、Tysonの一般共有記事から2論点、Jpnshiken公開75問から累計2論点を追加し、既存29問の共有・Apexアクセス制御等を修正しました。その後の第15弾ではJpnshiken由来5問・Tyson由来2問・公式資料からの補完19問を追加して180問へ更新し、既存4問も見直しました。[第15弾の取得・検証範囲](docs/sharing-content-wave15-2026-09-14.json)では、Designer版の171リンクと取得済みの本文5問を区別しています。第16弾では本文取得を19/171問まで進め、Jpnshiken由来12問と公式補完8問を追加して200問とし、既存5問と関連教材も修正しました。[第16弾の照合記録](docs/sharing-content-wave16-2026-09-14.json)で取得元の不備・重複・再構成の範囲を確認できます。[75問の照合記録](docs/sharing-jpn75-source-intake-2026-09-14.json)には未検証の対応候補と保留も区別して記録しています。第17弾ではExperienceの129問版から12本文を取得し、3論点と公式補完17問を追加して170問へ更新しました。既存6問と関連教材を見直し、取得元の無関係な解説や未検証の唯一解は採用していません。[第17弾の取得・検証範囲](docs/experience-content-wave17-2026-09-14.json)では残り117本文と全問監査を未完了として区別しています。優先サイトの取得範囲は [公開ソース一覧](docs/noncore-source-inventory-2026-09-14.json)、分野バランス補正を含む残作業は [専門資格コンテンツ監査](docs/noncore-content-audit-2026-09-13.md) に記録しています。

Salesは2026-09-14に213問へ更新しました。先の[公開128問との照合](docs/sales-jpn128-source-intake-2026-09-14.json)に続き、[CRT-251-JPNの公開86問](docs/sales-jpn86-source-intake-2026-09-14.json)を既存203問の設問・正解と比較し、優先ソース由来2問と公式資料による補完8問を追加、既存AI関連4問を修正しました。[公式5分野への再分類](docs/sales-blueprint-audit-2026-09-14.json)で比率を25/24/20/18/13に更新し、AIは14問になりました。既存ID・出典・履歴キーを維持し、過去の分野別学習時間は旧分類のまま表示します。全問の正誤監査、意味重複の整理、別名・別版の照合と分野バランスの補正は未完了です。

同日の追加監査でSalesの既存8問と関連教材を修正し、予測カテゴリの集計図、所有者の偏り、Chatterの要約メール、経過24時間、最小権限、ダッシュボードの実行ユーザー、クォータの編集方法を見直しました。[別名79問版の照合](docs/sales-jpn79-source-intake-2026-09-14.json)は公開HTMLの6問までです。7問目のHTTP 429で停止し、8〜79問目は未試行です。213問版とこの追加修正はローカル検証中で、公開反映の確認とは区別します。

Agentforceは2026-09-26に211問へ更新しました。Jpnshikenの最新154問版から、未処理セッションの即時トレース、サブエージェント誤ルーティング、エージェントユーザーの権限、分類説明とスコープ、Record Snapshot、アクション指示、Trust Layer、Sales EmailsのFLS、Agent Scriptの文字列リスト、変更セット移送、プロンプト版の不変性、意図クラスタ条件、画面フローからのプロンプト呼び出し、Intelligent Contextのサンプル評価、取得チャンクによるRAG障害切り分け、Agentforce Sales Managementの現行用途、Service Agentの有人引き継ぎ、関連リストグラウンディング、Resolved Promptのプレビュー、Knowledge回答のData 360構成、カスタムリトリーバーの版管理、Flow基盤アクションのデータアクセス、Data 360 DMOのPrompt Builderグラウンディング、組織単位のモデルプロバイダー制御、Flexの複数入力、実行時Web検索、依存関係を含む本番移送、Trust Layerのマスク解除、Field Generation利用者権限を累計29問追加し、公式仕様と異なる出典回答は修正または不採用にしました。154問すべての本文取得と既存問題への意味照合は完了し、隣接製品、公式根拠不足、保留を区別しています。[154問版の照合記録](docs/agentforce-jpn154-source-intake-2026-09-26.json)、[101問の照合記録](docs/agentforce-jpn101-source-intake-2026-09-14.json)、[106問版の照合記録](docs/agentforce-jpn106-source-intake-2026-09-14.json)を参照してください。第37・38弾では意味重複3組と、旧SDR分類・予測AI・Work Summaries・Service Replies・旧Service AI Grounding・旧User Utterance Dashboardの6問を公式資料ベースの現行論点へ置き換え、累計27問を4択化しました。出典154問の全説明を含む完全な正誤監査と、既存211問全体の分野バランス・残る意味重複・119問の3択問題の品質監査は継続します。
Experienceの第18弾では170問を維持し、既存12問と用語・比較表・直前対策・設定マップ、図解5点を公式資料へ合わせました。ゲスト作成レコードのキュー所有、Channel Accountの分析機能、SKU、GA4、初投稿審査条件などを修正しています。[129問版の取得・照合記録](docs/experience-content-wave18-2026-09-14.json)は53本文まで進み、未取得は76本文です。重複対応と正誤確認済みの範囲を区別し、他の既存問題の曖昧さや公式資料間の不一致は未解消として残しています。ローカル修正であり、公開反映済みではありません。

Experienceの第19弾では176問へ更新し、既存14問と関連教材も修正しました。129問版の公開本文を全129件取得し、既存との重複・関連・保留を記録しましたが、全問の正誤監査完了ではありません。[第19弾の取得・照合記録](docs/experience-content-wave19-2026-09-14.json)に公式根拠と未解消項目を残しています。ローカル更新であり、公開は行っていません。

Experienceの第20弾は176問を維持し、既存14問と関連教材を修正しました。ライセンス・Knowledge共有などの誤説明と重複3組を整理し、IDと出典情報は保っています。[第20弾の修正記録](docs/experience-content-wave20-2026-09-14.json)。新規取得・増問・公開は行っていません。

Experienceの第21弾では180問・66用語へ更新。既存12問を修正し、公式資料に基づく不足論点4問を追加しました。検索UIと閲覧権限、Grid、Customer Insightsの制約を関連教材にも反映しています。[第21弾の修正記録](docs/experience-content-wave21-2026-09-14.json)。取得済み本文を再利用したローカル更新で、公開は行っていません。

Experienceの第23弾では188問・68用語へ更新し、既存12問を修正しました。Jpnshiken由来のライセンス・モデレーション・PRM・承認問題を公式資料へ合わせ、MDF、Question-to-Case、外部レポート、承認メールの不足4論点を追加しました。既存ID・出典・学習履歴キーは維持し、非公開監査記録に根拠と残作業を保存しています。ローカル更新で、公開は行っていません。

Experienceの第22弾では184問・67用語へ更新し、既存11問を修正しました。オーディエンスの制約など4問を公式資料から追加し、表示と認可を混同する説明を教材・図解でも修正。1問をブランディング分野へ移し、履歴のキーは維持しています。[第22弾の修正記録](docs/experience-content-wave22-2026-09-14.json)。ローカル更新で、公開は行っていません。

各資格とも「出典」フィルタで、タイソンブログ由来・jpnshiken 由来・AI 生成の問題を**複数選択**で切り替えられます。

> **「授業」列**は、スライド形式で順に学ぶ「イチから授業」（`data/lessons.json`）の本数です。
> `—` の 5 資格（Agentforce / Sales Cloud / Service Cloud / Experience Cloud / Sharing and Visibility）は
> **授業コンテンツが未整備**で、ホームの授業導線も表示されません。問題・教科書・用語帳・比較表・模試は全 8 資格で利用できます。

---

## 🎯 試験モードは「公式の出題比率」どおり

試験モードは各分野のウェイトに比例して 60 問を抽出します（アドミンの例）。

| 分野 | 公式ウェイト | 60 問中 |
|---|---:|---:|
| 設定と管理 | 15% | 9 問 |
| オブジェクトとアプリ / Lightning App Builder | 15% | 9 問 |
| 自動化 | 15% | 9 問 |
| データと分析 | 17% | 10 問 |
| セールス / マーケティング | 10% | 6 問 |
| サービス / サポート | 10% | 6 問 |
| 生産性 / コラボレーション | 10% | 6 問 |
| **Agentforce** | 8% | 5 問 |

採点後は分野別の正答率が表示され、弱点がひと目で分かります。

---

## 🏗️ アーキテクチャ

**共通エンジンと資格ごとのデータ**で構成します。問題は `question-bank.js` が認証付きで取得し、分野・教材は静的JSONから読み込みます。

```
ブラウザ
  └─ certifications/<資格>/index.html   ← 薄いシェル（window.CERT_CONFIG を定義）
        ├─ quiz-engine.js               ← 全資格共通の本体（学習/試験/SRS/統計…）
        ├─ quiz.css                     ← 共通スタイル
        ├─ question-bank.js → Firestore ← 認証付きの問題配信
        └─ data/*.json を実行時 fetch    ← 分野・用語・設定マップ
```

```
sf-exam/
├─ index.html              # LP（ゲートウェイ）＋資格レジストリ CERTS[]
├─ legal.html              # 利用規約・運営情報・問い合わせ窓口
├─ quiz-engine.js          # 全資格共通エンジン
├─ quiz.css                # 共通スタイル
├─ changelog.js            # アップデート履歴（LP・全資格で共有・唯一の出典）
├─ figures.js              # 図解データ（全資格共有・インライン SVG）
├─ firebase-config.js      # Firebase 設定（ログイン・同期・問題配信に必須）
├─ question-bank.js        # 認証付き問題取得・照合・破棄
├─ question-catalog.json   # 本文を含まない公開検証用メタデータ
├─ cloud-sync.js           # クラウド同期＋アクセス承認＋本人退会＋管理者ビュー（Auth + Firestore）
├─ progression.js          # 資格のロック解除（直列進行）— LP・全資格ページ共通の判定
├─ firestore.rules         # Firestore セキュリティルール（唯一の出典・コンソールへ貼る）
├─ manifest.webmanifest    # PWA マニフェスト
├─ sw.js                   # 旧オフラインキャッシュの削除・登録解除用
├─ tools/                  # 開発ツール（データ検証・エンジンテスト・版数繰り上げ等）
├─ icons/                  # アプリアイコン
├─ SECURITY.md             # セキュリティポリシー
└─ certifications/
   ├─ sf-admin/
   │   ├─ index.html       # CERT_CONFIG を差し替えただけのシェル
   │   └─ data/
   │       ├─ domains.json     # 分野定義＋公式ウェイト
   │       ├─ vocab.json       # 用語帳（定義・試験ポイント・関連問題）
   │       ├─ navmap.json      # 設定画面マップ
   │       ├─ cram.json / compare.json  # 直前対策・比較表（任意）
   │       └─ lessons.json     # イチから授業（スライド学習・任意）
   ├─ app-builder/
   │   └─ …（同じ構成）
   ├─ developer/ ・ agentforce/
   │   └─ …（同じ構成）
   └─ sales-cloud/ ・ service-cloud/ ・ experience-cloud/ ・ sharing-visibility/
       └─ …（各資格とも同じ構成）
```

---

## 🚀 新しい資格を追加する

問題は非公開リポジトリへ追加し、公開側には教材・シェル・資格情報を追加します。

1. 非公開側に `questions.json`、公開側の `certifications/<slug>/data/` に `domains` / `vocab` / `navmap` を置く
2. 既存のシェル `index.html` を複製し、先頭の `window.CERT_CONFIG`（`slug` / `certName` / `examCode` / `examN` / `examMin` / `pass` / `storageKey` / `dataDir`）を差し替える
3. ルート `index.html` の `CERTS[]` 配列に 1 件追加する → トップに資格カードが自動生成される
4. `firestore.rules` の資格別権限・`progression.js` の資格情報を更新し、問題データ管理手順に沿って検証・配信する

---

## 🧪 開発ツールと CI

通常の検証スクリプトはNode単体で動きます。Firestoreルール検証にはnpmの開発依存とJava 21が必要です。
公開CIは架空問題、非公開CIは実際の原本を検証します。公開CI成功後に配信対象だけを `_site` へ組み立て、GitHub Pagesへ公開します。

| コマンド | 何を検証するか | 実行するタイミング |
|---|---|---|
| `node tools/validate-data.js` | 各資格 JSON のスキーマ・ID 重複・分野参照・図解参照、SW のプリキャッシュ対象の実在、`manifest.webmanifest` の必須キーとリンク先、LP の `CERTS[].meta` とデータ実数の一致、**模試が公式ブループリントを再現できるか（分野別の在庫不足）**、キャッシュ版数 3 点セット、JS 構文、changelog 形式 | **データ・図・manifest を編集したら必ず** |
| `node tools/test-engine.js` | エンジンの純粋ロジック（SRS・難易度推定・XP/レベル・模試抽出・逆算ペース・store 正規化ほか）。DOM スタブ＋`vm` でエンジンを丸ごと読み込む | **`quiz-engine.js` を編集したら必ず** |
| `node tools/test-cloud-sync.js` | 同期・アクセス承認・休眠失効・メンテ例外・管理者ビュー集計の判定ロジック | **`cloud-sync.js` を編集したら必ず** |
| `node tools/bump-version.js` | キャッシュ無効化 3 点セット（`sw.js` の `CACHE` / `SHELL` の `?v=` / 各 HTML の `?v=`）を一括繰り上げ（`--dry` で確認のみ） | **共有 JS/CSS を更新したら必ず** |
| `node tools/check-links.js` | 全問題の `reference_url` の死活チェック（別ワークフローで週 1 実行） | 任意 |
| `node tools/feedback-to-tasks.js <json>` | 管理者ビューから書き出したフィードバック JSON を対応チェックリストへ変換 | 任意 |

---

## 🛠️ 技術スタック

- **フロントエンド**: 素の HTML / CSS / JavaScript（フレームワーク・ビルド工程なし）
- **問題データ**: Firestoreから認証・利用承認後に取得
- **教材データ**: 資格ごとの静的JSON
- **ホーム画面追加**: `manifest.webmanifest`（問題取得にはオンライン接続が必要）
- **認証 / 同期（任意）**: Firebase Authentication + Cloud Firestore
- **ホスティング**: GitHub Pages（静的配信）

---

## 📦 セットアップ & デプロイ

ローカルでは任意の静的サーバーで動きます（ビルド不要）。

```bash
# 例: ローカルプレビュー
python -m http.server 8000
#   → http://localhost:8000/
```

**デプロイ**は `main` ブランチへ push するだけ（GitHub Pages が自動配信）。

```bash
git add -A
git commit -m "update"
git push origin main
# 公開URL: https://cfn0eft.github.io/sf-exam/
```

**クラウド同期（任意）** を使う場合は、`firebase-config.js` に自分の Firebase 設定を貼り、
`firestore.rules` の中身を Firebase コンソールの「Firestore → ルール」へ貼って公開します
（手順は `certifications/sf-admin/Firebaseセットアップ手順.md`）。
設定しなくても、進捗はブラウザの `localStorage` にローカル保存されます。

---

## 🔐 アクセス承認制と管理者ビュー

ログインアカウントは **ホワイトリスト方式** で管理します。

- 進捗は `progress/{uid}` に保存し、doc 直下の `access` フラグで利用可否を制御します（`approved`=利用可 / `pending`=承認待ち / `blocked`=停止）。
- **`approved` のアカウントだけが問題にアクセス可能**。未承認は全面ロック画面になり、**お名前を入力して利用申請**できます（新規登録も既定で承認待ち）。
- **管理者ID（既定 `admin`）** でログインすると管理者ビューが開き、全アカウントの進捗・統計の閲覧、**承認 / 停止 / 申請の却下 / 完全削除**、新規申請の通知バッジ、フィードバックの集約、CSV/JSON 書き出しができます。
- 一般ユーザーはマイページでパスワードを再入力し、自分の全資格の進捗・接続履歴・フィードバック・Firebase Authenticationアカウントをまとめて削除できます。管理者アカウントは対象外です。
- `access` を `approved` にできるのは **管理者だけ**（Firestore ルールで本人は自分を承認できないよう制限）。本人が書けるフィールドはホワイトリスト方式で限定され、doc の削除は本人の退会または管理者操作だけです。ルールの実体は root の `firestore.rules`（貼り方は `certifications/sf-admin/Firebaseセットアップ手順.md` のステップ 5）。

> 問題の取得制限はFirestoreで実施します。未ログイン・未承認・停止中のアカウントによる直接取得も拒否します。専門資格は別途利用許可が必要です。

---

## 🔒 セキュリティ

- `firebase-config.js` の API キーは **Firebase Web 用＝公開前提**の値で、秘密ではありません（GitHub のシークレット警告は false positive）。
- 実際のアクセス制御は **Firestore セキュリティルール**で行います（`progress/{uid}` は本人＋管理者のみ read/write、`access` フラグは管理者のみ書き込み可）。
- API キーには **HTTP リファラー制限**を設定済みです。

詳細・脆弱性の報告方法は [SECURITY.md](SECURITY.md) を参照してください。

---

## 📱 PWA

スマホのブラウザで「ホーム画面に追加」すると、アプリのように起動できます。問題を読み込むときはオンライン接続と利用承認が必要です。

---

<div align="center">

**Salesforce, ADM-201 は Salesforce, Inc. の商標です。本アプリは学習目的の非公式プロジェクトです。**

</div>
