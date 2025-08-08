# wsbedrock-backend

Minecraft Bedrock Edition 用 WebSocket サーバーバックエンドです。  
`socket-be` を利用し、コマンドやモジュールの自動ロード、チャットコマンド連携、双方向通信などを提供します。

## 🎯 新機能: Mutual Protocol

クライアントとBackend間で双方向通信を実現するMutual Protocolが追加されました。
MinecraftのスコアボードシステムをJSONデータベースとして活用し、リアルタイム通信を可能にします。

### 主な機能
- 📡 チャンネルベースの通信
- 🔄 リクエスト/レスポンス型通信
- 📢 リアルタイム通知
- 💬 チャット通信
- 📁 データ同期

### 管理コマンド
```
/mutual channels                    - チャンネル一覧
/mutual create <名前> [説明]       - チャンネル作成
/mutual send <チャンネル> <内容>   - メッセージ送信
/mutual history                     - 履歴表示
/mutual stats                       - 統計情報
/mutual test [チャンネル]          - テスト送信
/mutual cleanup                     - データ削除
/mutual help                        - ヘルプ表示
```

詳細は [Mutual Protocol 仕様書](./docs/MutualProtocol.md) を参照してください。

## セットアップ

1. 依存パッケージをインストール
   ```
   npm install
   ```

2. サーバーを起動
   ```
   npm start
   ```

## 構成

- `index.ts` ... サーバー起動エントリポイント
- `Loader.ts` ... コマンド・モジュール自動ロード
- `Module/Command/` ... コマンド登録・ハンドラ
- `command/` ... コマンド実装（`about`, `help`, `status` など）

## コマンド例

- `!help` ... 利用可能なコマンド一覧を表示
- `!about` ... サーバー情報を表示
- `!status` ... サーバー状態を表示

## 設定

`settings.ts` でサーバーポート等を設定できます。

## ライセンス

MIT
