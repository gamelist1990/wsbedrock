
// サーバー設定用のインターフェース
export interface ServerSettings {
  port: number;
}

// デフォルト設定
export const settings: ServerSettings = {
  port: 3000,
};
