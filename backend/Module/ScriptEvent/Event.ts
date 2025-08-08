import { bridge, CommunicationData } from './Bridge';
import { utils } from '../../index.js';

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
 * コンパクトなBlockBreakEventData型定義
 */
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

/**
 * player_break_blockイベントを処理してコンソールログに出力（コンパクト版）
 */
function handlePlayerBreakBlock(eventData: CompactBlockBreakEventData): void {
    // ワールドが利用可能かチェック
    if (!utils?.world?.hasWorlds()) {
        debugLog('Event handling skipped: No worlds available');
        console.warn('⚠️ [Event] ワールドが利用可能でないため、イベント処理をスキップしました');
        return;
    }

    debugLog('=== Player Break Block Event ===');
    console.log(`[BLOCK_BREAK] ${eventData.p.n} (${eventData.p.id}) broke a block`);
    console.log(`   Block: ${eventData.b.t}`);
    console.log(`   Block Position: X=${eventData.b.x}, Y=${eventData.b.y}, Z=${eventData.b.z}`);
    console.log(`   Player Position: X=${eventData.p.x}, Y=${eventData.p.y}, Z=${eventData.p.z}`);
    
    if (eventData.tool) {
        console.log(`   Tool: ${eventData.tool}`);
    } else {
        console.log(`   Tool: Hand/None`);
    }
    
    if (eventData.dim) {
        console.log(`   Dimension: ${eventData.dim}`);
    }
    
    console.log(`   Time: ${new Date(eventData.ts).toLocaleString()}`);
    console.log('================================');
}

/**
 * Data Bridgeからのデータを解析してイベント処理
 */
function processEventData(data: CommunicationData): void {
    try {
        // ワールドが利用可能かチェック
        if (!utils?.world?.hasWorlds()) {
            debugLog('Event processing skipped: No worlds available');
            console.warn('⚠️ [Event] ワールドが利用可能でないため、イベント処理をスキップしました');
            return;
        }

        debugLog(`Received data with ID: ${data.id}`);
        
        // コンパクトなplayer_break_blockイベントかどうかチェック
        if (data.data && typeof data.data === 'object' && data.data.type === 'break') {
            const eventData = data.data as CompactBlockBreakEventData;            
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
    debugLog('Initializing compact player_break_block event listener...');
    
    // ワールドが利用可能かチェック
    if (!utils?.world?.hasWorlds()) {
        debugLog('Event listener initialization delayed: No worlds available');
        
        // ワールドが追加されるまで待機してから初期化
        if (utils?.world) {
            utils.world.onWorldAdd(() => {
                initializeEventListenerInternal();
            });
        }
        return;
    }

    initializeEventListenerInternal();
}

/**
 * 内部的なイベントリスナー初期化処理
 */
function initializeEventListenerInternal(): void {
    // Data Bridgeにイベントハンドラを登録
    bridge.onReceive(async (data: CommunicationData) => {
        processEventData(data);
        
        // コンパクトなplayer_break_blockイベントの場合はACKレスポンスを返す
        if (data.data && data.data.type === 'break') {
            return {
                id: `ack_${data.id}`,
                timestamp: Date.now(),
                type: 'player_break_block', 
                jsonData: {
                    originalEventType: 'break',
                    p: data.data.p.n,
                    originalId: data.id,
                    processed: true
                }
            };
        }
    });
}




async function showEventStats(): Promise<void> {
    try {
        // ワールド状況をチェック
        const worldStatus = utils?.world?.getStatus();
        console.log('📊 [EVENT_STATS] Compact player_break_block Event Statistics');
        console.log(`   🌍 World Status: ${worldStatus?.hasWorlds ? 'Available' : 'Not Available'} (${worldStatus?.worldCount || 0} worlds)`);
        
        if (!utils?.world?.hasWorlds()) {
            console.log('   ⚠️ Warning: No worlds available - events cannot be processed');
            return;
        }

        const outboxData = await bridge.getOutboxData();
        const inboxData = await bridge.getInboxData();
        const processStats = bridge.getStats();
        
        console.log(`   📤 Sent events: ${outboxData.length}`);
        console.log(`   📥 Received events: ${inboxData.length}`);
        console.log(`   🔄 Processed IDs tracked: ${processStats.processedIdsCount}/${processStats.maxProcessedIds}`);
        console.log(`   🎧 Listening: ${processStats.isListening ? 'Active' : 'Inactive'}`);
        console.log(`   🧹 Auto-cleanup interval: ${processStats.cleanupInterval}ms`);
        
        // データ品質チェック
        let validInboxCount = 0;
        let invalidInboxCount = 0;
        let undefinedIdCount = 0;
        
        for (const data of inboxData) {
            if (!data || typeof data !== 'object') {
                invalidInboxCount++;
            } else if (!data.id || data.id === 'undefined' || typeof data.id !== 'string') {
                undefinedIdCount++;
            } else {
                validInboxCount++;
            }
        }
        
        console.log(`   ✅ Valid inbox data: ${validInboxCount}`);
        if (invalidInboxCount > 0) {
            console.log(`   ❌ Invalid inbox data: ${invalidInboxCount}`);
        }
        if (undefinedIdCount > 0) {
            console.log(`   ⚠️ Undefined ID data: ${undefinedIdCount}`);
        }
        
        // 未処理データがあるかチェック
        if (inboxData.length > 0) {
            console.log(`   ⚠️ Warning: ${inboxData.length} unprocessed events in inbox`);
        }
        
        // 最新のイベントを表示
        if (validInboxCount > 0) {
            // 有効なデータのみから最新を取得
            const validInboxData = inboxData.filter(data => 
                data && typeof data === 'object' && 
                data.id && data.id !== 'undefined' && typeof data.id === 'string'
            );
            
            if (validInboxData.length > 0) {
                const latestEvent = validInboxData[validInboxData.length - 1];
                console.log(`   🕐 Latest valid received: ${new Date(latestEvent.timestamp).toLocaleString()}`);
                
                if (latestEvent.data && latestEvent.data.type === 'break') {
                    console.log(`   📋 Event type: compact break`);
                    console.log(`   👤 Player: ${latestEvent.data.p?.n || 'Unknown'}`);
                    console.log(`   📦 Block: ${latestEvent.data.b?.t || 'Unknown'}`);
                }
            }
        }
        
        if (outboxData.length > 0) {
            const latestSent = outboxData[outboxData.length - 1];
            console.log(`   🕐 Latest sent: ${new Date(latestSent.timestamp).toLocaleString()}`);
        }
        
        // クリーンアップ提案
        if (invalidInboxCount > 0 || undefinedIdCount > 0) {
            console.log('   💡 Tip: Run force cleanup with /event forceCleanup to remove invalid data');
        } else if (inboxData.length > 10 || processStats.processedIdsCount > 500) {
            console.log('   💡 Tip: Consider running cleanup with /event cleanup');
        }
        
    } catch (error) {
        console.error('❌ [EVENT_STATS] Error getting statistics:', error);
    }
}




// 自動初期化
console.log('🎮 [EVENT_MODULE] Compact player_break_block Event module loaded');

// エクスポート
export { 
    handlePlayerBreakBlock, 
    processEventData,
    showEventStats
};

export type { 
    CompactBlockBreakEventData
};