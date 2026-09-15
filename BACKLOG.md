# BACKLOG — 安全に着手できるタスク（価値順）

> 各起動は最上位の未着手1件だけを実装する。完了したら行を消し `PROGRESS.md` に記録。
> 範囲は LOOP.md「安全な領域」のみ。**問題の正解・解説、ブループリント比率(domains.json weight)、認証/Firestore/storageKey は対象外**。

1. **compare.json の導入セクション「使い方」の分野バッジ**：experience-cloud（`share`）と sales-cloud（`strat`）の先頭「使い方」だけ、元データが分野名を持っていたため code 化の際に分野バッジが残った。他4資格（sf-admin/agentforce/service-cloud/sharing-visibility）は総称（全般/全体/全分野）だったのでバッジ無し。狙い：導入文に無関係な分野バッジが出る不整合の解消。完了条件：`domain` を落として8資格そろえる、validate-data 緑、比較表の表示崩れ無し。
2. **quiz-engine.js — 動的生成のアイコンのみボタンに aria-label**：エンジンが生成する絵文字だけのボタン（図解の拡大・凡例トグル・モーダルの✕など）を洗い出して `aria-label` を付ける。シェル側（HTML 直書き）は対応済み。狙い：静的UIと同じ読み上げ品質を動的UIにも。完了条件：主要な動的アイコンボタンに aria-label、test-engine 緑、表示崩れ無し。
3. **tools/validate-data.js — figures.js の未使用図を検出**：どの `fig`/`expFig`/`vocab.fig`/`lessons.slides[].fig` からも参照されていない図を警告する（エイリアスは参照済み扱い）。狙い：死んだ図解データの棚卸し。完了条件：未使用があれば警告、エラーにはしない、現状緑。
4. **tools/test-cloud-sync.js — 純粋関数テストの追加**：未カバーの判定（`idOf` の異常系・`mailParams` の種類網羅・`accessStateOf` の blocked＋req 組み合わせ等）に1〜2件足す。狙い：同期まわりのリファクタ安全網。完了条件：`node tools/test-cloud-sync.js` 緑・件数増。
5. **quiz.css — ダークモードのコントラスト点検**：ダーク時に `--text-sub` や淡色チップの文字が背景に対して WCAG AA(4.5:1) を割っていないか主要画面で確認し、割っている箇所だけトークンを微調整する。狙い：暗所での可読性。完了条件：主要テキストが AA 以上、ライトモードの見た目は不変。
6. **README.md — スクリーンショットの追加**：主要3画面（ホーム・学習・統計）の静止画を `docs/` に置いて README から参照する。狙い：初見の理解速度。完了条件：画像がリポジトリ内に存在しリンク切れなし。
7. **lessons 未整備5資格の「イチから授業」**：agentforce / sales-cloud / service-cloud / experience-cloud / sharing-visibility は `lessons.json` が 0本。※コンテンツ生成＝試験内容の正誤判断を伴うため、**ループでは着手せず人手（だいき）で行う**。ここには現状把握として残す。
