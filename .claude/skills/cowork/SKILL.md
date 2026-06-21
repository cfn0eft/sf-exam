---
name: cowork
description: >-
  sf-exam（Salesforce 学習クイズサイト）で共同作業するときの作業手順をまとめたスキル。
  次のいずれかをやるときに使う —
  (1) 変更をリリース／反映する（validate → bump-version → changelog 追記 → 日本語1行コミット → push → draft PR）。
  データ・エンジン・CSS・同期・図解・お知らせなど「配信物を変えた」ら必ずこの手順を通す。
  (2) 新しい Salesforce 資格を追加する（data/*.json・シェル複製・CERT_CONFIG 差し替え・LP の CERTS 追記）。
  (3) クイズ問題を作成・追加する（公式ソース第一・distractor 品質・選択肢の文長そろえ・questions.json のスキーマ）。
  「リリースして」「反映して」「資格を追加」「問題を作って／追加して」などで起動する。
---

# cowork — sf-exam 共同作業スキル

このリポジトリ（`sf-exam` / SFadmin）で作業するときの**定型手順**を1つにまとめたもの。
プロジェクト全体の方針は常に `CLAUDE.md` が一次情報。本スキルは「実際に手を動かす順番」を即実行できる形にしたチェックリスト。

作業は大きく3種類。**どれをやっても最後は必ず §A のリリース手順を通す**（これが共通の背骨）。

| やること | 参照 |
|---|---|
| A. 変更を反映・リリースする（全変更の共通仕上げ） | このファイル §A |
| B. 新しい資格を追加する | `references/new-cert.md` |
| C. クイズ問題を作成・追加する | `references/authoring.md` |

> コマンドはすべて**リポジトリルート**（`sf-exam/`）で実行する。`tools/` の Node スクリプトは依存パッケージ無しで `node` 単体で動く。

---

## §A. リリース手順（すべての変更の共通仕上げ）

「配信物（ユーザーのブラウザに届くファイル）」を変えたら、コミット前に必ず下を上から順に通す。

### 1. 編集したファイルに応じて検証を実行

| 編集したもの | 実行するコマンド |
|---|---|
| `certifications/*/data/*.json`・`figures.js`（データ／図） | `node tools/validate-data.js` |
| `quiz-engine.js`（エンジン） | `node tools/test-engine.js` ＋ `node tools/validate-data.js` |
| `cloud-sync.js`（同期） | `node tools/test-cloud-sync.js` |

`validate-data.js` はスキーマ・`fig`/`expFig` の実在・`case`⇔`scenario` 対応・**キャッシュ版数3点セットの整合**・主要 JS の構文・changelog 形式までまとめて検証する。**exit 1 が出たら必ず潰してから次へ**。

### 2. キャッシュ版数を繰り上げる（配信アセットを変えた場合のみ）

対象アセット＝ `quiz-engine.js` / `quiz.css` / `cloud-sync.js` / `changelog.js` / `figures.js` のどれかを変えたら：

```bash
node tools/bump-version.js        # 3点セット（sw.js CACHE / SHELL の ?v= / 各HTMLの ?v=）を一括 +1
node tools/bump-version.js --dry  # 変更内容の確認だけしたいとき
```

- 手作業での版数更新は**廃止**（漏れ事故のため）。必ずこのツールで。
- 版数を上げないと SW が stale-while-revalidate で旧 JS/CSS を掴み続ける。
- 学習データ JSON のみの変更は SW のプリキャッシュ（stale-while-revalidate）で2回目読込から自動反映されるので、**即時反映したいときだけ** bump する。

### 3. お知らせ（changelog）を追記する（ユーザーが気づく変更なら必須）

新機能・UI/挙動の変更・体感できる改善や不具合修正を入れたら、**同じコミットに** お知らせも入れる。

- `changelog.js` の `window.SFQ_CHANGELOG` の**先頭**に1件追加：
  `{id:'YYYY-MM-DD', date:'YYYY-MM-DD', title:'短い見出し', items:['絵文字 …','…']}`
- `id` は一意。同日に複数出すなら末尾に `a`/`b`…。`date` は実施日の絶対日付（相対表現禁止）。
- **同日に既存エントリがあれば新規追加せず、その先頭エントリの `items` に箇条書きを足す**（1日1リリースにまとめる。`title` は内容に合わせて更新可）。
- 文言は利用者目線でやさしく（実装名でなく「何ができるか」）。先頭に絵文字・1項目1行。
- changelog.js を変えた＝アセット変更なので、**§A-2 の bump も必ず実行**。
- 対象外（載せない）：ドキュメントのみ・内部リファクタ・利用者に見えないデータ修正。

### 4. コミット & プッシュ & PR

```bash
git add -A          # または変更ファイルを個別指定
git commit -m "<日本語1行>"
git push -u origin <作業ブランチ>
```

- コミット件名は**日本語・1行**（80〜120字目安）。良い例：`sf-admin: +120問追加 268→388問（シナリオ76%、公式比±0.6pt以内）`
- **複数行・ヒアドキュメント・`\n` を含む `-m` は使わない**（Git Bash の `>` プロンプト事故）。長文が必要なら `git commit -F message.txt`。
- リモート/web セッションでは件名の後ろにハーネスがフッター（Co-Authored-By など）を自動付与する。**件名の「日本語1行」ルールは守る**。
- push 後は **draft PR を作成**（このセッションでは GitHub MCP ツール `mcp__github__create_pull_request` を使う。`gh` CLI は使えない）。既に PR があれば作らない。
- push が**ネットワークエラー**で失敗したときだけ、2s→4s→8s→16s の指数バックオフで最大4回リトライ。

### 5. 仕上げの自己チェック（コミット前チェックリスト）

- [ ] 該当する検証（§A-1）がすべて green
- [ ] 配信アセットを変えたら bump 済み（版数混在なし＝validate が検知）
- [ ] ユーザー向け変更なら changelog 追記済み（＋bump）
- [ ] 機能変更とお知らせが**1コミット**にまとまっている
- [ ] コミット件名は日本語1行

---

## §B. 新しい資格を追加する

→ `references/new-cert.md` を読んで進める。要点だけ：**エンジン・CSS・同期は触らない**。`data/*.json` を置き、シェルを複製して `CERT_CONFIG` を差し替え、LP の `CERTS` に1件足し、`validate-data.js` で確認 → §A でリリース。

## §C. クイズ問題を作成・追加する

→ `references/authoring.md` を読んで進める。要点だけ：**公式ソース（Trailhead / help.salesforce.com）第一**、distractor は「ぱっと見区別がつかない」品質、**正解だけ突出して長くしない**、`questions.json` のスキーマを守る → `validate-data.js` → §A でリリース。

---

## 触ってはいけないもの / 注意

- **ロジックを直すのは `quiz-engine.js` の1ファイルだけ**。各資格の中身は `data/*.json` を編集する。資格を増やすときエンジン・CSS・同期は変えない。
- `changelog.js` は更新履歴の**唯一の出典**（LP・全資格で共有）。`figures.js` は図解の唯一の出典。
- Firebase の Web `apiKey` は公開前提（シークレットスキャン警告は false positive）。本当の防御は Firestore ルール。
- 検証時、ホストファイルの真の内容は Read/Grep/Glob を信頼する。
