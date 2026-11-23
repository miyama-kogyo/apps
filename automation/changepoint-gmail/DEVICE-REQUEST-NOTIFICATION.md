# 端末アクセス申請メール

2026-11-23 18:31:36 JSTに会社用Gmailの既存Apps Scriptプロジェクトへ
`DeviceRequestNotification.gs`を追加し、`enableDeviceRequestNotifications`を実行済み。
既存のコード・宛先・通知開始日時・トリガーは変更していない。

- 送信元: miyama.firebase@gmail.com
- 宛先（To）: ktakada@miyama-unitec.co.jp, ktachino@miyama-unitec.co.jp, mii@miyama-unitec.co.jp
- 対象: 開始日時以降のFirestore `deviceRequests`。送信直前も `pending` の申請のみ。
- 頻度: `pollDeviceRequestNotifications`の専用5分間隔トリガー。即時送信ではない。
- 内容: 申請者名、申請メールアドレス、端末名、端末ID、申請日時、管理コンソールリンク。
- ワークフロー提出完了とは連携していない。メールでも別途確認するよう案内する。
- 実行ユーザーを確認し、既存のFirestore読取・MailApp・トリガー権限を利用。
- 申請ID単位で送信を記録し、ScriptLockで既存メール処理とも排他。
- メール送信直前にsending、成功後にsent。sending/uncertainは自動再送しない。
- 通知対象の取得失敗や全3名分の送信枠不足では送らず、次回に再試行。
- 過去の申請・承認済み・削除済みは送らない。端末を自動承認しない。

設定キーは `DEVICE_NOTICE_*`。開始日時とカーソル、送信履歴を削除しない。
停止は `disableDeviceRequestNotifications`。状態確認は
`showDeviceRequestNotificationStatus`。有効化の再実行は開始日時を維持し、
トリガーが存在するときは追加しない。

送信結果不明時はGmail送信済みと対象申請を照合する。
未送信と確認でき、再送の了承を得た場合のみ該当ジョブをpendingへ戻す。
送信済み・対象外ジョブはカーソル通過を確認して7日後に削除する。
ジョブ上限200件で新規取得を停止するため、保留増加時はエラーを確認する。
件数が多い場合や残枠不足の場合、通常の5分より遅れることがある。

## 検証

`node automation/changepoint-gmail/test-device-request.cjs`

実メールはモックで検証。宛先、重複、対象外、削除、枠不足、取得失敗、
送信結果不明、トリガー重複防止を確認済み。
クラウドの保存内容一致、有効化、Firestoreクエリ成功、トリガー1件、
lastErrorなしを確認済み。初回処理は新規申請0件のため0通。
3名の受信箱への到着は未確認であり、テストメール・過去申請の再送はしていない。
