import { WSCommandRegistry } from '../Module/Command/register.js';
import { jsonDB } from '../Module/ScriptEvent/MineScoreBoard.js';

export function registerExperimentCommand(registry: WSCommandRegistry) {
  registry.registerCommand({
    name: 'experiment',
    description: 'JSONスコアボードデータベースの実験用コマンド',
    parent: false,
    maxArgs: 5,
    minArgs: 1,
    require: 0,
    executor: async (ev) => {
      const { player, args } = ev;
      const commandStartTime = Date.now();
      const timestamp = new Date().toISOString();
      
      console.log(`[ExperimentCommand][${timestamp}] Command executed by ${player.name} with args: ${JSON.stringify(args)}`);
      
      if (!args || args.length === 0) {
        player.sendMessage('§c使用方法: experiment <action> [table] [id] [data]');
        player.sendMessage('§eアクション: set, get, delete, exists, list, clear, test');
        return;
      }

      const action = args[0].toLowerCase();
      const tableName = args[1] || 'test_table';
      const id = args[2] ? parseInt(args[2]) : 1;
      const data = args[3] ? args[3] : '{"name":"TestUser","level":1}';

      console.log(`[ExperimentCommand][${timestamp}] Parsed parameters - action: ${action}, table: ${tableName}, id: ${id}, data: ${data.substring(0, 50)}...`);

      try {
        switch (action) {
          case 'set':
            try {
              const jsonData = JSON.parse(data);
              const setResult = await jsonDB.set(tableName, id, jsonData);
              if (setResult.success) {
                player.sendMessage(`§a[SET] 成功: テーブル="${tableName}", ID=${id}`);
                player.sendMessage(`§7データ: ${JSON.stringify(setResult.data)}`);
              } else {
                player.sendMessage(`§c[SET] 失敗: ${setResult.error}`);
              }
            } catch (parseError) {
              player.sendMessage(`§c[SET] JSON解析エラー: ${parseError}`);
            }
            break;

          case 'get':
            const getResult = await jsonDB.get(tableName, id);
            if (getResult.success) {
              player.sendMessage(`§a[GET] 成功: テーブル="${tableName}", ID=${id}`);
              player.sendMessage(`§7データ: ${JSON.stringify(getResult.data)}`);
            } else {
              player.sendMessage(`§c[GET] 失敗: ${getResult.error}`);
            }
            break;

          case 'delete':
            const deleteResult = await jsonDB.delete(tableName, id);
            if (deleteResult.success) {
              player.sendMessage(`§a[DELETE] 成功: テーブル="${tableName}", ID=${id} を削除しました`);
            } else {
              player.sendMessage(`§c[DELETE] 失敗: ${deleteResult.error}`);
            }
            break;

          case 'exists':
            const existsResult = await jsonDB.exists(tableName, id);
            if (existsResult.success) {
              const exists = existsResult.data?.exists;
              player.sendMessage(`§a[EXISTS] テーブル="${tableName}", ID=${id}: ${exists ? '§a存在します' : '§c存在しません'}`);
            } else {
              player.sendMessage(`§c[EXISTS] 失敗: ${existsResult.error}`);
            }
            break;

          case 'list':
            const listResult = await jsonDB.list(tableName);
            if (listResult.success) {
              const items = listResult.data?.items || [];
              const count = listResult.data?.count || 0;
              player.sendMessage(`§a[LIST] テーブル="${tableName}" 内のアイテム数: ${count}`);
              
              if (items.length > 0) {
                items.forEach((item: any, index: number) => {
                  if (index < 5) { // 最初の5個だけ表示
                    player.sendMessage(`§7  ID=${item.id}: ${JSON.stringify(item.data)}`);
                  }
                });
                if (items.length > 5) {
                  player.sendMessage(`§7  ... (残り${items.length - 5}個)`);
                }
              } else {
                player.sendMessage('§7  (アイテムなし)');
              }
            } else {
              player.sendMessage(`§c[LIST] 失敗: ${listResult.error}`);
            }
            break;

          case 'clear':
            const clearResult = await jsonDB.clear(tableName);
            if (clearResult.success) {
              player.sendMessage(`§a[CLEAR] 成功: テーブル="${tableName}" をクリアしました`);
            } else {
              player.sendMessage(`§c[CLEAR] 失敗: ${clearResult.error}`);
            }
            break;

          case 'test':
            const testStartTime = Date.now();
            player.sendMessage('§e[TEST] JSONスコアボードデータベーステストを開始...');
            console.log(`[ExperimentCommand] Starting comprehensive test at ${new Date().toISOString()}`);
            
            // テストデータ
            const testData = {
              playerName: player.name,
              timestamp: Date.now(),
              position: { x: 0, y: 0, z: 0 }, // プレイヤー位置は簡略化
              items: ['sword', 'apple', 'stone'],
              stats: { level: 10, exp: 1500, health: 20 }
            };

            console.log(`[ExperimentCommand] Test data prepared: ${JSON.stringify(testData).substring(0, 150)}...`);

            // 設定テスト
            console.log(`[ExperimentCommand] Starting SET operation...`);
            const setStartTime = Date.now();
            const testSetResult = await jsonDB.set('test_players', 999, testData);
            const setDuration = Date.now() - setStartTime;
            console.log(`[ExperimentCommand] SET operation completed in ${setDuration}ms - success: ${testSetResult.success}`);
            
            if (testSetResult.success) {
              player.sendMessage(`§a  ✓ データ設定成功 (${setDuration}ms)`);
            } else {
              player.sendMessage(`§c  ✗ データ設定失敗: ${testSetResult.error}`);
              console.log(`[ExperimentCommand] SET error details: ${testSetResult.error}`);
            }

            // 取得テスト
            console.log(`[ExperimentCommand] Starting GET operation...`);
            const getStartTime = Date.now();
            const testGetResult = await jsonDB.get('test_players', 999);
            const getDuration = Date.now() - getStartTime;
            console.log(`[ExperimentCommand] GET operation completed in ${getDuration}ms - success: ${testGetResult.success}`);
            
            if (testGetResult.success) {
              player.sendMessage(`§a  ✓ データ取得成功 (${getDuration}ms)`);
              player.sendMessage(`§7    取得データ: ${JSON.stringify(testGetResult.data).substring(0, 100)}...`);
              console.log(`[ExperimentCommand] Retrieved data matches: ${JSON.stringify(testGetResult.data) === JSON.stringify(testData)}`);
            } else {
              player.sendMessage(`§c  ✗ データ取得失敗: ${testGetResult.error}`);
              console.log(`[ExperimentCommand] GET error details: ${testGetResult.error}`);
            }

            // 存在確認テスト
            console.log(`[ExperimentCommand] Starting EXISTS operation...`);
            const existsStartTime = Date.now();
            const testExistsResult = await jsonDB.exists('test_players', 999);
            const existsDuration = Date.now() - existsStartTime;
            console.log(`[ExperimentCommand] EXISTS operation completed in ${existsDuration}ms - success: ${testExistsResult.success}, exists: ${testExistsResult.data?.exists}`);
            
            if (testExistsResult.success && testExistsResult.data?.exists) {
              player.sendMessage(`§a  ✓ 存在確認成功 (${existsDuration}ms)`);
            } else {
              player.sendMessage(`§c  ✗ 存在確認失敗 (${existsDuration}ms)`);
              console.log(`[ExperimentCommand] EXISTS error details:`, testExistsResult);
            }

            const totalDuration = Date.now() - testStartTime;
            player.sendMessage(`§e[TEST] テスト完了！ (総時間: ${totalDuration}ms)`);
            console.log(`[ExperimentCommand] Comprehensive test completed in ${totalDuration}ms`);
            break;

          default:
            player.sendMessage('§c不明なアクション: ' + action);
            player.sendMessage('§e利用可能なアクション: set, get, delete, exists, list, clear, test');
            break;
        }
      } catch (error) {
        const errorTimestamp = new Date().toISOString();
        console.error(`[ExperimentCommand][${errorTimestamp}] Error executing command:`, error);
        player.sendMessage(`§c実験コマンドでエラーが発生しました: ${error}`);
      }
      
      const commandDuration = Date.now() - commandStartTime;
      console.log(`[ExperimentCommand][${timestamp}] Command completed in ${commandDuration}ms`);
    },
  });
}
