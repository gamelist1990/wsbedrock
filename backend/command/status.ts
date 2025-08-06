import { WSCommandRegistry } from '../Module/Command/register.js';

export function registerStatusCommand(registry: WSCommandRegistry) {
  registry.registerCommand({
    name: 'status',
    description: 'サーバーの状態を表示します',
    parent: false,
    maxArgs: 0,
    minArgs: 0,
    require: 0,
    executor: (ev) => {
      const { player } = ev;
      const uptime = process.uptime();
      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = Math.floor(uptime % 60);
      
      player.sendMessage('§a=== サーバー状態 ===');
      player.sendMessage(`§7稼働時間: §f${hours}時間 ${minutes}分 ${seconds}秒`);
      player.sendMessage(`§7メモリ使用量: §f${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
      player.sendMessage(`§7Node.js バージョン: §f${process.version}`);
      player.sendMessage(`§7登録済みコマンド: §f${registry.commands.length}個`);
    },
  });
}
