import { 
  ScriptEventCommandMessageAfterEvent, 
  system, 
  Entity, 
  Player,
  Block,
} from "@minecraft/server";


// ScriptEvent用のコマンド定義インターフェース
interface ScriptEventCommand {
  name: string;
  description: string;
  parent: boolean;
  maxArgs: number;
  minArgs: number;
  require: number;
  executor: (ev: ScriptEventExecutorContext) => void;
}

// コマンド実行コンテキスト
interface ScriptEventExecutorContext {
  event: ScriptEventCommandMessageAfterEvent;
  player?: Player;
  entity?: Entity;
  block?: Block;
  args: string[];
  message: string;
}

// ScriptEvent コマンドレジストリー
class ScriptEventCommandRegistry {
  private static instance: ScriptEventCommandRegistry;
  private commands: Map<string, ScriptEventCommand> = new Map();

  private constructor() {}

  public static getInstance(): ScriptEventCommandRegistry {
    if (!ScriptEventCommandRegistry.instance) {
      ScriptEventCommandRegistry.instance = new ScriptEventCommandRegistry();
    }
    return ScriptEventCommandRegistry.instance;
  }

  public registerCommand(command: ScriptEventCommand): void {
    this.commands.set(command.name, command);
    console.log(`[ScriptEventCommandRegistry] Command "${command.name}" registered.`);
  }

  public getCommand(name: string): ScriptEventCommand | undefined {
    return this.commands.get(name);
  }

  public getAllCommands(): ScriptEventCommand[] {
    return Array.from(this.commands.values());
  }

  public executeCommand(name: string, context: ScriptEventExecutorContext): boolean {
    const command = this.commands.get(name);
    if (!command) {
      return false;
    }

    try {
      // 引数の数をチェック（-1は無制限扱い）
      if (command.minArgs !== -1 && context.args.length < command.minArgs) {
        if (context.player) {
          context.player.sendMessage(`§cエラー: コマンド "${name}" には最低 ${command.minArgs} 個の引数が必要です。`);
        }
        return false;
      }
      if (command.maxArgs !== -1 && context.args.length > command.maxArgs) {
        if (context.player) {
          context.player.sendMessage(`§cエラー: コマンド "${name}" の引数は最大 ${command.maxArgs} 個まで可能です。`);
        }
        return false;
      }

      // コマンドを実行
      command.executor(context);
      return true;
    } catch (error) {
      console.error(`[ScriptEventCommandRegistry] Error executing command "${name}":`, error);
      if (context.player) {
        context.player.sendMessage(`§cコマンドの実行中にエラーが発生しました: ${name}`);
      }
      return false;
    }
  }
}

// グローバルレジストリーのインスタンス
const scriptEventRegistry = ScriptEventCommandRegistry.getInstance();

// コマンド登録用のヘルパー関数
export function registerScriptEvent(command: ScriptEventCommand): void {
  scriptEventRegistry.registerCommand(command);
}

// ScriptEventのメインリスナー
system.afterEvents.scriptEventReceive.subscribe((ev: ScriptEventCommandMessageAfterEvent) => {
  // devログ追加
  console.log(`[ScriptEvent] Received: id=${ev.id}, message="${ev.message}"`);
  
 
  
  // コマンドシステムの処理 - idが"command:"で始まる場合
  if (ev.id.startsWith("command:")) {
    // idからコマンド名を抽出（"command:"の後の部分）
    const commandName = ev.id.substring(8); // "command:".length = 8
    
    // メッセージを引数として解析（空の場合は空配列）
    const args = ev.message.trim() ? ev.message.trim().split(' ') : [];

    // プレイヤーを取得（可能な場合）
    let player: Player | undefined;
    if (ev.sourceEntity && ev.sourceEntity.typeId === "minecraft:player") {
      player = ev.sourceEntity as Player;
    } else if (ev.initiator && ev.initiator.typeId === "minecraft:player") {
      player = ev.initiator as Player;
    }

    // コンテキストを作成
    const context: ScriptEventExecutorContext = {
      event: ev,
      player,
      entity: ev.sourceEntity,
      block: ev.sourceBlock,
      args,
      message: ev.message
    };

    // コマンドを実行
    const executed = scriptEventRegistry.executeCommand(commandName, context);
    if (!executed) {
      const errorMessage = `§cコマンド "${commandName}" が見つかりません。`;
      if (player) {
        player.sendMessage(errorMessage);
      } else {
        console.log(errorMessage);
      }
    }
  }
});

// レジストリーをエクスポート
export { ScriptEventCommandRegistry, scriptEventRegistry };
