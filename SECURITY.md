# セキュリティポリシー / Security Policy

このリポジトリ（`cfn0eft/sf-exam`）は、Salesforce 認定資格の学習用クイズサイトです。
GitHub Pages で配信される**静的サイト**で、ログインと学習進捗の保存にのみ Firebase
（Authentication / Cloud Firestore）を利用しています。サーバーサイドの独自バックエンドはありません。

公開先: <https://cfn0eft.github.io/sf-exam/>

---

## サポート対象バージョン / Supported Versions

継続的にデプロイされる静的サイトのため、サポート対象は **`main` ブランチからデプロイされた最新版のみ**です。
過去のコミットやフォークは保守対象外です。

| バージョン | サポート |
| --- | --- |
| 本番（`main` / GitHub Pages の最新デプロイ） | ✅ |
| それ以前のコミット・フォーク | ❌ |

---

## 脆弱性の報告 / Reporting a Vulnerability

セキュリティ上の問題を見つけた場合は、**公開の Issue や Pull Request には書かず**、
以下のいずれかの非公開チャネルで報告してください（責任ある開示にご協力ください）。

1. **推奨: GitHub の非公開脆弱性報告**
   リポジトリの **Security → Report a vulnerability**（Private vulnerability reporting）から報告してください。
   ※ この機能はリポジトリの Settings → Code security で有効化できます。
2. **メール:** `<セキュリティ連絡先メールアドレスをここに記入>`

### 報告に含めてほしい情報
- 影響を受ける箇所（URL／ファイル／コミット）
- 脆弱性の種類と想定される影響
- 再現手順、可能であれば PoC（概念実証）
- 推奨される修正案（あれば）

### 対応の目安（ベストエフォート）
本プロジェクトは個人による学習用プロジェクトのため、対応はベストエフォートとなります。

| 段階 | 目安 |
| --- | --- |
| 一次返信（受領確認） | 7 日以内 |
| 影響評価・対応方針の共有 | 30 日以内 |
| 修正の本番反映 | 重大度に応じて随時 |

報告者の同意のもと、修正後に謝辞（クレジット）を記載することがあります。

---

## 対象範囲 / Scope

**対象内（In scope）**
- 本リポジトリのコード（HTML / CSS / JavaScript / JSON / Service Worker など）
- デプロイ先 <https://cfn0eft.github.io/sf-exam/> の挙動に起因する問題
- Firestore セキュリティルールの不備による、他ユーザーの学習データへの不正アクセス等

**対象外（Out of scope）**
- GitHub Pages・Firebase / Google など第三者プラットフォーム自体の脆弱性
（各社のセキュリティ窓口へご報告ください）
- 物理アクセス・ソーシャルエンジニアリング・大量アクセス（DoS）を前提とする攻撃
- セキュリティ上の影響を伴わない軽微な表示崩れ等（通常の Issue でお願いします）

---

## このプロジェクトのセキュリティ上の前提 / Security Notes

- **静的なクライアントサイドのみ**で動作し、独自のサーバー処理はありません。
- `firebase-config.js` に含まれる Firebase Web API キーは、**クライアントに公開される設計**であり
秘密情報ではありません（[Firebase 公式ドキュメント](https://firebase.google.com/docs/projects/api-keys)参照）。
実際のアクセス制御は **Firestore セキュリティルール**で行います。したがって、この API キーが
リポジトリ／配信ファイルに含まれていること自体は脆弱性ではありません。
- ユーザー認証と学習進捗は Firebase Authentication / Cloud Firestore に保存されます。
本サイトは**学習進捗以外の機微な個人情報を収集・保存しない**方針です。
- 学習進捗はブラウザの `localStorage` にも保存されます（端末ローカル）。

---

最終更新: 2026-05-26
