# wsbedrock-backend

Minecraft Bedrock Edition 用 WebSocket サーバーバックエンドです。  
`socket-be` を利用し、コマンドやモジュールの自動ロード、チャットコマンド連携などを提供します。

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
