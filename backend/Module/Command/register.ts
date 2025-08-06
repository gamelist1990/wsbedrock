// wsコマンド登録用の親クラス

import { Player } from 'socket-be';

// コマンド情報の型
export interface CommandOptions {
  name: string;
  description?: string;
  parent?: boolean;
  maxArgs?: number;
  minArgs?: number;
  require?: number;
  executor: (ev: { player: Player; message: string; args: string[]; rawMessage: string }) => Promise<void> | void;
}

// コマンド登録管理クラス
export class WSCommandRegistry {
  public commands: CommandOptions[] = [];

  constructor() {
  }

  // 新しいAPI: オブジェクト形式でコマンド登録
  registerCommand(options: CommandOptions) {
    this.commands.push(options);
  }

  // 既存の継承型コマンドもサポートしたい場合はここに追加
}
