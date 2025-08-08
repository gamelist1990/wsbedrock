import { Event } from '../../Event/Event';
import { bridge } from '../Bridge';
import { PlayerBreakBlockBeforeEvent } from '@minecraft/server';

// ブロック破壊イベントのカスタムデータ型
interface BlockBreakEventData {
    eventType: 'player_break_block';
    player: {
        id: string;
        name: string;
        location: {
            x: number;
            y: number;
            z: number;
        };
    };
    block: {
        typeId: string;
        location: {
            x: number;
            y: number;
            z: number;
        };
        permutation?: any;
    };
    tool?: {
        typeId: string;
        amount: number;
    };
    timestamp: number;
    gameMode?: string;
    dimension?: string;
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

            // カスタムイベントデータを構築
            const customEventData: BlockBreakEventData = {
                eventType: 'player_break_block',
                player: {
                    id: event.player.id,
                    name: event.player.name,
                    location: {
                        x: Math.floor(event.player.location.x),
                        y: Math.floor(event.player.location.y),
                        z: Math.floor(event.player.location.z)
                    }
                },
                block: {
                    typeId: event.block.typeId,
                    location: {
                        x: event.block.location.x,
                        y: event.block.location.y,
                        z: event.block.location.z
                    }
                },
                timestamp: Date.now(),
                dimension: event.player.dimension.id
            };

            // プレイヤーが持っているツールの情報を取得
            try {
                const inventory = event.player.getComponent('inventory');
                if (inventory && inventory.container) {
                    const selectedItem = inventory.container.getItem(event.player.selectedSlotIndex);
                    if (selectedItem) {
                        customEventData.tool = {
                            typeId: selectedItem.typeId,
                            amount: selectedItem.amount
                        };
                    }
                }
            } catch (toolError) {
                debugError('Error getting tool information:', toolError);
            }

            // ゲームモードの取得（可能な場合）
            try {
                // Note: ゲームモードの取得方法は環境によって異なる場合があります
                customEventData.gameMode = 'unknown'; // 実際の実装では適切な方法で取得
            } catch (gameModeError) {
                debugError('Error getting game mode:', gameModeError);
            }

            // ブロック詳細情報の取得
            try {
                if (event.block.permutation) {
                    customEventData.block.permutation = {
                        type: event.block.permutation.type.id,
                        // 他の permutation データも必要に応じて追加
                    };
                }
            } catch (permError) {
                debugError('Error getting block permutation:', permError);
            }

            debugLog(`Sending block break data: ${JSON.stringify(customEventData, null, 2)}`);

            // Bridgeを通してWebSocketに送信
            const success = await bridge.send(customEventData, `break_${event.player.id}_${Date.now()}`);
            
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
const breakEventBridge = {
    // イベントリスナー制御
    start: () => blockBreakEventHandler.start(),
    stop: () => blockBreakEventHandler.stop(),
    isActive: () => blockBreakEventHandler.isListenerActive(),
};

breakEventBridge.start();

export type { BlockBreakEventData };
export { BlockBreakEventHandler };
export default blockBreakEventHandler;

debugLog('BreakEvent Bridge initialized');
debugLog('Ready to capture and forward player block break events');

