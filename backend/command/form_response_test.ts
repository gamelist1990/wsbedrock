import { WSCommandRegistry } from '../Module/Command/register.js';
import { jsonDB } from '../Module/ScriptEvent/MineScoreBoard.js';

export function registerFormResponseTestCommand(registry: WSCommandRegistry) {
  registry.registerCommand({
    name: 'formresponse',
    description: 'フォーム応答監視のテストコマンド',
    parent: false,
    maxArgs: 2,
    minArgs: 1,
    require: 0,
    executor: async (ev) => {
      const { player, args } = ev;
      
      if (!args || args.length === 0) {
        player.sendMessage('§c使用方法: formresponse <list|clear|check>');
        player.sendMessage('§elist - form_responsesテーブルの内容を表示');
        player.sendMessage('§eclear - form_responsesテーブルをクリア');
        player.sendMessage('§echeck - 最新の応答をチェック');
        return;
      }

      const action = args[0].toLowerCase();

      try {
        switch (action) {
          case 'list':
            await listFormResponses(player);
            break;
            
          case 'clear':
            await clearFormResponses(player);
            break;
            
          case 'check':
            await checkLatestResponse(player);
            break;
            
          default:
            player.sendMessage('§c不明なアクション。使用可能: list, clear, check');
        }
      } catch (error) {
        console.error(`[FormResponseTest] エラーが発生しました:`, error);
        player.sendMessage('§cコマンド実行中にエラーが発生しました');
      }
    }
  });
}

// form_responsesテーブルの内容を表示
async function listFormResponses(player: any) {
  player.sendMessage('§b[FormResponse] テーブル内容を確認中...');
  
  const listResult = await jsonDB.list('form_responses');
  
  if (!listResult.success) {
    player.sendMessage(`§c[FormResponse] エラー: ${listResult.error}`);
    return;
  }

  if (!listResult.data?.items || listResult.data.items.length === 0) {
    player.sendMessage('§e[FormResponse] テーブルは空です');
    return;
  }

  player.sendMessage(`§a[FormResponse] 見つかった応答: ${listResult.data.items.length}件`);
  
  listResult.data.items.forEach((item: any, index: number) => {
    const data = item.data;
    const timeAgo = Math.floor((Date.now() - data.timestamp) / 1000);
    const status = data.canceled ? '§cキャンセル' : '§a完了';
    
    player.sendMessage(`§f${index + 1}. ID:${item.id} ${data.formId || 'No ID'} (${data.formType}) ${status} §7(${timeAgo}秒前)`);
    player.sendMessage(`§7   プレイヤー: ${data.playerName}, タイトル: ${data.title}`);
  });
}

// form_responsesテーブルをクリア
async function clearFormResponses(player: any) {
  player.sendMessage('§b[FormResponse] テーブルをクリア中...');
  
  const clearResult = await jsonDB.clear('form_responses');
  
  if (clearResult.success) {
    player.sendMessage('§a[FormResponse] テーブルをクリアしました');
  } else {
    player.sendMessage(`§c[FormResponse] クリアに失敗: ${clearResult.error}`);
  }
}

// 最新の応答をチェック
async function checkLatestResponse(player: any) {
  player.sendMessage('§b[FormResponse] 最新の応答をチェック中...');
  
  const listResult = await jsonDB.list('form_responses');
  
  if (!listResult.success) {
    player.sendMessage(`§c[FormResponse] エラー: ${listResult.error}`);
    return;
  }

  if (!listResult.data?.items || listResult.data.items.length === 0) {
    player.sendMessage('§e[FormResponse] 応答がありません');
    return;
  }

  // プレイヤーの最新の応答を検索
  const playerResponses = listResult.data.items.filter((item: any) => 
    item.data.playerName === player.name
  );

  if (playerResponses.length === 0) {
    player.sendMessage('§e[FormResponse] あなたの応答がありません');
    return;
  }

  // 最新のものを取得
  const latest = playerResponses.sort((a: any, b: any) => 
    b.data.timestamp - a.data.timestamp
  )[0];

  const data = latest.data;
  const timeAgo = Math.floor((Date.now() - data.timestamp) / 1000);
  
  player.sendMessage('§a[FormResponse] 最新の応答:');
  player.sendMessage(`§f  フォームID: ${data.formId || 'No ID'}`);
  player.sendMessage(`§f  タイトル: ${data.title}`);
  player.sendMessage(`§f  タイプ: ${data.formType}`);
  player.sendMessage(`§f  状態: ${data.canceled ? '§cキャンセル' : '§a完了'}`);
  player.sendMessage(`§f  時刻: §7${timeAgo}秒前`);
  
  if (!data.canceled && data.result) {
    player.sendMessage('§f  結果:');
    if (data.formType === 'action') {
      player.sendMessage(`§f    選択: ${data.result.selectedButton} (${data.result.selectedIndex})`);
    } else {
      const values = data.result.values || [];
      values.forEach((value: any, index: number) => {
        player.sendMessage(`§f    [${index}]: ${value}`);
      });
    }
  }
}
