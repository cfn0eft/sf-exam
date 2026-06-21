# C. クイズ問題を作成・追加する手順

問題は `certifications/{slug}/data/questions.json` に追加する。**事実の裏取りと distractor 品質が命**。雑な選択肢は作らない。

## 1. 事実を固める（公式ソース第一）

- 事実主張は **Trailhead / help.salesforce.com を第一優先**。新規問題は必ず公式 URL を特定して `reference_url` に入れる。
- 二次ソース（tysonblog, Focus on Force, Quizlet 等）は裏取り材料としてのみ。
- 公式が見つからない論点は**問題化を見送る**か、不確実性を先に共有する。
- 最新仕様か確認（「過去はそうだったが今は違う」を distractor に回せる）。

## 2. questions.json のスキーマ

1問は次の形。配列要素として追加する（ファイルは `[...]` か `{questions:[...]}` 形式。既存に合わせる）。

```jsonc
{
  "id": 461,                       // 一意の整数（既存最大+1。重複は validate がエラー）
  "question": "…問題文…",          // シナリオ型が望ましい
  "choices": ["A","B","C","D"],    // 通常4択
  "answers": ["A"],                // choices の文字列と完全一致（部分一致・表記ゆれ不可）。multi は複数
  "multi": false,                  // 複数正解なら true（answers.length と整合）
  "domain": "logic",               // domains.json に実在する code
  "explanation": "…解説…",         // 解答後に全文表示（下記フォーマット）
  "reference_url": "https://help.salesforce.com/s/articleView?id=sf.…&type=5",
  "keywords": ["積み上げ集計","Apex"], // キーワード絞り込み用。全問に付ける
  "diff": 2,                       // 任意：難易度 1=易 2=標準 3=難
  "source": "gen",                 // 任意：出典フィルタ用（資格により "gen"/"tyson" 等）
  "fig": "図名",                   // 任意：問題文に出す図（figures.js に実在する名前）
  "expFig": "図名",                // 任意：解説に出す図（同上）
  "case": "uc-logic",             // 任意：ケーススタディの束ね key（scenario とペア必須）
  "scenario": "…共通シナリオ説明…"  // 任意：case と必ずペアで
}
```

検証ルール（`validate-data.js` が見る）：`id` 重複なし／`answers` が `choices` の範囲内／`multi` と `answers` の整合／`domain` 実在／`diff` は 1-3／`reference_url` 形式／`fig`・`expFig` が `figures.js` に実在／`case`⇔`scenario` の対応／選択肢の文長バランス（後述）。

## 3. 解説（explanation）のフォーマット

既存に倣い、各選択肢を `□` で1つずつ「正解／不正解」と理由を述べる。例：

```
それぞれの選択肢の理由について説明します。

□ ワークフロールール　これは不正解です。…理由…
□ 積み上げ集計項目　これは不正解です。…理由…
□ Apexコード　これは正解です。…理由…

補足：…境界・最新仕様の注意…
```

## 4. distractor（不正解選択肢）の品質

「ぱっと見、正解と区別がつかない」レベルで作る。

- **NG**：「両者は機能的に同じ」「システムエラーになる」のような無意味な選択肢／「Apex 以外に方法はない」のような極端な断定／常識で否定できる馬鹿げた選択肢。
- **OK**：公式に実在する別概念をぶつける／過去はそうだったが今は違う情報／隣接機能で正しいことを誤って当てはめる／境界値の微妙なズレ。
- **正解だけ突出して長く・詳しくしない。** 全選択肢を同程度の文長にそろえる（`validate-data.js` は「正解が不正解の1.8倍超かつ40字超」を警告する）。
- 多答問題（`multi:true`）は **4段階の弁別**を作る：明らかな正解・微妙な正解・ありそうな誤り・明らかな誤り。

## 5. 検証 → リリース

```bash
node tools/validate-data.js   # exit 1 と警告（文長バランス等）を潰す
node tools/check-links.js     # 任意：reference_url の死活チェック（404/410 はエラー、help の 403 は警告）
```

- 問題追加はユーザー向けコンテンツ。`changelog.js` に追記（例「⚡ デベロッパー試験に練習問題を◯問追加しました」）→ `node tools/bump-version.js` → 1コミットで push → draft PR（= SKILL.md §A）。
- データ JSON のみの変更はプリキャッシュの stale-while-revalidate で2回目読込から反映されるが、お知らせを出す＝changelog（アセット）も変える＝**bump は必要**。
- LP `index.html` の `CERTS` の `meta`（問数・用語数）も実数に合わせて更新する。

## チェックリスト

- [ ] 各問に公式 `reference_url`（help.salesforce.com / Trailhead）
- [ ] `answers` が `choices` と完全一致・`multi` と整合
- [ ] `domain` が domains.json に実在・`keywords` あり
- [ ] distractor が実在概念ベースで弁別可能・正解だけ長くない
- [ ] 解説は □ ごとに理由
- [ ] `validate-data.js` green（文長バランス警告も対応）
- [ ] changelog 追記＋bump＋CERTS の meta 更新（公開数が変わるとき）
