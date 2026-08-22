<div align="center">

# ☁️ SF Exam — Salesforce 認定資格 学習アプリ

**Salesforce 認定資格に、本番さながらの比率で挑む。学習・試験・復習・暗記・統計をひとつに。**

[![Live](https://img.shields.io/badge/▶_Live_Demo-cfn0eft.github.io%2Fsf--exam-2EA043?style=for-the-badge)](https://cfn0eft.github.io/sf-exam/)

![Vanilla JS](https://img.shields.io/badge/Vanilla_JS-no_framework-F7DF1E?logo=javascript&logoColor=black)
![PWA](https://img.shields.io/badge/PWA-offline_ready-5A0FC8?logo=pwa&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-Auth_+_Firestore-FFCA28?logo=firebase&logoColor=black)
![GitHub Pages](https://img.shields.io/badge/GitHub_Pages-deployed-222?logo=github)
![Questions](https://img.shields.io/badge/総問題数-2051-1f6feb)
![No Build](https://img.shields.io/badge/build_step-none-success)

</div>

---

## 📖 概要

**SF Exam** は、Salesforce 認定資格の合格を目指すための学習用クイズアプリです。
ビルド不要・サーバーレスの**静的サイト**として GitHub Pages で動作し、**PWA** なのでオフラインでも使えます。
1 つの共通エンジンを全資格で共有するデータ駆動設計で、**JSON を足すだけで新しい資格を増やせる**のが特長です。

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
| **Salesforce 認定 Platform アドミニストレーター** | ADM-201 | **437 問** | 8 分野（Agentforce 含む） | 94 語 | 14 本 | 65% |
| **Salesforce 認定 Platform アプリケーションビルダー** | CRT-403 | **445 問** | 5 分野 | 83 語 | 10 本 | 63% |
| **Salesforce 認定 Platform デベロッパー** | Platform Developer I | **499 問** | 4 分野 | 75 語 | 19 本 | 68% |
| **Salesforce 認定 Agentforce Specialist** | — | **138 問** | 6 分野 | 26 語 | — | 73% |
| **Salesforce 認定 Agentforce Sales コンサルタント**<br><sub>旧 Sales Cloud コンサルタント</sub> | CRT-251 | **200 問** | 5 分野 | 67 語 | — | 69% |
| **Salesforce 認定 Agentforce Service コンサルタント**<br><sub>旧 Service Cloud コンサルタント</sub> | CRT-261 | **120 問** | 8 分野 | 75 語 | — | 67% |
| **Salesforce 認定 Experience Cloud コンサルタント** | CRT-271 | **131 問** | 8 分野 | 63 語 | — | 62% |
| **Salesforce 認定 Sharing and Visibility アーキテクト** | — | **81 問** | 4 分野 | 54 語 | — | 67% |

**全 8 資格・計 2,051 問**を収録。いずれも **最新の公式ブループリント**に準拠（アドミンは 2025/12 改訂・Agentforce 8% を含む 8 分野構成）。
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

**「1 つの共通エンジン × 資格ごとの JSON」** というデータ駆動構成です。ロジックは `quiz-engine.js` の 1 本に集約され、各資格は薄いシェルと 4 つの JSON だけを持ちます。

```
ブラウザ
  └─ certifications/<資格>/index.html   ← 薄いシェル（window.CERT_CONFIG を定義）
        ├─ quiz-engine.js               ← 全資格共通の本体（学習/試験/SRS/統計…）
        ├─ quiz.css                     ← 共通スタイル
        └─ data/*.json を実行時 fetch    ← 問題・分野・用語・設定マップ
```

```
sf-exam/
├─ index.html              # LP（ゲートウェイ）＋資格レジストリ CERTS[]
├─ quiz-engine.js          # 全資格共通エンジン
├─ quiz.css                # 共通スタイル
├─ changelog.js            # アップデート履歴（LP・全資格で共有・唯一の出典）
├─ figures.js              # 図解データ（全資格共有・インライン SVG）
├─ firebase-config.js      # Firebase 設定（任意・ログイン/同期用）
├─ cloud-sync.js           # クラウド同期＋アクセス承認＋管理者ビュー（Auth + Firestore）
├─ progression.js          # 資格のロック解除（直列進行）— LP・全資格ページ共通の判定
├─ firestore.rules         # Firestore セキュリティルール（唯一の出典・コンソールへ貼る）
├─ manifest.webmanifest    # PWA マニフェスト
├─ sw.js                   # Service Worker（オフライン対応）
├─ tools/                  # 開発ツール（データ検証・エンジンテスト・版数繰り上げ等）
├─ icons/                  # アプリアイコン
├─ SECURITY.md             # セキュリティポリシー
└─ certifications/
   ├─ sf-admin/
   │   ├─ index.html       # CERT_CONFIG を差し替えただけのシェル
   │   └─ data/
   │       ├─ questions.json   # 問題（id・選択肢・正解・解説・出典・分野・source=tyson/gen）
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

## 🚀 新しい資格を追加する（3 ステップ）

エンジン・CSS・同期コードには一切触れません。

1. `certifications/<slug>/data/` に 4 つの JSON（`questions` / `domains` / `vocab` / `navmap`）を置く
2. 既存のシェル `index.html` を複製し、先頭の `window.CERT_CONFIG`（`slug` / `certName` / `examCode` / `examN` / `examMin` / `pass` / `storageKey` / `dataDir`）を差し替える
3. ルート `index.html` の `CERTS[]` 配列に 1 件追加する → トップに資格カードが自動生成される

---

## 🧪 開発ツールと CI

依存パッケージなし・`node` 単体で動くスクリプトを `tools/` に置いています。
`.github/workflows/ci.yml` が push / PR ごとに前半 3 つを自動実行します。

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
- **データ**: 資格ごとの JSON を実行時 `fetch`
- **PWA**: `manifest.webmanifest` + Service Worker（オフライン動作・ホーム画面追加）
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
- `access` を `approved` にできるのは **管理者だけ**（Firestore ルールで本人は自分を承認できないよう制限）。本人が書けるフィールドはホワイトリスト方式で限定され、doc の削除も管理者だけです。ルールの実体は root の `firestore.rules`（貼り方は `certifications/sf-admin/Firebaseセットアップ手順.md` のステップ 5）。

> ⚠️ 問題データ（`questions.json`）は静的公開ファイルのため、この承認制は**体験・UI レベルのアクセス制限**です（URL 直アクセスでのファイル取得までは防ぎません）。

---

## 🔒 セキュリティ

- `firebase-config.js` の API キーは **Firebase Web 用＝公開前提**の値で、秘密ではありません（GitHub のシークレット警告は false positive）。
- 実際のアクセス制御は **Firestore セキュリティルール**で行います（`progress/{uid}` は本人＋管理者のみ read/write、`access` フラグは管理者のみ書き込み可）。
- API キーには **HTTP リファラー制限**を設定済みです。

詳細・脆弱性の報告方法は [SECURITY.md](SECURITY.md) を参照してください。

---

## 📱 PWA

スマホのブラウザで開いて「ホーム画面に追加」すると、ネイティブアプリのように起動でき、オフラインでも学習を続けられます。

---

<div align="center">

**Salesforce, ADM-201 は Salesforce, Inc. の商標です。本アプリは学習目的の非公式プロジェクトです。**

</div>
