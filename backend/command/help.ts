import { WSCommandRegistry } from '../Module/Command/register.js';

export function registerHelpCommand(registry: WSCommandRegistry) {
  registry.registerCommand({
    name: 'help',
    description: 'コマンド一覧を表示します',
    parent: false,
    maxArgs: 1,
    minArgs: 0,
    require: 0,
    executor: (ev) => {
      const { player, args } = ev;
      
      if (args.length === 0) {
        // 全コマンド一覧を表示
        const commands = registry.commands;
        player.sendMessage('§a=== 利用可能なコマンド ===');
        commands.forEach(cmd => {
          const desc = cmd.description || 'No description';
          player.sendMessage(`§7#${cmd.name} §f- §7${desc}`);
        });
        player.sendMessage(`§a合計 ${commands.length} 個のコマンドがあります`);
      } else {
        // 特定のコマンドの詳細を表示
        const cmdName = args[0];
        const command = registry.commands.find(cmd => cmd.name === cmdName);
        
        if (command) {
          player.sendMessage(`§a=== コマンド詳細: ${command.name} ===`);
          player.sendMessage(`§7説明: §f${command.description || 'No description'}`);
          player.sendMessage(`§7最小引数: §f${command.minArgs || 0}`);
          player.sendMessage(`§7最大引数: §f${command.maxArgs || 'unlimited'}`);
          player.sendMessage(`§7権限レベル: §f${command.require || 0}`);
        } else {
          player.sendMessage(`§c[Error] コマンド '${cmdName}' が見つかりません`);
        }
      }
    },
  });
}
