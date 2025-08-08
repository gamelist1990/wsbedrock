import { Event } from '../../Event/Event';
import { bridge } from '../Bridge';
import { PlayerBreakBlockBeforeEvent, world } from '@minecraft/server';

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

// Bridge レスポンス型（event_acknowledged など）
interface BridgeResponse {
    id: string;
    timestamp: number;
    type: string;
    data?: any;
    jsonData?: any;
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
            // player_break_block のACKレスポンスに合わせて処理
            console.log('Received data:', JSON.stringify(data, null, 2));
            const ackType = data?.data?.type;
            const ackData = data?.data?.data;
            if (ackType === 'player_break_block' && ackData && typeof ackData.p === 'string') {
                const playerName = ackData.p;
                debugLog(`Looking for player.name === ${playerName}`);
                try {
                    const players = world.getPlayers();
                    for (const player of players) {
                        debugLog(`Checking player.name: ${player.name}`);
                        if (player.name === playerName) {
                            player.sendMessage('ブロック破壊イベントが正常に処理されました。');
                            debugLog(`Sent success message to player: ${player.name}`);
                            break;
                        }
                    }
                } catch (e) {
                    debugError('Failed to send player message for player_break_block:', e);
                }
            }
            return undefined;
        });
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
}

// グローバルインスタンス
const blockBreakEventHandler = BlockBreakEventHandler.getInstance();

// 便利な関数エクスポート
export const breakEventBridge = {
    // イベントリスナー制御
    start: () => blockBreakEventHandler.start(),
    stop: () => blockBreakEventHandler.stop(),
    addResponseHandler: (handler: BreakEventResponseHandler) => blockBreakEventHandler.addResponseHandler(handler),
    removeResponseHandler: (handler: BreakEventResponseHandler) => blockBreakEventHandler.removeResponseHandler(handler),
};

// 型エクスポート
export type { CompactBlockBreakEventData, BreakEventResponse, BreakEventResponseHandler, BridgeResponse };

// クラスエクスポート
export { BlockBreakEventHandler };

// デフォルトエクスポート
export default blockBreakEventHandler;


// 自動開始
breakEventBridge.start();

