import { WSCommandRegistry } from '../Module/Command/register.js';
import { createForm, initializeFormResponseMonitor } from '../Module/ScriptEvent/FormBuilder.js';
import { jsonDB } from '../Module/ScriptEvent/MineScoreBoard.js';

export function registerUi_testCommand(registry: WSCommandRegistry) {
  registry.registerCommand({
    name: 'ui',
    description: 'UI フォーム作成のテストコマンド',
    parent: false,
    maxArgs: 2,
    minArgs: 1,
    require: 0,
    executor: async (ev) => {
      const { player, args } = ev;
      
      if (!args || args.length === 0) {
        player.sendMessage('§c使用方法: ui <test|custom|debug>');
        player.sendMessage('§etest - 基本的なテストフォーム');
        player.sendMessage('§ecustom - カスタムフォーム例');
        player.sendMessage('§edebug - フォーム応答デバッグ情報');
        return;
      }

      const formType = args[0].toLowerCase();

      try {
        switch (formType) {
          case 'test':
            await testBasicForm(player);
            break;
            
          case 'custom':
            await testCustomForm(player);
            break;

          case 'debug':
            await showDebugInfo(player);
            break;
            
          default:
            player.sendMessage('§c不明なフォームタイプです。使用可能: test, custom, debug');
        }
      } catch (error) {
        console.error(`[UITest] エラーが発生しました:`, error);
        player.sendMessage('§cフォーム表示中にエラーが発生しました');
      }
    }
  });
}

// 基本的なテストフォーム
async function testBasicForm(player: any) {
  const result = await createForm()
    .title('基本テストフォーム')
    .content('これは基本的なテストフォームです。選択してください。')
    .addButton('オプション1')
    .addButton('オプション2')
    .addButton('キャンセル')
    .then((result, responsePlayer) => {
      console.log(`📋 [UITest] フォーム応答受信:`, result);
      console.log(`👤 [UITest] 応答プレイヤー: ${responsePlayer.name}`);
      
      if (result.success && !result.cancelled) {
        if (result.buttonId !== undefined && result.buttonText) {
          responsePlayer.sendMessage(`§a選択されたボタン: "${result.buttonText}" (ID: ${result.buttonId})`);
          
          // ボタンに応じた処理
          switch (result.buttonId) {
            case 0:
              responsePlayer.sendMessage('§eオプション1が選択されました！');
              break;
            case 1:
              responsePlayer.sendMessage('§eオプション2が選択されました！');
              break;
            case 2:
              responsePlayer.sendMessage('§7キャンセルされました。');
              break;
          }
        }
      } else if (result.cancelled) {
        responsePlayer.sendMessage('§7フォームがキャンセルされました。');
      } else if (!result.success) {
        responsePlayer.sendMessage(`§cフォームエラー: ${result.error || '不明なエラー'}`);
      }
    })
    .show(player);
    
  console.log(`[UITest] 基本フォーム結果: ${result}`);
}

// カスタムフォームの例
async function testCustomForm(player: any) {
  const result = await createForm()
    .title('カスタムフォーム')
    .addTextField('ユーザー名', 'ユーザー名を入力')
    .addSlider('経験値', 0, 1000)
    .addToggle('通知を有効にする')
    .addDropdown('言語', ['日本語', '英語', '中国語', '韓国語'])
    .addTextField('コメント', 'コメントがあれば入力してください')
    .then((result, responsePlayer) => {
      console.log(`📋 [UITest] カスタムフォーム応答受信:`, result);
      console.log(`👤 [UITest] 応答プレイヤー: ${responsePlayer.name}`);
      
      if (result.success && !result.cancelled) {
        if (result.formData && Array.isArray(result.formData)) {
          responsePlayer.sendMessage('§a✅ カスタムフォーム送信完了！');
          responsePlayer.sendMessage('§e入力された情報:');
          responsePlayer.sendMessage(`§7• ユーザー名: ${result.formData[0] || '(未入力)'}`);
          responsePlayer.sendMessage(`§7• 経験値: ${result.formData[1] || 0}`);
          responsePlayer.sendMessage(`§7• 通知: ${result.formData[2] ? 'ON' : 'OFF'}`);
          
          const languages = ['日本語', '英語', '中国語', '韓国語'];
          const selectedLang = languages[result.formData[3]] || '不明';
          responsePlayer.sendMessage(`§7• 言語: ${selectedLang}`);
          responsePlayer.sendMessage(`§7• コメント: ${result.formData[4] || '(未入力)'}`);
        }
      } else if (result.cancelled) {
        responsePlayer.sendMessage('§7カスタムフォームがキャンセルされました。');
      } else if (!result.success) {
        responsePlayer.sendMessage(`§cフォームエラー: ${result.error || '不明なエラー'}`);
      }
    })
    .show(player);
    
  console.log(`[UITest] カスタムフォーム結果: ${result}`);
}

// デバッグ情報を表示
async function showDebugInfo(player: any) {
  player.sendMessage('§b[UITest] フォーム応答監視システム デバッグ情報');
  
  // 監視システムを初期化
  const monitor = initializeFormResponseMonitor();
  player.sendMessage('§a監視システム: 初期化済み');
  
  // form_responsesテーブルの状態を確認
  const listResult = await jsonDB.list('form_responses');
  
  if (listResult.success && listResult.data?.items) {
    player.sendMessage(`§eform_responsesテーブル: ${listResult.data.items.length}件のエントリ`);
    
    const recentItems = listResult.data.items
      .filter((item: any) => (Date.now() - item.data.timestamp) < 60000) // 過去1分以内
      .slice(-3); // 最新3件
      
    if (recentItems.length > 0) {
      player.sendMessage('§f最近の応答 (過去1分以内):');
      recentItems.forEach((item: any, index: number) => {
        const data = item.data;
        const timeAgo = Math.floor((Date.now() - data.timestamp) / 1000);
        player.sendMessage(`§7  ${index + 1}. ${data.playerName}: ${data.title} (${timeAgo}秒前)`);
      });
    } else {
      player.sendMessage('§7最近の応答はありません');
    }
  } else {
    player.sendMessage(`§cform_responsesテーブルエラー: ${listResult.error || 'Unknown'}`);
  }
  
  player.sendMessage('§7フォーム応答テストコマンド: #formresponse list');
}
