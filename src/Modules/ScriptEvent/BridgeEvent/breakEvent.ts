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

    private constructor() {
        debugLog('BlockBreakEventHandler instance created');
    }

    public static getInstance(): BlockBreakEventHandler {
        if (!BlockBreakEventHandler.instance) {
            BlockBreakEventHandler.instance = new BlockBreakEventHandler();
        }
        return BlockBreakEventHandler.instance;
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

            // Bridgeを通してWebSocketに送信
            const success = await bridge.send(compactEventData, `brk_${event.player.id.substring(0, 5)}_${Date.now()}`);
            
            if (success) {
                debugLog(`Successfully sent block break event for player: ${event.player.name}`);
            } else {
                debugError(`Failed to send block break event for player: ${event.player.name}`);
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
}

// グローバルインスタンス
const blockBreakEventHandler = BlockBreakEventHandler.getInstance();

// 便利な関数エクスポート
export const breakEventBridge = {
    // イベントリスナー制御
    start: () => blockBreakEventHandler.start(),
    stop: () => blockBreakEventHandler.stop(),
    isActive: () => blockBreakEventHandler.isListenerActive(),
    
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
    }
};

// 型エクスポート
export type { CompactBlockBreakEventData };

// クラスエクスポート
export { BlockBreakEventHandler };

// デフォルトエクスポート
export default blockBreakEventHandler;

debugLog('BreakEvent Bridge initialized');
debugLog('Ready to capture and forward player block break events');

// 自動開始
breakEventBridge.start();

