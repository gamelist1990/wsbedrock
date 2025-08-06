import { WSCommandRegistry } from '../Module/Command/register.js';
import { utils } from '../index.js';

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
      
      // TimeUtilを使用して稼働時間を取得
      const formattedUptime = utils.time.getProcessUptimeFormatted();
      const appElapsed = utils.time.getElapsedTimeFormatted();
      const currentTime = utils.time.getCurrentTimeFormatted();
      
      // メモリ使用量
      const memoryUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      
      // TimeUtil統計
      const timeStats = utils.time.getStats();
      
      player.sendMessage('§a=== サーバー状態 ===');
      player.sendMessage(`§7現在時刻: §f${currentTime}`);
      player.sendMessage(`§7プロセス稼働時間: §f${formattedUptime}`);
      player.sendMessage(`§7アプリ経過時間: §f${appElapsed}`);
      player.sendMessage(`§7メモリ使用量: §f${memoryUsage}MB`);
      player.sendMessage(`§7Node.js バージョン: §f${process.version}`);
      player.sendMessage(`§7登録済みコマンド: §f${registry.commands.length}個`);
      player.sendMessage(`§7実行中タイマー: §f${timeStats.activeTimers}個`);
      player.sendMessage(`§7タイマー記録: §f${timeStats.totalRecords}件`);
    },
  });
}
