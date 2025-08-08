import { Event } from '../../Event/Event';
import { bridge } from '../Bridge';
import { PlayerBreakBlockBeforeEvent } from '@minecraft/server';

// ブロック破壊イベントのコンパクトなデータ型
interface CompactBlockBreakEventData {
    type: 'break';
    p: {
        id: string;
        n: string;
        x: number;
        y: number;
        z: number;
    };
    b: {
        t: string;
        x: number;
        y: number;
        z: number;
    };
    tool?: string;
    ts: number;
    dim?: string;
}

// バックエンドからのレスポンスデータ型
interface BreakEventResponse {
    type: 'break_response';
    originalEventId: string;
    status: 'success' | 'error' | 'processed';
    message?: string;
    data?: any;
    timestamp: number;
}

// レスポンスハンドラの型
type BreakEventResponseHandler = (response: BreakEventResponse) => void;

// デバッグフラグ
const DEBUG_BREAK_EVENT = true;

// デバッグ用ヘルパー
const debugLog = (message: string) => {
    if (DEBUG_BREAK_EVENT) {
        console.log(`[BreakEvent] ${message}`);
    }
};

const debugError = (message: string, error?: any) => {
    if (DEBUG_BREAK_EVENT) {
        console.error(`[BreakEvent] ${message}`, error);
    }
};

/**
 * ブロック破壊イベントハンドラークラス
 */
class BlockBreakEventHandler {
    private static instance: BlockBreakEventHandler;
    private isActive: boolean = false;
    private responseHandlers: BreakEventResponseHandler[] = [];
    private sentEventIds: Set<string> = new Set(); // 送信済みイベントIDを追跡

    private constructor() {
        debugLog('BlockBreakEventHandler instance created');
        this.setupResponseHandler();
    }

    public static getInstance(): BlockBreakEventHandler {
        if (!BlockBreakEventHandler.instance) {
            BlockBreakEventHandler.instance = new BlockBreakEventHandler();
        }
        return BlockBreakEventHandler.instance;
    }

    /**
     * バックエンドからのレスポンスハンドラーをセットアップ
     */
    private setupResponseHandler(): void {
        debugLog('Setting up response handler for break events');
        
        // Bridgeにレスポンスハンドラーを登録
        bridge.onReceive(async (data) => {
            try {
                // ブロック破壊イベントのレスポンスかチェック
                if (data.data && 
                    (data.data.type === 'break_response' || 
                     (data.data.originalEventId && data.data.originalEventId.startsWith('brk_')))) {
                    
                    debugLog(`Received break event response: ${data.id}`);
                    await this.handleResponse(data.data as BreakEventResponse);
                    
                    // レスポンス処理完了を示すレスポンス（オプション）
                    return {
                        id: `response_ack_${Date.now()}`,
                        timestamp: Date.now(),
                        data: {
                            type: 'break_response_ack',
                            originalResponseId: data.id,
                            status: 'acknowledged'
                        }
                    };
                }
            } catch (error) {
                debugError('Error handling break event response:', error);
            }
            return undefined;
        });
    }

    /**
     * バックエンドからのレスポンスを処理
     */
    private async handleResponse(response: BreakEventResponse): Promise<void> {
        try {
            debugLog(`Processing break event response - Status: ${response.status}, Event ID: ${response.originalEventId}`);
            
            // 送信済みイベントIDから削除（完了追跡）
            if (response.originalEventId) {
                this.sentEventIds.delete(response.originalEventId);
            }

            // ステータスに応じた処理
            switch (response.status) {
                case 'success':
                    debugLog(`Break event successfully processed by backend: ${response.originalEventId}`);
                    if (response.message) {
                        debugLog(`Backend message: ${response.message}`);
                    }
                    break;
                    
                case 'error':
                    debugError(`Break event processing failed on backend: ${response.originalEventId}`);
                    if (response.message) {
                        debugError(`Backend error: ${response.message}`);
                    }
                    break;
                    
                case 'processed':
                    debugLog(`Break event processed by backend: ${response.originalEventId}`);
                    if (response.data) {
                        debugLog(`Backend response data: ${JSON.stringify(response.data)}`);
                    }
                    break;
                    
                default:
                    debugLog(`Unknown response status: ${response.status}`);
                    break;
            }

            // 登録されたレスポンスハンドラーを実行
            for (const handler of this.responseHandlers) {
                try {
                    handler(response);
                } catch (handlerError) {
                    debugError('Error in response handler:', handlerError);
                }
            }
            
        } catch (error) {
            debugError('Error processing break event response:', error);
        }
    }

    /**
     * レスポンスハンドラーを追加
     */
    public addResponseHandler(handler: BreakEventResponseHandler): void {
        debugLog('Adding response handler');
        this.responseHandlers.push(handler);
    }

    /**
     * レスポンスハンドラーを削除
     */
    public removeResponseHandler(handler: BreakEventResponseHandler): void {
        const index = this.responseHandlers.indexOf(handler);
        if (index > -1) {
            this.responseHandlers.splice(index, 1);
            debugLog('Response handler removed');
        }
    }

    /**
     * イベントリスナーを開始
     */
    public start(): void {
        if (this.isActive) {
            debugLog('Event listener already active');
            return;
        }

        debugLog('Starting block break event listener');
        
        // プレイヤーのブロック破壊イベントを監視
        Event.PlayerBreakBlock.add(this.handleBlockBreakEvent.bind(this));
        
        this.isActive = true;
        debugLog('Block break event listener started successfully');
    }

    /**
     * イベントリスナーを停止
     */
    public stop(): void {
        if (!this.isActive) {
            debugLog('Event listener not active');
            return;
        }

        debugLog('Stopping block break event listener');
        
        // イベントリスナーを削除
        Event.PlayerBreakBlock.remove(this.handleBlockBreakEvent.bind(this));
        
        this.isActive = false;
        debugLog('Block break event listener stopped');
    }

    /**
     * ブロック破壊イベントを処理
     */
    private async handleBlockBreakEvent(event: PlayerBreakBlockBeforeEvent): Promise<void> {
        try {
            debugLog(`Processing block break event for player: ${event.player.name}`);

            // コンパクトなイベントデータを構築（文字数制限対応）
            const compactEventData: CompactBlockBreakEventData = {
                type: 'break',
                p: {
                    id: event.player.id.substring(0, 10), // IDを短縮
                    n: event.player.name.substring(0, 16), // 名前を制限
                    x: Math.floor(event.player.location.x),
                    y: Math.floor(event.player.location.y),
                    z: Math.floor(event.player.location.z)
                },
                b: {
                    t: event.block.typeId.replace('minecraft:', ''), // 名前空間を削除
                    x: event.block.location.x,
                    y: event.block.location.y,
                    z: event.block.location.z
                },
                ts: Date.now(),
                dim: event.player.dimension.id.replace('minecraft:', '') // 名前空間を削除
            };

            // プレイヤーが持っているツールの情報を取得（コンパクト）
            try {
                const inventory = event.player.getComponent('inventory');
                if (inventory && inventory.container) {
                    const selectedItem = inventory.container.getItem(event.player.selectedSlotIndex);
                    if (selectedItem) {
                        compactEventData.tool = selectedItem.typeId.replace('minecraft:', '');
                    }
                }
            } catch (toolError) {
                debugError('Error getting tool information:', toolError);
            }

            // データサイズを確認
            const dataString = JSON.stringify(compactEventData);
            debugLog(`Compact event data size: ${dataString.length} chars`);
            debugLog(`Sending compact break data: ${dataString}`);

            // イベントIDを生成
            const eventId = `brk_${event.player.id.substring(0, 5)}_${Date.now()}`;

            // Bridgeを通してWebSocketに送信
            const success = await bridge.send(compactEventData, eventId);
            
            if (success) {
                // 送信成功時はイベントIDを追跡
                this.sentEventIds.add(eventId);
                debugLog(`Successfully sent block break event for player: ${event.player.name} (ID: ${eventId})`);
            } else {
                debugError(`Failed to send block break event for player: ${event.player.name} (ID: ${eventId})`);
            }

        } catch (error) {
            debugError('Error processing block break event:', error);
        }
    }

    /**
     * アクティブ状態を取得
     */
    public isListenerActive(): boolean {
        return this.isActive;
    }

    /**
     * 統計情報を取得
     */
    public getStats(): {
        isActive: boolean;
        pendingEvents: number;
        responseHandlers: number;
    } {
        return {
            isActive: this.isActive,
            pendingEvents: this.sentEventIds.size,
            responseHandlers: this.responseHandlers.length
        };
    }

    /**
     * 保留中のイベントIDを取得
     */
    public getPendingEventIds(): string[] {
        return Array.from(this.sentEventIds);
    }
}

// グローバルインスタンス
const blockBreakEventHandler = BlockBreakEventHandler.getInstance();

// 便利な関数エクスポート
export const breakEventBridge = {
    // イベントリスナー制御
    start: () => blockBreakEventHandler.start(),
    stop: () => blockBreakEventHandler.stop(),
    isActive: () => blockBreakEventHandler.isListenerActive(),
    
    // レスポンスハンドラー管理
    addResponseHandler: (handler: BreakEventResponseHandler) => blockBreakEventHandler.addResponseHandler(handler),
    removeResponseHandler: (handler: BreakEventResponseHandler) => blockBreakEventHandler.removeResponseHandler(handler),
    
    // 統計情報
    getStats: () => blockBreakEventHandler.getStats(),
    getPendingEvents: () => blockBreakEventHandler.getPendingEventIds(),
    
    // 手動でテストイベントを送信（テスト用）
    sendTestEvent: async (playerName: string = 'TestPlayer') => {
        const testData: CompactBlockBreakEventData = {
            type: 'break',
            p: {
                id: 'test-123',
                n: playerName.substring(0, 16),
                x: 100,
                y: 64,
                z: 200
            },
            b: {
                t: 'stone',
                x: 100,
                y: 63,
                z: 200
            },
            ts: Date.now(),
            dim: 'overworld',
            tool: 'diamond_pickaxe'
        };
        
        return await bridge.send(testData, `test_brk_${Date.now()}`);
    },
    
    // テスト用レスポンスハンドラー
    addTestResponseHandler: () => {
        const testHandler: BreakEventResponseHandler = (response) => {
            console.log(`[TEST] Break Event Response: ${JSON.stringify(response)}`);
        };
        blockBreakEventHandler.addResponseHandler(testHandler);
        return testHandler;
    }
};

// 型エクスポート
export type { CompactBlockBreakEventData, BreakEventResponse, BreakEventResponseHandler };

// クラスエクスポート
export { BlockBreakEventHandler };

// デフォルトエクスポート
export default blockBreakEventHandler;

debugLog('BreakEvent Bridge initialized with response handling');
debugLog('Ready to capture block break events and process backend responses');

// 自動開始
breakEventBridge.start();

// テスト用レスポンスハンドラーを追加（デバッグ用）
if (DEBUG_BREAK_EVENT) {
    breakEventBridge.addTestResponseHandler();
    debugLog('Test response handler added for debugging');
}

