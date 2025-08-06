import { PlayerChatSignal, Server, ServerEvent } from 'socket-be';
import { WSCommandRegistry } from './register.js';

// チャットコマンドハンドラ
export class PlayerChatHandler {
  private server: Server;
  private registry: WSCommandRegistry;

  constructor(server: Server, registry: WSCommandRegistry) {
    this.server = server;
    this.registry = registry;
    this.server.on(ServerEvent.PlayerChat, this.handleChat.bind(this));
  }

  private async handleChat(ev: PlayerChatSignal) {
    const { sender, message } = ev;
    console.log(`📢 [Chat] ${sender.name}: ${message}`);
    if (sender.name === 'External') return;
    if (sender.name === '外部') return;
    if (!message.startsWith('!')) return;

    

    const rawMessage = message;
    // コマンドと引数を分割
    const [cmd, ...args] = message.slice(1).split(' ');
    // コマンド実行
    for (const command of this.registry.commands) {
      if (command.name === cmd) {
        // 権限チェック
        if (typeof command.require === 'number') {
          if (command.require === 4 && sender.isLocalPlayer !== true) {
            if (typeof sender.sendMessage === 'function') {
              sender.sendMessage('§cこのコマンドを実行する権限がありません');
            }
          }
          if (command.require === 0) {
            // 誰でもOK
          }
          // 今後他の権限レベルを拡張したい場合はここに追加
        }
        // 引数数チェック
        if (typeof command.minArgs === 'number' && args.length < command.minArgs) return;
        if (typeof command.maxArgs === 'number' && args.length > command.maxArgs) return;
        // executor呼び出し
        await command.executor({
          player: sender,
          message: args.join(' '),
          args,
          rawMessage,
        });
        break;
      }
    }
  }
}
