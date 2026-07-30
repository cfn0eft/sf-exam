# BACKLOG — 安全に着手できるタスク（価値順）

> 各起動は最上位の未着手1件だけを実装する。完了したら行を消し `PROGRESS.md` に記録。
> 範囲は LOOP.md「安全な領域」のみ。**問題の正解・解説、ブループリント比率(domains.json weight)、認証/Firestore/storageKey は対象外**。

1. **tools/validate-data.js — SW SHELL プリキャッシュの実在検証**：sw.js の `SHELL[]` 各パス（`?v=` 除去後）がディスクに実在するか検査。狙い：`install` の `allSettled` が握り潰す precache 失敗（タイプミス/欠落で初回オフライン破綻）を CI で検知。完了条件：欠落時に exit 1、現状で `node tools/validate-data.js` 緑。
2. **certifications/*/index.html ＋ index.html — アイコンのみボタンに aria-label 付与**：絵文字＋`title` だけのトップバー等ボタン（🗂️/❓/🔔/👤/🌙/⚙️/🤔/🚩 等）に `aria-label` を追加。狙い：スクリーンリーダー対応（emoji 読み上げ回避）。完了条件：主要アイコンボタンに aria-label、validate-data 緑、表示崩れ無し。
3. **manifest.webmanifest — PWA メタ拡充（id / categories）**：`id`（=`start_url`）と `categories:["education"]` を追加。狙い：インストール時の同一性とストア分類の適正化。完了条件：有効 JSON のまま追加、validate-data 緑。
4. **manifest.webmanifest — Developer のショートカット追加**：公開済み Developer 資格にデイリー/模試ショートカット（Admin/AB と同形式・`?go=daily|exam`）を追加。狙い：公開資格間の機能パリティ。完了条件：URL が実在 cert を指す、有効 JSON、validate-data 緑。
5. **tools/validate-data.js — manifest.webmanifest 検証チェック追加**：有効 JSON＋必須キー（name/start_url/icons）＋`shortcuts[].url` が実在 cert を指す＋`icons[].src` がファイル実在、を検査。狙い：tools カバレッジ拡張で後続が安全に。完了条件：壊れた manifest で exit 1、現状緑。
6. **quiz.css — :focus-visible のキーボードフォーカス可視性を点検・補強**：可視フォーカスが出ない対話要素（カスタムボタン/チップ/タブ等）があれば既存 global ルールを壊さず補う。狙い：キーボード操作の到達性。完了条件：主要ボタン/リンク/入力でフォーカス可視、視覚回帰無し、validate-data 緑。
7. **tools/test-engine.js — 純粋関数テスト追加でカバレッジ向上**：未カバーの純粋ロジック（例 `levelInfo` の境界・`paceReco` の端数・store 正規化の追加ケース）に1〜2件テストを足す。狙い：リファクタ安全網の強化。完了条件：`node tools/test-engine.js` 緑・件数増。
8. **tools/validate-data.js — vocab/navmap/cram/compare の形式検査強化**：章タイトル重複・用語 title 重複・空配列・想定外キーなど「形式」の穴を追加検査（正解・本文は不変）。狙い：データ形式の堅牢化。完了条件：異常データで exit 1、現状緑。
9. **README.md / CLAUDE.md — lessons 未整備資格の現状を追記**：lessons 0本の資格（agentforce/sales-cloud/service-cloud/experience-cloud/sharing-visibility）を一覧化しドキュメント整合（授業コンテンツ自体は生成しない）。完了条件：ドキュメント更新のみ、リンク/構文 OK。
