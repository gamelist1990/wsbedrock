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

    // フォーム応答データかどうかを判定
    private isFormResponseData(data: any): boolean {
        // フォーム応答データには以下のいずれかが含まれるはず
        const hasFormProperties =
            data.hasOwnProperty('canceled') ||
            data.hasOwnProperty('cancelled') ||
            data.hasOwnProperty('result') ||
            data.hasOwnProperty('selection') ||
            data.hasOwnProperty('selectedIndex') ||
            data.hasOwnProperty('selectedButton') ||
            data.hasOwnProperty('values') ||
            data.hasOwnProperty('formId') ||
            data.hasOwnProperty('formTitle');

        // プレイヤー統計データのようなものは除外
        const hasNonFormProperties =
            data.hasOwnProperty('playerLevel') ||
            data.hasOwnProperty('playerStats') ||
            data.hasOwnProperty('inventory') ||
            data.hasOwnProperty('achievements');

        return hasFormProperties && !hasNonFormProperties;
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

                // 古すぎる応答データをスキップ（10分以上古い）
                const responseTime = responseData.timestamp || 0;
                const now = Date.now();
                if (responseTime > 0 && (now - responseTime) > 600000) { // 10分以上古い
                    console.log(`⏳ [FormResponseMonitor] 古すぎる応答をスキップ: ID=${responseId}, 時刻=${new Date(responseTime).toISOString()}`);
                    this.lastCheckedIds.add(responseId);
                    continue;
                }

                this.lastCheckedIds.add(responseId);

                // フォーム応答データかどうかを判定
                const isFormResponse = this.isFormResponseData(responseData);
                if (!isFormResponse) {
                    console.log(`🚫 [FormResponseMonitor] フォーム応答ではないデータをスキップ: ID=${responseId}`);
                    continue;
                }

                // 監視中のフォームを全て確認して、プレイヤーIDが一致するものを探す
                let matchingForm: { formId: string; data: any } | null = null;

                for (const [formId, monitoringData] of this.monitoringForms.entries()) {
                    // プレイヤーIDで比較（名前の数値化されたものと比較）
                    const expectedPlayerId = monitoringData.playerId;
                    const responsePlayerId = responseData.playerId || responseData.playerName ? nameToNumber(responseData.playerName) : null;

                    console.log(`🔍 [FormResponseMonitor] ID比較: 期待値=${expectedPlayerId}, 応答=${responsePlayerId}, 名前=${responseData.playerName}`);

                    if (responsePlayerId === expectedPlayerId) {
                        // 時間的にも近いかチェック（2分以内に厳しく制限）
                        const formTimestamp = parseInt(formId.split('_')[1]);
                        const responseTime = responseData.timestamp || Date.now();
                        const timeDiff = Math.abs(responseTime - formTimestamp);

                        console.log(`⏱️ [FormResponseMonitor] 時間チェック: フォーム=${new Date(formTimestamp).toISOString()}, 応答=${new Date(responseTime).toISOString()}, 差=${timeDiff}ms`);

                        if (timeDiff < 120000) { // 2分以内
                            matchingForm = { formId, data: monitoringData };
                            console.log(`📨 [FormResponseMonitor] マッチング成功: フォーム=${formId}, 応答ID=${responseId}, プレイヤー=${responseData.playerName}`);
                            break;
                        } else {
                            console.log(`⏰ [FormResponseMonitor] 時間差が大きすぎます: ${timeDiff}ms (>2分)`);
                        }
                    }
                }

                if (!matchingForm) {
                    console.log(`� [FormResponseMonitor] マッチするフォームが見つかりません: プレイヤー=${responseData.playerName}, 応答ID=${responseId}`);
                    continue;
                }

                // 応答データを適切な形式に変換
                console.log(`🔍 [FormResponseMonitor] 元の応答データ:`, JSON.stringify(responseData, null, 2));

                // フォーム応答の基本情報を抽出
                const isCancelled = responseData.canceled || responseData.cancelled || false;
                let buttonId: number | undefined;
                let buttonText: string | undefined;
                let formData: any[] | undefined;

                // 各種応答形式に対応
                if (responseData.result) {
                    buttonId = responseData.result.selectedIndex;
                    buttonText = responseData.result.selectedButton;
                    formData = responseData.result.values || (responseData.result.elements ? responseData.result.elements.map((e: any) => e.value) : undefined);
                } else if (responseData.selection) {
                    buttonId = responseData.selection.selectedIndex;
                    buttonText = responseData.selection.selectedButton;
                    formData = responseData.selection.values;
                } else {
                    // 直接的なプロパティ
                    buttonId = responseData.selectedIndex;
                    buttonText = responseData.selectedButton;
                    formData = responseData.values;
                }

                const formResponse: FormResponse = {
                    success: !isCancelled,
                    cancelled: isCancelled,
                    buttonId,
                    buttonText,
                    formData,
                    error: isCancelled ? 'User cancelled' : undefined
                };

                console.log(`📝 [FormResponseMonitor] 変換後の応答:`, JSON.stringify(formResponse, null, 2));

                // コールバックを実行
                try {
                    matchingForm.data.callback(formResponse, matchingForm.data.player);
                    console.log(`✅ [FormResponseMonitor] コールバック実行成功: ${matchingForm.formId}`);
                } catch (error) {
                    console.error(`❌ [FormResponseMonitor] コールバック実行エラー:`, error);
                }

                // 監視を停止（一度だけ実行）
                this.stopMonitoring(matchingForm.formId);
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
                // ActionForm用の統合JSON形式
                const formConfig = {
                    type: 'action',
                    title: this.formTitle,
                    body: this.formContent,
                    buttons: this.buttons
                };
                // JSONを文字列化し、UTF-8でbase64エンコード
                const formJson = JSON.stringify(formConfig);
                command = `/scriptevent command:createForm ${formJson}`;             
                console.log(`🎯 [FormBuilder] ActionForm Command:`, command);
            } else {
                // ModalForm用の統合JSON形式 - Base64エンコード対応
                const formConfig = {
                    type: 'modal',
                    title: this.formTitle,
                    elements: this.elements
                };
                // JSONを文字列化し、UTF-8でbase64エンコード
                const formJson = JSON.stringify(formConfig);
                command = `/scriptevent command:createForm ${formJson}`;           
                console.log(`🎯 [FormBuilder] ModalForm Command:`, command);
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
            let result;
            try {
                console.log(`🎯 [FormBuilder] コマンド実行開始: ${command}`);
                result = await world.runCommand(command);
                console.log(`📊 [FormBuilder] コマンド実行結果:`, {
                    statusCode: result.statusCode,
                    statusMessage: result.statusMessage,
                    successCount: result.successCount || 'undefined'
                });
            } catch (commandError) {
                console.error(`💥 [FormBuilder] コマンド実行で例外発生:`, {
                    error: commandError,
                    message: commandError instanceof Error ? commandError.message : String(commandError),
                    stack: commandError instanceof Error ? commandError.stack : undefined,
                    command: command
                });

                // プレイヤーにメッセージを送信（tellrawエラー対策）
                try {
                    if (typeof player.sendMessage === 'function') {
                        player.sendMessage(`§c[フォーム] コマンド実行エラー: ${commandError instanceof Error ? commandError.message : String(commandError)}`);
                    }
                } catch (sendError) {
                    console.warn(`⚠️ [FormBuilder] プレイヤーメッセージ送信失敗:`, sendError);
                }

                // エラーの場合もコールバックを実行
                if (this.responseCallback) {
                    const errorResponse: FormResponse = {
                        success: false,
                        error: `Command execution failed: ${commandError instanceof Error ? commandError.message : String(commandError)}`
                    };
                    this.responseCallback(errorResponse, player);
                }

                return null;
            }

            if (result.statusCode === CommandStatusCode.Success) {
                console.log(`✅ [FormBuilder] フォーム表示成功: ${this.formTitle} (ID: ${this.formId})`);

                // プレイヤーにメッセージを送信（tellrawエラー対策）
                try {
                    if (typeof player.sendMessage === 'function') {
                        player.sendMessage(`§a[フォーム] ${this.formTitle} を表示しました (ID: ${this.formId})`);
                    }
                } catch (sendError) {
                    console.warn(`⚠️ [FormBuilder] プレイヤーメッセージ送信失敗:`, sendError);
                }

                return result.statusMessage || 'success';
            } else {
                console.error(`❌ [FormBuilder] フォーム表示失敗:`, {
                    statusCode: result.statusCode,
                    statusMessage: result.statusMessage,
                    command: command
                });

                // プレイヤーにメッセージを送信（tellrawエラー対策）
                try {
                    if (typeof player.sendMessage === 'function') {
                        player.sendMessage(`§c[フォーム] 表示に失敗しました: ${result.statusMessage || 'Unknown error'}`);
                    }
                } catch (sendError) {
                    console.warn(`⚠️ [FormBuilder] プレイヤーメッセージ送信失敗:`, sendError);
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
            console.error(`❌ [FormBuilder] フォーム表示エラー:`, {
                error: error,
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
            });

            // プレイヤーにメッセージを送信（tellrawエラー対策）
            try {
                if (typeof player.sendMessage === 'function') {
                    player.sendMessage(`§c[フォーム] 表示エラーが発生しました: ${error instanceof Error ? error.message : String(error)}`);
                }
            } catch (sendError) {
                console.warn(`⚠️ [FormBuilder] プレイヤーメッセージ送信失敗:`, sendError);
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

