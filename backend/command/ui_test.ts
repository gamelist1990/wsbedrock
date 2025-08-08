import { Player } from 'socket-be';
import { WSCommandRegistry } from '../Module/Command/register.js';
import { FormBuilder, createForm, initializeFormResponseMonitor } from '../Module/ScriptEvent/FormBuilder.js';
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
                player.sendMessage('§c使用方法: ui <test|custom|advanced|debug>');
                player.sendMessage('§etest - 基本的なテストフォーム (ActionForm)');
                player.sendMessage('§ecustom - カスタムフォーム例 (ModalForm)');
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
                    default:
                        player.sendMessage('§c不明なフォームタイプです。使用可能: test, custom');
                }
            } catch (error) {
                console.error(`[UITest] エラーが発生しました:`, error);
                player.sendMessage('§cフォーム表示中にエラーが発生しました');
            }
        }
    });
}

// 基本的なテストフォーム（新しいFormBuilderクラス使用）
async function testBasicForm(player: any) {
    const form = new FormBuilder()
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
        });

    const result = await form.show(player);
    console.log(`[UITest] 基本フォーム結果: ${result}`);
}

// カスタムフォーム～～～
async function testCustomForm(player: Player) {
    const form = new FormBuilder()
        .title('シンプルテストフォーム')
        .addTextField('コメント', 'コメントを入力してください')
        .addToggle('通知を有効にする')
        .then((result, responsePlayer) => {
            console.log(`シンプルフォーム応答受信:`, result);
            console.log(`プレイヤー: ${responsePlayer.name}`);

            if (result.success && !result.cancelled) {
                if (result.formData && Array.isArray(result.formData)) {
                    responsePlayer.sendMessage('§a✅ シンプルフォーム送信完了！');
                    responsePlayer.sendMessage('§e入力された情報:');
                    responsePlayer.sendMessage(`§7• コメント: ${result.formData[0] || '(未入力)'}`);
                    responsePlayer.sendMessage(`§7• 通知: ${result.formData[1] ? 'ON' : 'OFF'}`);
                }
            } else if (result.cancelled) {
                responsePlayer.sendMessage('§7フォームがキャンセルされました。');
            } else if (!result.success) {
                responsePlayer.sendMessage(`§cフォームエラー: ${result.error || '不明なエラー'}`);
            }
        });

    const result = await form.show(player);
    console.log(`[UITest] カスタムフォーム結果: ${result}`);
}

