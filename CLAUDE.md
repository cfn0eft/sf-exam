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
├── index.html            # LP (gateway)。資格カードは末尾の CERTS 配列から自動生成
├── quiz-engine.js        # 全資格共通の単一エンジン（約1230行）
├── quiz.css              # 全資格共通
├── firebase-config.js    # ユーザー編集する唯一の Firebase 設定
├── cloud-sync.js         # ログイン/同期ロジック（編集不要）
├── manifest.webmanifest  # PWA
├── sw.js                 # Service Worker（更新時は CACHE 文字列を上げる。現在 v8）
└── certifications/
    └── {slug}/
        ├── index.html    # 薄いシェル（共通DOM雛形＋CERT_CONFIG＋engine読込）
        └── data/
            ├── questions.json   # 各問 domain・multi 内蔵に正規化
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
- Firestore は `progress/{uid}` に保存。doc 構造は `{ stores: { '<slug>': store, ... }, name, email, updated }`（資格別名前空間。複数資格が同じ uid を共有しても上書きされない）
- 保存は `doc.update(new FieldPath('stores',CERT_KEY), st, ...)` で当該資格のサブストアを丸ごと置換（deep-merge 回避）
- 保存は 0.8秒デバウンス。`save()` が `window.__cloudSave()` をフック

### ページ役割 (SFQ_PAGE_ROLE)

- `gateway` = ルート LP：ログイン必須のゲートウェイ。進捗 doc は読み書きしない。`window.SFQ_PAGE_ROLE='gateway'`
- `client` = 各クイズページ：進捗を同期。ログイン強制しない。未ログイン時はホームへ誘導。`window.SFQ_HOME_URL='../../index.html'`
- 明示指定が無ければ `__setStore` の有無で自動判定

### 管理者ビュー

- 管理者ID = `admin` (`SFQ_ADMIN_IDS=["admin"]`)
- 全アカウント一覧・リセット・削除・CSV書き出し可
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
  hist: {id:{c,w,last}},   // 解答履歴 (last='c'|'w' = 直近の正誤)
  streak, vm, tbm,
  srs: {id:{ivl,ease,reps,due}},  // SM-2 簡易版
  daily: {'YYYY-MM-DD': 解答数},
  notes: {id: text},
  examDate, goal,
  exams: [],        // 模試履歴（最新50件）
  badges: {id: date}
}
```

新フィールドを足すときは `loadStore` 既定・`__setStore` 正規化・`resetAll` の3箇所すべてに追加すること。

---

## デプロイ

ローカルで Write/Edit した変更は、ユーザーが PC の Git Bash から push しないと公開されない。

```bash
cd /c/Users/Nerod/ドキュメント/sf-exam
git add <変更ファイル>     # または git add -A
git commit -m "<日本語1行>"
git push origin main
```

- 認証は **cfn0eft** アカウント。過去に `mashi-18` の古い認証がキャッシュされて 403 になった事故あり。詰まったら `printf "protocol=https\nhost=github.com\n\n" | git credential reject` でリセット
- **編集したら頼まれなくても commit/push コマンドを毎回出す**

### キャッシュ無効化（重要）

- `quiz-engine.js` / `quiz.css` / `cloud-sync.js` を更新したら **3点セットでバージョンを上げる**:
  1. `sw.js` の `CACHE` 文字列（例 `sf-exam-v5` → `v6`）
  2. 両シェル（`certifications/*/index.html`）のアセット参照の `?v=5` → `?v=6`
  3. `sw.js` の `SHELL` 配列内の `?v=5` → `?v=6`
- 理由: SW は stale-while-revalidate でキャッシュ優先のため、版数を上げないとブラウザが旧 JS/CSS を掴み続ける（実際にこの事故を確認済み）。`?v=` クエリで URL を変えることで確実に新版を取得させる。

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

## 残タスク（2026-05-30 時点）

- アクティブな残タスクなし。
- （バックログ）3資格目（Developer 等）の立ち上げ ＝「4JSON＋シェル複製＋LP CERTS に1行追加」だけ。着手は別途相談。

### 完了済み（2026-05-30）

- App Builder 用語集（5章83語）/ 設定マップ（10件）を精査し公式（help.salesforce.com）と照合。事実誤りなし（外部ID上限7・主従関係2 など数値も公式一致）。各用語に公式リファレンスURL付与済み。
- App Builder `_verify` 13問（id 3,8,11,36,38,69,90,114,129,141,150,152,183）を現行仕様へ補正し `_verify` を全除去。旧機能（ワークフロールール/プロセスビルダー）が正解だった設問はレコードトリガーフロー/Apexトリガーに作り直し、Twitter連携依存の id152 はモバイルのフォームファクタによるコンポーネント表示制御の設問に差し替え。445問・整合性維持。

---

## 関連ドキュメント

- `Firebaseセットアップ手順.md` — 初期設定（プロジェクト作成・キー貼り付け・Firestore ルール）
- `SECURITY.md` — Firebase apiKey 公開の方針
