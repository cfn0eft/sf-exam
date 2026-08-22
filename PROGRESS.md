# PROGRESS — 自律改善ループ 実行ログ

> 1サイクルにつき1行追記する（書式: `YYYY-MM-DD HH:MM | <type> | やったこと | 検証結果`）。新しい記録を上に積む。

## ログ

2026-08-22 | fix/docs/security | （人手セッション・ループ外）REVIEW_NEEDED の高リスク2件＋ドキュメント差分を一括対応。①Firestore ルールを root `firestore.rules` としてリポジトリ管理化＝本人書込を selfKeys() ホワイトリスト化（maintOk/approvedAt/notices/fbReplies/adminLog を管理者専用）・doc 削除を管理者のみ（blocked の自己帳消しを封鎖）・管理者判定に adminUids() を追加。手順書ステップ5は貼り方だけに刷新 ②`pickWeightedExam` を最大剰余法＋在庫不足分のウェイト比再配分に変更（examQuota を純粋関数として切り出し。合計が必ず examN・末尾分野の系統的切り捨てを解消） ③validate-data に模試ブループリント再現性の検査を追加（service-cloud 3問不足・sharing-visibility 7問不足＋出題プール74%を可視化。sales-cloud は増問で解消済みと再測定で確認） ④CLAUDE.md のローカルパスを PC_User に訂正・progression.js の節を新設・maintOk の「ルール変更不要」記述を訂正・README の総問題数バッジ 2052→2051 とツリー/ツール表を同期 | validate-data 緑（エラー0・警告12＝うち3件は今回追加した可視化）/ engine 30 緑（+4）/ cloud-sync 24 緑 / 実データで新旧の分野分布を比較（sharing-visibility 最大乖離 9.3→8.7pt・残差は在庫不足に起因）

2026-08-22 | feat/fix | BACKLOG 1〜9 を一括消化＋比較表の分野バッジ不具合を修正。①compare.json の `domain` を表示名から分野コードへ正規化（6資格75件。従来は domainDef が先頭分野へフォールバックし全セクションが同じ誤バッジ）＋renderCompare を厳密解決に ②アイコンのみボタン11種に aria-label（全8シェル）＋ダーク/ブックマークに aria-pressed（`setBmBtn` へ集約） ③折りたたみ見出し `.ch-head` を role=button/tabindex/aria-expanded 化し Enter・Space で開閉（`bindChHead`） ④:focus-visible の補強（outline:none の入力欄4種・濃色背景のボタン4種・見出し） ⑤manifest に id/categories＋Developer のショートカット2件 ⑥validate-data に SHELL 実在検査・manifest 検査・LP CERTS meta ↔ データ実数/CERT_CONFIG 照合・vocab/navmap/cram/compare の形式検査を追加 ⑦test-engine に5件追加＋DOMスタブを属性/クラス/イベント保持型に強化 ⑧README/CLAUDE.md を実数（experience-cloud 131問・全2,051問）と授業整備状況・開発ツール一覧に同期 | validate-data 緑（警告9・意図的に壊して exit 1 も確認）/ engine 26 緑 / cloud-sync 24 緑 / Chromium 実機スモーク: 比較表バッジが資格ごとに正しく分散・Enter/Space で開閉・aria-pressed 反転・LP 9カード描画

<!-- ここに追記していく。例:
2026-06-24 12:00 | chore | ループ用ファイル(LOOP/PROGRESS/REVIEW_NEEDED/BACKLOG)を整備 | validate-data 緑 / engine 19 緑 / cloud-sync 7 緑
-->
2026-07-30 00:00 | feat | 準備中5資格(agentforce/sales-cloud/service-cloud/experience-cloud/sharing-visibility)を RELEASED 入り＝一般公開。sw.js の SHELL に5資格のシェル＋データを追加、LP meta description を公開8資格に更新(BACKLOG #6 消化)、changelog 追記＋版数 v124/?v=122 | validate-data 緑 / engine 19 緑 / cloud-sync 7 緑 / stateOf・canChoose を4シナリオで手動検証
