# B. 新しい資格を追加する手順

**前提：エンジン（`quiz-engine.js`）・CSS（`quiz.css`）・同期（`cloud-sync.js`）は触らない。** 全資格が共通の1エンジンを共有している。資格ごとに違うのは `data/*.json` と薄いシェル `index.html` の `CERT_CONFIG` だけ。

## 手順

### 1. データを置く

`certifications/{slug}/data/` に JSON を置く。

| ファイル | 要否 | 中身 |
|---|---|---|
| `questions.json` | 必須 | 各問 `domain`・`multi` 内蔵に正規化（→ `authoring.md`） |
| `domains.json` | 必須 | `{domains:[{code,name,weight,emoji}], map?}`。weight 合計は 100 |
| `vocab.json` | 必須 | 章配列 `{chapter,terms:[{title,jaName,enName,definition,examPoints[],questions[]}]}` |
| `navmap.json` | 必須 | `[{title,content}]` 設定マップ |
| `cram.json` | 任意 | `[{title,content}]` 直前対策（教科書タブ） |
| `compare.json` | 任意 | `[{title,domain,content}]` 比較表（教科書タブ） |
| `lessons.json` | 任意 | `[{title,…}]` 授業（スライド学習）。無い資格は空配列 `[]`（ホーム導線も自動で非表示） |

任意ファイルも、空でも置くなら正しい形（`[]`）にしておく。

### 2. シェルを複製して CERT_CONFIG を差し替える

既存シェル（例 `certifications/app-builder/index.html`）を `certifications/{slug}/index.html` に複製し、末尾の `window.CERT_CONFIG` だけ差し替える：

```js
window.CERT_CONFIG = {
  "slug": "{slug}",
  "certName": "Salesforce 認定 …（正式名）",
  "shortName": "…",          // 短縮名
  "examCode": "…",
  "examN": 60,                // 本番出題数
  "examMin": 105,            // 制限時間（分）
  "pass": 63,                 // 合格ライン（%）
  "storageKey": "sfq…_v1",   // 資格固有・他資格と重複させない（localStorage / Firestore 名前空間）
  "dataDir": "data/"
};
window.SFQ_PAGE_ROLE = 'client';        // ← 据え置き
window.SFQ_HOME_URL  = '../../index.html'; // ← 据え置き
```

- `storageKey` は資格ごとに一意（Firestore は `stores['<slug>']` 名前空間なので uid 共有でも上書きされない）。
- **既存シェルを複製する**こと。シェル内の `?v=NN`（quiz-engine.js / quiz.css / changelog.js / figures.js / cloud-sync.js / maintenance.js）は**現在のバージョンに揃っている必要がある**（複製元が最新なら自動で揃う）。版数混在は `validate-data.js` が検知する。
- スクリプト読込順は変えない：`CERT_CONFIG` → `changelog.js` → `figures.js` → `quiz-engine.js` → `cloud-sync.js`。

### 3. ルート LP の CERTS に1件追加

`index.html`（ルート）末尾の `CERTS` 配列に追加する：

```js
{ slug:'{slug}', storageKey:'sfq…_v1', icon:'🤖', title:'Salesforce 認定<br>…',
  desc:'…（1〜2文）', meta:['NN問','MM用語','合格PP%'] },
```

- `meta` は `[問数, 用語数, 合格%]`。`data/*.json` の実数と**手動で同期**する（自動計算ではない）。
- **CERTS に載せる＝LP 公開**。問題が 0 問など未完成のうちは CERTS に載せない（骨組みだけ置いて非掲載でよい）。

### 4. 検証 → リリース

```bash
node tools/validate-data.js   # スキーマ・参照・版数整合を一括確認（exit 1 を潰す）
```

- 公開（CERTS 掲載）は**ユーザー向け変更**なので、`changelog.js` に追記 → `node tools/bump-version.js` → 1コミットで push → draft PR（= SKILL.md §A）。
- 新しいシェル HTML が増えても `bump-version.js` は `certifications/*` を走査して自動で対象に含める。

## チェックリスト

- [ ] `data/` に必須4本（＋任意は空配列でも形を整える）
- [ ] シェル複製＆`CERT_CONFIG` 差し替え（`SFQ_PAGE_ROLE`/`SFQ_HOME_URL` は据え置き）
- [ ] `storageKey` が他資格と重複していない
- [ ] LP の `CERTS` に1件（`meta` は実数と一致）／未完成なら未掲載
- [ ] `validate-data.js` が green
- [ ] エンジン・CSS・同期は無変更
