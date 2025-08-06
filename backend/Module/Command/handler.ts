import { PlayerChatSignal, Server, ServerEvent } from 'socket-be';
import { WSCommandRegistry } from './register.js';

// チャットコマンドハンドラ
export class PlayerChatHandler {
  private server: Server;
  private registry: WSCommandRegistry;
  private isListenerRegistered: boolean = false;

  constructor(server: Server, registry: WSCommandRegistry) {
    this.server = server;
    this.registry = registry;
    
    // 即座に登録を試行
    this.registerChatListener();
    
    // ワールドが追加されたタイミングで再度確認
    this.server.on(ServerEvent.WorldAdd, (world) => {
      if (!this.isListenerRegistered) {
        this.registerChatListener();
      }
    });
  }
  
  private registerChatListener(): void {
    if (this.isListenerRegistered) {
      return;
    }

    try {
      this.server.on(ServerEvent.PlayerChat, this.handleChat.bind(this));
      this.isListenerRegistered = true;
      console.log('✅ [PlayerChatHandler] チャットハンドラーを初期化しました');
    } catch (error) {
      console.error('❌ [PlayerChatHandler] チャットハンドラーの初期化に失敗:', error);
    }
  }

  private async handleChat(ev: PlayerChatSignal) {
    const { sender, message } = ev;
    console.log(`� [Chat] ${sender.name}: ${message}`);
    
    // External/外部プレイヤーのメッセージは無視
    if (sender.name === 'External' || sender.name === '外部') return;
    
    // コマンドでない場合は処理しない
    if (!message.startsWith('#')) return;

    console.log(`🎮 [Command] ${sender.name} executed: ${message}`);

    

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
