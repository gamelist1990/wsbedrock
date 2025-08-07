import { Player, system } from '@minecraft/server';
import { ActionFormData, ModalFormData } from '@minecraft/server-ui';
import { jsonScoreboardDB } from '../../../Modules/ScriptEvent/jsonScoreboardBridge';
import { registerScriptEvent } from '../../../Modules/ScriptEvent/register';

// フォーム要素の型定義
interface ActionButton {
  text: string;
  iconPath?: string;
}

interface FormElement {
  type: 'textField' | 'slider' | 'toggle' | 'dropdown';
  label: string;
  placeholder?: string;
  defaultValue?: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  defaultIndex?: number;
}

interface FormResponse {
  playerId: string;
  playerName: string;
  formType: 'action' | 'modal';
  formId: string;
  title: string;
  result: any;
  timestamp: number;
  canceled: boolean;
  responseId?: number;
}

// フォームID生成
function generateFormId(): string {
  return `form_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

// 結果を保存し、3秒後に自動削除
function saveFormResponse(response: FormResponse): void {
  // 小さな数値IDを生成（6桁の範囲内で生成）
  const responseId = Math.floor(Math.random() * 999999) + 100000; // 100000-999999の範囲
  
  // レスポンスにIDを追加
  const responseWithId = { ...response, responseId: responseId };
  
  // 結果を保存（Direct処理で高速化）
  const saveResult = jsonScoreboardDB.direct.add('form_responses', responseId, responseWithId);
  
  if (saveResult.success) {
    console.log(`[Forms] フォーム結果保存: ${responseId}`);
    
    // 3秒後に自動削除
    system.runTimeout(() => {
      console.log(`[Forms] 自動削除開始: ${responseId}`);
      const deleteResult = jsonScoreboardDB.direct.delete('form_responses', responseId);
      console.log(`[Forms] フォーム結果自動削除: ${responseId} - ${deleteResult.success ? '成功' : '失敗'}`);
      
      if (!deleteResult.success) {
        console.error(`[Forms] 削除失敗の詳細: ${deleteResult.error}`);
        
        // 存在確認を行って詳細を調べる
        const existsResult = jsonScoreboardDB.direct.exists('form_responses', responseId);
        console.log(`[Forms] 削除前存在確認: ${responseId} - ${existsResult.success ? existsResult.data : 'エラー'}`);
      }
    }, 60); // 3秒 = 60tick
  } else {
    console.error(`[Forms] フォーム結果保存失敗: ${saveResult.error}`);
  }
}

// ActionForm作成関数
function createActionForm(player: Player, title: string, body: string, buttons: ActionButton[], formId: string): void {
  console.log(`[Forms] ActionForm作成: ${formId} for ${player.name}`);
  
  const form = new ActionFormData()
    .title(title)
    .body(body);
  
  // ボタンを追加
  buttons.forEach(button => {
    if (button.iconPath) {
      form.button(button.text, button.iconPath);
    } else {
      form.button(button.text);
    }
  });
  
  // フォームを表示
  form.show(player as any).then(response => {
    const formResponse: FormResponse = {
      playerId: player.id,
      playerName: player.name,
      formType: 'action',
      formId: formId,
      title: title,
      result: response.selection !== undefined ? {
        selectedIndex: response.selection,
        selectedButton: buttons[response.selection]?.text
      } : null,
      timestamp: Date.now(),
      canceled: response.canceled || response.selection === undefined
    };
    
    saveFormResponse(formResponse);
    
    // プレイヤーに結果を通知
    if (response.canceled) {
      player.sendMessage(`§e[フォーム] ${formId}: キャンセルされました`);
    } else {
      player.sendMessage(`§a[フォーム] ${formId}: "${buttons[response.selection!]?.text}" が選択されました`);
    }
  }).catch(error => {
    console.error(`[Forms] ActionForm表示エラー (${formId}):`, error);
    player.sendMessage(`§c[フォーム] ${formId}: 表示エラーが発生しました`);
  });
}

// ModalForm作成関数
function createModalForm(player: Player, title: string, elements: FormElement[], formId: string): void {
  console.log(`[Forms] ModalForm作成: ${formId} for ${player.name}`);
  
  const form = new ModalFormData().title(title);
  
  // フォーム要素を追加
  elements.forEach(element => {
    switch (element.type) {
      case 'textField':
        form.textField(element.label, element.placeholder || '');
        break;
      case 'slider':
        form.slider(element.label, element.min || 0, element.max || 100);
        break;
      case 'toggle':
        form.toggle(element.label);
        break;
      case 'dropdown':
        form.dropdown(element.label, element.options || []);
        break;
      default:
        console.warn(`[Forms] 未知のフォーム要素タイプ: ${element.type}`);
    }
  });
  
  // フォームを表示
  form.show(player as any).then(response => {
    const formResponse: FormResponse = {
      playerId: player.id,
      playerName: player.name,
      formType: 'modal',
      formId: formId,
      title: title,
      result: response.formValues !== undefined ? {
        values: response.formValues,
        elements: elements.map((element, index) => ({
          type: element.type,
          label: element.label,
          value: response.formValues![index]
        }))
      } : null,
      timestamp: Date.now(),
      canceled: response.canceled || response.formValues === undefined
    };
    
    saveFormResponse(formResponse);
    
    // プレイヤーに結果を通知
    if (response.canceled) {
      player.sendMessage(`§e[フォーム] ${formId}: キャンセルされました`);
    } else {
      player.sendMessage(`§a[フォーム] ${formId}: フォームが送信されました (${response.formValues!.length}個の値)`);
    }
  }).catch(error => {
    console.error(`[Forms] ModalForm表示エラー (${formId}):`, error);
    player.sendMessage(`§c[フォーム] ${formId}: 表示エラーが発生しました`);
  });
}

// ActionForm作成コマンド
registerScriptEvent({
  name: 'createactionform',
  description: 'ActionFormを作成して表示します',
  parent: false,
  maxArgs: -1,
  minArgs: 3,
  require: 0,
  executor: (ev) => {
    const { player, args } = ev;
    
    if (!player) {
      console.log('[Forms] プレイヤーが見つかりません');
      return;
    }
    
    if (args.length < 3) {
      player.sendMessage('§c[フォーム] 使用法: createactionform <タイトル> <説明> <ボタンJSON>');
      player.sendMessage('§7例: createactionform 選択 どちらを選びますか？ [{"text":"はい"},{"text":"いいえ"}]');
      return;
    }
    
    const title = args[0];
    const body = args[1];
    let buttons: ActionButton[];
    
    // 3番目以降の引数を全て結合してJSONとして解析
    const jsonString = args.slice(2).join(' ');
    console.log(`[Forms] 解析するJSON: ${jsonString}`);
    
    try {
      buttons = JSON.parse(jsonString);
      if (!Array.isArray(buttons) || buttons.length === 0) {
        throw new Error('ボタン配列が空です');
      }
      
      // ボタンの構造チェック
      for (let i = 0; i < buttons.length; i++) {
        if (!buttons[i] || typeof buttons[i].text !== 'string') {
          throw new Error(`ボタン[${i}]にtextプロパティがありません`);
        }
      }
      
    } catch (error) {
      console.error(`[Forms] ボタンJSONの解析エラー:`, error);
      player.sendMessage(`§c[フォーム] ボタンJSONの解析に失敗: ${error}`);
      player.sendMessage('§7正しい形式: [{"text":"ボタン1"},{"text":"ボタン2","iconPath":"textures/items/diamond"}]');
      player.sendMessage(`§7受信したJSON: ${jsonString}`);
      return;
    }
    
    const formId = generateFormId();
    player.sendMessage(`§b[フォーム] ActionForm作成: ${formId}`);
    console.log(`[Forms] createactionform実行: ${formId} by ${player.name}, ボタン数: ${buttons.length}`);
    
    createActionForm(player, title, body, buttons, formId);
  },
});

// ModalForm作成コマンド
registerScriptEvent({
  name: 'createmodalform',
  description: 'ModalFormを作成して表示します',
  parent: false,
  maxArgs: -1,
  minArgs: 2,
  require: 0,
  executor: (ev) => {
    const { player, args } = ev;
    
    if (!player) {
      console.log('[Forms] プレイヤーが見つかりません');
      return;
    }
    
    if (args.length < 2) {
      player.sendMessage('§c[フォーム] 使用法: createmodalform <タイトル> <フォーム要素JSON>');
      player.sendMessage('§7例: createmodalform 設定 [{"type":"textField","label":"名前"}]');
      return;
    }
    
    const title = args[0];
    let elements: FormElement[];
    
    // 2番目以降の引数を全て結合してJSONとして解析
    const jsonString = args.slice(1).join(' ');
    console.log(`[Forms] 解析するJSON: ${jsonString}`);
    
    try {
      elements = JSON.parse(jsonString);
      if (!Array.isArray(elements) || elements.length === 0) {
        throw new Error('フォーム要素配列が空です');
      }
      
      // フォーム要素の構造チェック
      for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        if (!element || typeof element.type !== 'string' || typeof element.label !== 'string') {
          throw new Error(`フォーム要素[${i}]にtype/labelプロパティがありません`);
        }
        
        const validTypes = ['textField', 'slider', 'toggle', 'dropdown'];
        if (!validTypes.includes(element.type)) {
          throw new Error(`フォーム要素[${i}]のtype "${element.type}" は無効です。有効: ${validTypes.join(', ')}`);
        }
      }
      
    } catch (error) {
      console.error(`[Forms] フォーム要素JSONの解析エラー:`, error);
      player.sendMessage(`§c[フォーム] フォーム要素JSONの解析に失敗: ${error}`);
      player.sendMessage('§7正しい形式: [{"type":"textField","label":"ラベル","placeholder":"入力してください"}]');
      player.sendMessage(`§7受信したJSON: ${jsonString}`);
      return;
    }
    
    const formId = generateFormId();
    player.sendMessage(`§b[フォーム] ModalForm作成: ${formId}`);
    console.log(`[Forms] createmodalform実行: ${formId} by ${player.name}, 要素数: ${elements.length}`);
    
    createModalForm(player, title, elements, formId);
  },
});

// フォーム結果取得コマンド
registerScriptEvent({
  name: 'getformresult',
  description: 'フォームの結果を取得します',
  parent: false,
  maxArgs: 1,
  minArgs: 0,
  require: 0,
  executor: (ev) => {
    const { player, args } = ev;
    
    if (!player) {
      console.log('[Forms] プレイヤーが見つかりません');
      return;
    }
    
    if (args.length === 0) {
      // 最新の結果を取得
      const listResult = jsonScoreboardDB.listJson('form_responses');
      
      if (!listResult.success || !listResult.data) {
        player.sendMessage('§e[フォーム] 保存されている結果がありません');
        return;
      }
      
      // プレイヤーの最新の結果を検索
      let latestResponse: FormResponse | null = null;
      let latestTimestamp = 0;
      
      for (const [, data] of Object.entries(listResult.data)) {
        const response = data as FormResponse;
        if (response.playerId === player.id && response.timestamp > latestTimestamp) {
          latestResponse = response;
          latestTimestamp = response.timestamp;
        }
      }
      
      if (!latestResponse) {
        player.sendMessage('§e[フォーム] あなたの結果が見つかりません');
        return;
      }
      
      displayFormResult(player, latestResponse);
      
    } else {
      // 指定されたフォームIDの結果を取得 - フォームIDから数値IDを抽出
      const formId = args[0];
      // フォームIDから数値部分を抽出 (例: form_1723876123456_7890 -> 1723876123456)
      const timestampMatch = formId.match(/form_(\d+)_\d+/);
      
      if (!timestampMatch) {
        player.sendMessage(`§c[フォーム] 無効なフォームIDです: ${formId}`);
        return;
      }
      
      // 全ての結果を検索して該当するフォームを見つける
      const listResult = jsonScoreboardDB.listJson('form_responses');
      
      if (!listResult.success || !listResult.data) {
        player.sendMessage(`§c[フォーム] フォーム結果が見つかりません: ${formId}`);
        return;
      }
      
      let foundResponse: FormResponse | null = null;
      
      for (const [, data] of Object.entries(listResult.data)) {
        const response = data as FormResponse;
        if (response.playerId === player.id && response.formId === formId) {
          foundResponse = response;
          break;
        }
      }
      
      if (!foundResponse) {
        player.sendMessage(`§c[フォーム] 結果が見つかりません: ${formId}`);
        return;
      }
      
      displayFormResult(player, foundResponse);
    }
  },
});

// フォーム結果一覧表示コマンド
registerScriptEvent({
  name: 'listformresults',
  description: '保存されているフォーム結果一覧を表示します',
  parent: false,
  maxArgs: 0,
  minArgs: 0,
  require: 0,
  executor: (ev) => {
    const { player } = ev;
    
    if (!player) {
      console.log('[Forms] プレイヤーが見つかりません');
      return;
    }
    
    const listResult = jsonScoreboardDB.listJson('form_responses');
    
    if (!listResult.success || !listResult.data) {
      player.sendMessage('§e[フォーム] 保存されている結果がありません');
      return;
    }
    
    const playerResponses: FormResponse[] = [];
    
    for (const [, data] of Object.entries(listResult.data)) {
      const response = data as FormResponse;
      if (response.playerId === player.id) {
        playerResponses.push(response);
      }
    }
    
    if (playerResponses.length === 0) {
      player.sendMessage('§e[フォーム] あなたの結果が見つかりません');
      return;
    }
    
    // 時系列順にソート
    playerResponses.sort((a, b) => b.timestamp - a.timestamp);
    
    player.sendMessage(`§a[フォーム] あなたの結果一覧 (${playerResponses.length}件):`);
    
    playerResponses.forEach((response, index) => {
      const timeAgo = Math.floor((Date.now() - response.timestamp) / 1000);
      const status = response.canceled ? '§cキャンセル' : '§a完了';
      player.sendMessage(`§f${index + 1}. ${response.formId} (${response.formType}) - ${response.title} ${status} §7(${timeAgo}秒前)`);
    });
    
    player.sendMessage('§7結果詳細を見るには: getformresult <フォームID>');
  },
});

// フォーム結果表示関数
function displayFormResult(player: Player, response: FormResponse): void {
  player.sendMessage(`§a[フォーム結果] ${response.formId}`);
  player.sendMessage(`§f  タイトル: ${response.title}`);
  player.sendMessage(`§f  タイプ: ${response.formType}`);
  player.sendMessage(`§f  時刻: ${new Date(response.timestamp).toLocaleString()}`);
  player.sendMessage(`§f  状態: ${response.canceled ? '§cキャンセル' : '§a完了'}`);
  
  if (!response.canceled && response.result) {
    player.sendMessage('§f  結果:');
    
    if (response.formType === 'action') {
      player.sendMessage(`§f    選択: ${response.result.selectedButton} (インデックス: ${response.result.selectedIndex})`);
    } else if (response.formType === 'modal') {
      response.result.elements.forEach((element: any) => {
        let valueStr = '';
        switch (element.type) {
          case 'textField':
            valueStr = `"${element.value}"`;
            break;
          case 'toggle':
            valueStr = element.value ? '§aON' : '§cOFF';
            break;
          case 'slider':
            valueStr = element.value.toString();
            break;
          case 'dropdown':
            valueStr = `${element.value} (インデックス: ${element.value})`;
            break;
          default:
            valueStr = element.value.toString();
        }
        player.sendMessage(`§f    ${element.label}: ${valueStr}`);
      });
    }
  }
  
  console.log(`[Forms] 結果表示: ${response.formId} to ${player.name}`);
}

// フォーム使用例を表示するコマンド
registerScriptEvent({
  name: 'formexamples',
  description: 'フォーム作成の使用例を表示します',
  parent: false,
  maxArgs: 0,
  minArgs: 0,
  require: 0,
  executor: (ev) => {
    const { player } = ev;
    
    if (!player) {
      console.log('[Forms] プレイヤーが見つかりません');
      return;
    }
    
    player.sendMessage('§a[フォーム] 使用例:');
    player.sendMessage('§f');
    player.sendMessage('§b1. 簡単な選択フォーム:');
    player.sendMessage('§7/scriptevent command:createactionform 選択 どちらを選びますか？ [{"text":"はい"},{"text":"いいえ"}]');
    player.sendMessage('§f');
    player.sendMessage('§b2. アイコン付き選択フォーム:');
    player.sendMessage('§7/scriptevent command:createactionform アイテム選択 アイテムを選んでください [{"text":"ダイヤモンド","iconPath":"textures/items/diamond"},{"text":"エメラルド","iconPath":"textures/items/emerald"}]');
    player.sendMessage('§f');
    player.sendMessage('§b3. テキスト入力フォーム:');
    player.sendMessage('§7/scriptevent command:createmodalform 設定 [{"type":"textField","label":"プレイヤー名","placeholder":"名前を入力"}]');
    player.sendMessage('§f');
    player.sendMessage('§b4. 複合入力フォーム:');
    player.sendMessage('§7/scriptevent command:createmodalform 詳細設定 [{"type":"textField","label":"名前"},{"type":"slider","label":"レベル","min":1,"max":100},{"type":"toggle","label":"PVP有効"},{"type":"dropdown","label":"難易度","options":["簡単","普通","困難"]}]');
    player.sendMessage('§f');
    player.sendMessage('§e結果確認コマンド:');
    player.sendMessage('§7/scriptevent command:getformresult');
    player.sendMessage('§7/scriptevent command:listformresults');
  },
});

// フォーム削除テストコマンド（デバッグ用）
registerScriptEvent({
  name: 'testformdelete',
  description: 'フォーム削除機能をテストします',
  parent: false,
  maxArgs: 0,
  minArgs: 0,
  require: 0,
  executor: (ev) => {
    const { player } = ev;
    
    if (!player) {
      console.log('[Forms] プレイヤーが見つかりません');
      return;
    }
    
    // テスト用の小さなデータで削除テスト
    const testId = Math.floor(Math.random() * 999999) + 100000;
    const testData = {
      test: true,
      timestamp: Date.now(),
      playerId: player.id
    };
    
    player.sendMessage(`§b[テスト] 削除テスト開始 ID: ${testId}`);
    console.log(`[Forms] 削除テスト開始: ID ${testId}, データ: ${JSON.stringify(testData)}`);
    
    // 保存
    const saveResult = jsonScoreboardDB.direct.add('form_responses', testId, testData);
    player.sendMessage(`§f保存結果: ${saveResult.success ? '§a成功' : '§c失敗'}`);
    console.log(`[Forms] 保存結果詳細:`, saveResult);
    
    if (saveResult.success) {
      // すぐに存在確認
      const existsResult = jsonScoreboardDB.direct.exists('form_responses', testId);
      player.sendMessage(`§f存在確認: ${existsResult.success && existsResult.data ? (existsResult.data.exists ? '§a存在' : '§c不在') : '§cエラー'}`);
      console.log(`[Forms] 存在確認結果詳細:`, existsResult);
      
      // すぐに削除テスト
      const deleteResult = jsonScoreboardDB.direct.delete('form_responses', testId);
      player.sendMessage(`§f削除結果: ${deleteResult.success ? '§a成功' : '§c失敗'}`);
      console.log(`[Forms] 削除結果詳細:`, deleteResult);
      
      if (!deleteResult.success) {
        player.sendMessage(`§cエラー: ${deleteResult.error}`);
        console.error(`[Forms] 削除テストエラー: ${deleteResult.error}`);
        
        // デバッグ用：テーブル内の全データを一覧表示
        const listResult = jsonScoreboardDB.direct.list('form_responses');
        console.log(`[Forms] デバッグ - テーブル内容:`, listResult);
        player.sendMessage(`§7デバッグ: テーブル内のデータ数 ${listResult.success ? listResult.data.count : 'エラー'}`);
      }
      
      // 削除後存在確認
      const existsAfterResult = jsonScoreboardDB.direct.exists('form_responses', testId);
      player.sendMessage(`§f削除後確認: ${existsAfterResult.success && existsAfterResult.data ? (existsAfterResult.data.exists ? '§c残存' : '§a削除済み') : '§cエラー'}`);
      console.log(`[Forms] 削除後存在確認結果詳細:`, existsAfterResult);
    } else {
      console.error(`[Forms] 保存失敗詳細:`, saveResult);
      player.sendMessage(`§cエラー: ${saveResult.error}`);
    }
  },
});

console.log('[Forms] フォーム管理システム初期化完了');







