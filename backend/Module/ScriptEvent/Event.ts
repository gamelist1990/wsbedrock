import { bridge, CommunicationData } from './Bridge';

/**
 * player_break_block イベント専用ハンドラ
 */

// デバッグフラグ
const DEBUG_EVENT = true;

// デバッグ用ヘルパー
const debugLog = (message: string) => {
    if (DEBUG_EVENT) {
        console.log(`[Event] ${message}`);
    }
};

/**
 * BlockBreakEventData型定義
 */
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

/**
 * player_break_blockイベントを処理してコンソールログに出力
 */
function handlePlayerBreakBlock(eventData: BlockBreakEventData): void {
    debugLog('=== Player Break Block Event ===');
    console.log(`🔨 [BLOCK_BREAK] ${eventData.player.name} (${eventData.player.id}) broke a block`);
    console.log(`   📦 Block: ${eventData.block.typeId}`);
    console.log(`   📍 Block Position: X=${eventData.block.location.x}, Y=${eventData.block.location.y}, Z=${eventData.block.location.z}`);
    console.log(`   🧍 Player Position: X=${eventData.player.location.x}, Y=${eventData.player.location.y}, Z=${eventData.player.location.z}`);
    
    if (eventData.tool) {
        console.log(`   🔧 Tool: ${eventData.tool.typeId} (Amount: ${eventData.tool.amount})`);
    } else {
        console.log(`   ✋ Tool: Hand/None`);
    }
    
    if (eventData.gameMode) {
        console.log(`   🎮 Game Mode: ${eventData.gameMode}`);
    }
    
    if (eventData.dimension) {
        console.log(`   🌍 Dimension: ${eventData.dimension}`);
    }
    
    if (eventData.block.permutation) {
        console.log(`   🔍 Block Permutation: ${JSON.stringify(eventData.block.permutation)}`);
    }
    
    console.log(`   ⏰ Time: ${new Date(eventData.timestamp).toLocaleString()}`);
    console.log('================================');
}

/**
 * Data Bridgeからのデータを解析してイベント処理
 */
function processEventData(data: CommunicationData): void {
    try {
        debugLog(`Received data with ID: ${data.id}`);
        
        // player_break_blockイベントかどうかチェック
        if (data.data && typeof data.data === 'object' && data.data.eventType === 'player_break_block') {
            const eventData = data.data as BlockBreakEventData;
            debugLog(`Processing player_break_block event`);
            
            handlePlayerBreakBlock(eventData);
        }
    } catch (error) {
        console.error('❌ [EVENT_ERROR] Error processing event data:', error);
        console.error('   📦 Raw data:', JSON.stringify(data, null, 2));
    }
}

/**
 * イベントリスナーを初期化
 */
export function initializeEventListener(): void {
    debugLog('Initializing player_break_block event listener...');
    
    // Data Bridgeにイベントハンドラを登録
    bridge.onReceive(async (data: CommunicationData) => {
        processEventData(data);
        
        // player_break_blockイベントの場合はACKレスポンスを返す
        if (data.data && data.data.eventType === 'player_break_block') {
            return {
                id: `ack_${data.id}`,
                timestamp: Date.now(),
                data: {
                    type: 'event_acknowledged',
                    originalEventType: 'player_break_block',
                    originalId: data.id,
                    processed: true
                }
            };
        }
    });
    
    debugLog('Event listener initialized successfully');
    console.log('🎮 [EVENT_SYSTEM] player_break_block event listener is ready');
    console.log('   📡 Listening for player_break_block events only');
    console.log('   🔗 Using Data Bridge for communication');
}

/**
 * テスト用のサンプルイベント送信
 */
export async function sendTestEvent(): Promise<void> {
    debugLog('Sending test player_break_block event...');
    
    const testEvent: BlockBreakEventData = {
        eventType: 'player_break_block',
        player: {
            id: 'test_player_123',
            name: 'TestPlayer',
            location: {
                x: 100,
                y: 65,
                z: 200
            }
        },
        block: {
            typeId: 'minecraft:stone',
            location: {
                x: 100,
                y: 64,
                z: 200
            }
        },
        tool: {
            typeId: 'minecraft:diamond_pickaxe',
            amount: 1
        },
        timestamp: Date.now(),
        gameMode: 'survival',
        dimension: 'overworld'
    };
    
    const success = await bridge.send(testEvent, 'test_break_block_event');
    
    if (success) {
        debugLog('Test event sent successfully');
        console.log('✅ [TEST] Test player_break_block event sent');
    } else {
        console.error('❌ [TEST] Failed to send test event');
    }
}

/**
 * 統計情報表示
 */
export async function showEventStats(): Promise<void> {
    try {
        const outboxData = await bridge.getOutboxData();
        const inboxData = await bridge.getInboxData();
        
        console.log('📊 [EVENT_STATS] player_break_block Event Statistics');
        console.log(`   📤 Sent events: ${outboxData.length}`);
        console.log(`   📥 Received events: ${inboxData.length}`);
        
        // 最新のイベントを表示
        if (inboxData.length > 0) {
            const latestEvent = inboxData[inboxData.length - 1];
            console.log(`   🕐 Latest received: ${new Date(latestEvent.timestamp).toLocaleString()}`);
            
            if (latestEvent.data.eventType === 'player_break_block') {
                console.log(`   📋 Event type: player_break_block`);
                console.log(`   👤 Player: ${latestEvent.data.player?.name || 'Unknown'}`);
                console.log(`   📦 Block: ${latestEvent.data.block?.typeId || 'Unknown'}`);
            }
        }
        
        if (outboxData.length > 0) {
            const latestSent = outboxData[outboxData.length - 1];
            console.log(`   🕐 Latest sent: ${new Date(latestSent.timestamp).toLocaleString()}`);
        }
        
    } catch (error) {
        console.error('❌ [EVENT_STATS] Error getting statistics:', error);
    }
}

// 自動初期化
console.log('� [EVENT_MODULE] player_break_block Event module loaded');

// エクスポート
export { 
    handlePlayerBreakBlock, 
    processEventData 
};

export type { 
    BlockBreakEventData 
};
