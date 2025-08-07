import { CommandStatusCode, Player } from 'socket-be';
import { server } from '../../index.js';
import { jsonDB } from './MineScoreBoard.js';

// プレイヤー名を数値化する関数
function nameToNumber(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    const char = name.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 32bit整数に変換
  }
  return Math.abs(hash);
}

// フォーム応答監視システム
class FormResponseMonitor {
  private static instance: FormResponseMonitor;
  private monitoringForms = new Map<string, {
    playerId: number;
    callback: (result: FormResponse, player: Player) => void;
    player: Player;
    timeout: NodeJS.Timeout;
    title: string;
  }>();
  private monitorInterval: NodeJS.Timeout | null = null;
  private lastCheckedIds = new Set<number>();

  private constructor() {
    this.startMonitoring();
  }

  public static getInstance(): FormResponseMonitor {
    if (!FormResponseMonitor.instance) {
      FormResponseMonitor.instance = new FormResponseMonitor();
    }
    return FormResponseMonitor.instance;
  }

  // フォーム監視を開始
  private startMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }

    // 2秒ごとにform_responsesテーブルをチェック
    this.monitorInterval = setInterval(async () => {
      await this.checkForNewResponses();
    }, 2000);

    console.log('📡 [FormResponseMonitor] フォーム応答監視を開始しました');
  }

  // 新しい応答をチェック
  private async checkForNewResponses(): Promise<void> {
    try {
      const listResult = await jsonDB.list('form_responses');
      
      if (!listResult.success || !listResult.data?.items) {
        return;
      }

      for (const item of listResult.data.items) {
        const responseId = item.id;
        const responseData = item.data;

        // 既にチェック済みのIDはスキップ
        if (this.lastCheckedIds.has(responseId)) {
          continue;
        }

        this.lastCheckedIds.add(responseId);

        // 監視対象のフォームかチェック
        // クライアント側でformIdが設定されない場合、タイトルとプレイヤーIDで識別
        const monitoringData = this.monitoringForms.get(responseData.formId);
        if (!monitoringData || monitoringData.playerId !== responseData.playerId) {
          // formIdが一致しない場合、タイトルとプレイヤーで再チェック
          let foundByTitle = false;
          for (const [formId, data] of this.monitoringForms.entries()) {
            if (data.playerId === responseData.playerId && 
                responseData.title && 
                formId.includes('form_')) {
              // 時間的に近い応答を探す（5分以内）
              const formTimestamp = parseInt(formId.split('_')[1]);
              const responseTime = responseData.timestamp;
              const timeDiff = Math.abs(responseTime - formTimestamp);
              
              if (timeDiff < 300000) { // 5分以内
                console.log(`📨 [FormResponseMonitor] タイトル・時間マッチでフォーム応答を検知: ${responseData.title} (Player ID: ${responseData.playerId})`);
                
                // 応答データを適切な形式に変換
                const formResponse: FormResponse = {
                  success: !responseData.canceled,
                  cancelled: responseData.canceled,
                  buttonId: responseData.result?.selectedIndex,
                  buttonText: responseData.result?.selectedButton,
                  formData: responseData.result?.values || responseData.result?.elements?.map((e: any) => e.value),
                  error: responseData.canceled ? 'User cancelled' : undefined
                };

                // コールバックを実行
                try {
                  data.callback(formResponse, data.player);
                } catch (error) {
                  console.error(`❌ [FormResponseMonitor] コールバック実行エラー:`, error);
                }

                // 監視を停止（一度だけ実行）
                this.stopMonitoring(formId);
                foundByTitle = true;
                break;
              }
            }
          }
          
          if (!foundByTitle) {
            continue;
          } else {
            // 既にマッチした場合、通常の処理をスキップ
            continue;
          }
        }

        console.log(`📨 [FormResponseMonitor] フォーム応答を検知: ${responseData.formId || responseData.title} (Player ID: ${responseData.playerId})`);

        // 応答データを適切な形式に変換
        const formResponse: FormResponse = {
          success: !responseData.canceled,
          cancelled: responseData.canceled,
          buttonId: responseData.result?.selectedIndex,
          buttonText: responseData.result?.selectedButton,
          formData: responseData.result?.values || responseData.result?.elements?.map((e: any) => e.value),
          error: responseData.canceled ? 'User cancelled' : undefined
        };

        // コールバックを実行
        try {
          monitoringData.callback(formResponse, monitoringData.player);
        } catch (error) {
          console.error(`❌ [FormResponseMonitor] コールバック実行エラー:`, error);
        }

        // 監視を停止（一度だけ実行）
        this.stopMonitoring(responseData.formId);
      }

      // 古いIDを削除（メモリリーク防止）
      if (this.lastCheckedIds.size > 1000) {
        const idsArray = Array.from(this.lastCheckedIds);
        const keepIds = idsArray.slice(-500); // 最新500個だけ保持
        this.lastCheckedIds = new Set(keepIds);
      }

    } catch (error) {
      console.error('❌ [FormResponseMonitor] 監視エラー:', error);
    }
  }

  // フォーム監視を開始
  startFormMonitoring(formId: string, playerId: number, player: Player, callback: (result: FormResponse, player: Player) => void, title: string): void {
    // 既存の監視があれば停止
    this.stopMonitoring(formId);

    // 30秒でタイムアウト
    const timeout = setTimeout(() => {
      console.log(`⏰ [FormResponseMonitor] フォーム応答タイムアウト: ${formId}`);
      callback({
        success: false,
        cancelled: true,
        error: 'Response timeout'
      }, player);
      this.stopMonitoring(formId);
    }, 30000);

    this.monitoringForms.set(formId, {
      playerId,
      callback,
      player,
      timeout,
      title
    });

    console.log(`🔍 [FormResponseMonitor] フォーム監視開始: ${formId} for Player ID: ${playerId} (${player.name})`);
    
    // デバッグ: プレイヤー名から生成されたIDを確認
    console.log(`� [FormResponseMonitor] プレイヤー名数値化: ${player.name} -> ${playerId}`);
  }

  // 特定のフォーム監視を停止
  private stopMonitoring(formId: string): void {
    const monitoringData = this.monitoringForms.get(formId);
    if (monitoringData) {
      clearTimeout(monitoringData.timeout);
      this.monitoringForms.delete(formId);
      console.log(`🛑 [FormResponseMonitor] フォーム監視停止: ${formId}`);
    }
  }

  // 全監視を停止
  public stopAllMonitoring(): void {
    for (const [formId] of this.monitoringForms) {
      this.stopMonitoring(formId);
    }
    
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    console.log('🔴 [FormResponseMonitor] 全フォーム監視を停止しました');
  }
}

// フォームのボタン要素の型定義
interface FormButton {
  text: string;
  iconPath?: string;
}

// モーダルフォームの要素の型定義
interface ModalFormElement {
  type: 'textField' | 'slider' | 'toggle' | 'dropdown';
  label: string;
  placeholder?: string;
  min?: number;
  max?: number;
  options?: string[];
}

// フォームの応答データの型定義
interface FormResponse {
  success: boolean;
  cancelled?: boolean;
  buttonId?: number;
  buttonText?: string;
  formData?: any[];
  error?: string;
}

// フォームビルダークラス
export class FormBuilder {
  private formTitle: string = '';
  private formContent: string = '';
  private formType: 'action' | 'modal' = 'action';
  private buttons: FormButton[] = [];
  private elements: ModalFormElement[] = [];
  private responseCallback: ((result: FormResponse, player: Player) => void) | null = null;
  private formId: string = '';

  constructor() {
    // ユニークなフォームIDを生成
    this.formId = `form_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  }

  // フォームのタイトルを設定
  title(title: string): FormBuilder {
    this.formTitle = title;
    return this;
  }

  // フォームの内容を設定
  content(content: string): FormBuilder {
    this.formContent = content;
    return this;
  }

  // アクションフォームのボタンを追加
  addButton(text: string, iconPath?: string): FormBuilder {
    this.formType = 'action';
    this.buttons.push({ text, iconPath });
    return this;
  }

  // モーダルフォームのテキストフィールドを追加
  addTextField(label: string, placeholder?: string): FormBuilder {
    this.formType = 'modal';
    this.elements.push({ type: 'textField', label, placeholder });
    return this;
  }

  // モーダルフォームのスライダーを追加
  addSlider(label: string, min: number, max: number): FormBuilder {
    this.formType = 'modal';
    this.elements.push({ type: 'slider', label, min, max });
    return this;
  }

  // モーダルフォームのトグルを追加
  addToggle(label: string): FormBuilder {
    this.formType = 'modal';
    this.elements.push({ type: 'toggle', label });
    return this;
  }

  // モーダルフォームのドロップダウンを追加
  addDropdown(label: string, options: string[]): FormBuilder {
    this.formType = 'modal';
    this.elements.push({ type: 'dropdown', label, options });
    return this;
  }

  // フォームの応答を処理するコールバックを設定
  then(callback: (result: FormResponse, player: Player) => void): FormBuilder {
    this.responseCallback = callback;
    return this;
  }

  // フォームを表示
  async show(player: Player): Promise<string | null> {
    try {
      // ワールドを取得
      const worlds = server.getWorlds();
      if (worlds.length === 0) {
        console.error('❌ [FormBuilder] 利用可能なワールドがありません');
        return null;
      }
      
      const world = worlds[0];
      let command: string;

      if (this.formType === 'action') {
        // アクションフォーム用のコマンドを構築（正しい形式）
        const buttonsJson = JSON.stringify(this.buttons);
        command = `/scriptevent command:createactionform "${this.formTitle}" "${this.formContent}" ${buttonsJson}`;
      } else {
        // モーダルフォーム用のコマンドを構築（正しい形式）
        const elementsJson = JSON.stringify(this.elements);
        command = `/scriptevent command:createmodalform "${this.formTitle}" ${elementsJson}`;
      }

      // コールバックが設定されている場合、応答監視を開始
      if (this.responseCallback) {
        const monitor = FormResponseMonitor.getInstance();
        
        // プレイヤー名を数値化してIDとして使用
        const playerId = nameToNumber(player.name);
        console.log(`🔢 [FormBuilder] プレイヤー名を数値化: ${player.name} -> ${playerId}`);
        
        monitor.startFormMonitoring(this.formId, playerId, player, this.responseCallback, this.formTitle);
      }

      // worldでコマンドを実行
      const result = await world.runCommand(command);
      
      if (result.statusCode === CommandStatusCode.Success) {
        console.log(`✅ [FormBuilder] フォーム表示成功: ${this.formTitle} (ID: ${this.formId})`);
        
        // プレイヤーにメッセージを送信
        if (typeof player.sendMessage === 'function') {
          player.sendMessage(`§a[フォーム] ${this.formTitle} を表示しました (ID: ${this.formId})`);
        }

        return result.statusMessage || 'success';
      } else {
        console.error(`❌ [FormBuilder] フォーム表示失敗: ${result.statusMessage || 'Unknown error'}`);
        if (typeof player.sendMessage === 'function') {
          player.sendMessage(`§c[フォーム] 表示に失敗しました: ${result.statusMessage || 'Unknown error'}`);
        }

        // エラーの場合もコールバックを実行
        if (this.responseCallback) {
          const errorResponse: FormResponse = {
            success: false,
            error: result.statusMessage || 'Unknown error'
          };
          this.responseCallback(errorResponse, player);
        }

        return null;
      }
    } catch (error) {
      console.error(`❌ [FormBuilder] フォーム表示エラー:`, error);
      if (typeof player.sendMessage === 'function') {
        player.sendMessage(`§c[フォーム] 表示エラーが発生しました`);
      }

      // エラーの場合もコールバックを実行
      if (this.responseCallback) {
        const errorResponse: FormResponse = {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
        this.responseCallback(errorResponse, player);
      }

      return null;
    }
  }
}

// 簡単にフォームを作成するためのファクトリー関数
export function createForm(): FormBuilder {
  return new FormBuilder();
}

// フォーム応答監視システムを初期化
export function initializeFormResponseMonitor(): FormResponseMonitor {
  return FormResponseMonitor.getInstance();
}

