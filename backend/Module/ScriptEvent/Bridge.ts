import { jsonDB } from './MineScoreBoard';
import { utils } from '../../index.js';

// 汎用データ通信の型定義
interface CommunicationData {
    id: string;              // 任意のID（データを一意識別）
    timestamp: number;       // タイムスタンプ（Unix時間）
    data: any;              // 実際のデータ（任意の形式）
}

// データハンドラの型定義
type DataHandler = (data: CommunicationData) => Promise<CommunicationData | void>;

// デバッグフラグ
const DEBUG_BRIDGE = true;

// デバッグ用ヘルパー
const debugLog = (message: string) => {
    if (DEBUG_BRIDGE) {
        console.log(`[DataBridge] ${message}`);
    }
};

const debugError = (message: string, error?: any) => {
    if (DEBUG_BRIDGE) {
        console.error(`[DataBridge] ${message}`, error);
    }
};

/**
 * 双方向データ通信のためのData Bridgeクラス
 * MineScoreBoardのJSONデータベースを使用してデータ通信を実現
 */
class DataBridge {
    private static instance: DataBridge;
    private dataHandlers: DataHandler[] = [];
    private isListening: boolean = false;
    private pollingInterval: number = 1000; // 1秒間隔でポーリング
    private pollingTimer?: NodeJS.Timeout;
    private lastProcessedIds: Set<string> = new Set(); // 処理済みデータID
    private deletedKeys: Set<number> = new Set(); // 削除済みキー追跡
    private cleanupInterval: number = 60000; // 1分間隔でクリーンアップ
    private cleanupTimer?: NodeJS.Timeout;
    private maxProcessedIds: number = 1000; // 処理済みID保持上限
    private isProcessingData: boolean = false; // データ処理中フラグ
    private isPerformingCleanup: boolean = false; // クリーンアップ中フラグ
    private processingQueue: CommunicationData[] = []; // 処理待ちキュー

    // テーブル名の定数
    private readonly OUTBOX_TABLE = 'data_bridge_outbox';    // Backend → Client
    private readonly INBOX_TABLE = 'data_bridge_inbox';     // Client → Backend

    private constructor() {
        debugLog('DataBridge instance created');
    }

    public static getInstance(): DataBridge {
        if (!DataBridge.instance) {
            DataBridge.instance = new DataBridge();
        }
        return DataBridge.instance;
    }

    /**
     * データを送信（Backend → Client）
     */
    public async send(data: any, id?: string): Promise<boolean> {
        try {
            // ワールドが利用可能かチェック
            if (!utils?.world?.hasWorlds()) {
                debugLog(`Send operation skipped: No worlds available`);
                console.warn('⚠️ [DataBridge] ワールドが利用可能でないため送信をスキップしました');
                return false;
            }

            const timestamp = Date.now();
            const dataId = id || this.generateDataId();

            debugLog(`Sending data with ID: ${dataId}`);

            const communicationData: CommunicationData = {
                id: dataId,
                timestamp,
                data
            };

            // OutboxテーブルにデータをJSONとして保存
            const dataKey = this.generateDataKey(dataId, timestamp);
            const result = await jsonDB.set(this.OUTBOX_TABLE, dataKey, communicationData);

            if (result.success) {
                debugLog(`Data sent successfully with ID: ${dataId}`);
                return true;
            } else {
                debugError(`Failed to send data:`, result.error);
                return false;
            }
        } catch (error) {
            debugError(`Error sending data:`, error);
            return false;
        }
    }

    /**
     * データハンドラを登録
     */
    public onReceive(handler: DataHandler): void {
        debugLog(`Registering data handler`);
        this.dataHandlers.push(handler);
        debugLog(`Total data handlers: ${this.dataHandlers.length}`);
    }

    /**
     * データリスニングを開始
     */
    public startListening(): void {
        if (this.isListening) {
            debugLog('Already listening for data');
            return;
        }

        // ワールドが利用可能かチェック
        if (!utils?.world?.hasWorlds()) {
            debugLog('Listening start delayed: No worlds available');

            // ワールドが追加されるまで待機してから開始
            if (utils?.world) {
                utils.world.onWorldAdd(() => {
                    debugLog('World detected, starting listening...');
                    console.log('✅ [DataBridge] ワールドが検出されました。リスニングを開始します');
                    this.startListeningInternal();
                });
            }
            return;
        }

        this.startListeningInternal();
    }

    /**
     * 内部的なリスニング開始処理
     */
    private startListeningInternal(): void {
        if (this.isListening) {
            return;
        }

        debugLog('Starting data listener');
        this.isListening = true;
        this.pollingTimer = setInterval(() => {
            this.pollForData();
        }, this.pollingInterval);

        // クリーンアップタイマーも開始
        this.cleanupTimer = setInterval(() => {
            this.performAutomaticCleanup();
        }, this.cleanupInterval);

        debugLog(`Data listener started with ${this.pollingInterval}ms interval`);
        debugLog(`Cleanup timer started with ${this.cleanupInterval}ms interval`);
    }

    /**
     * データリスニングを停止
     */
    public stopListening(): void {
        if (!this.isListening) {
            debugLog('Not currently listening');
            return;
        }

        debugLog('Stopping data listener');
        this.isListening = false;

        if (this.pollingTimer) {
            clearInterval(this.pollingTimer);
            this.pollingTimer = undefined;
        }

        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = undefined;
        }

        debugLog('Data listener and cleanup timer stopped');
    }

    /**
     * ポーリング間隔を設定
     */
    public setPollingInterval(intervalMs: number): void {
        this.pollingInterval = Math.max(100, intervalMs); // 最小100ms
        debugLog(`Polling interval set to ${this.pollingInterval}ms`);

        // リスニング中の場合は再起動
        if (this.isListening) {
            this.stopListening();
            this.startListening();
        }
    }

    /**
     * 送信データ（Outbox）を取得
     */
    public async getOutboxData(): Promise<CommunicationData[]> {
        try {
            const result = await jsonDB.list(this.OUTBOX_TABLE);
            if (result.success && result.data.items) {
                const data = result.data.items.map((item: any) => item.data as CommunicationData);
                return data.sort((a, b) => a.timestamp - b.timestamp);
            }
            return [];
        } catch (error) {
            debugError('Error getting outbox data:', error);
            return [];
        }
    }

    /**
     * 受信データ（Inbox）を取得（INBOXテーブル専用）
     */
    public async getInboxData(): Promise<CommunicationData[]> {
        try {
            debugLog(`[INBOX] Fetching data from table: ${this.INBOX_TABLE}`);
            const result = await jsonDB.list(this.INBOX_TABLE);
            if (result.success && result.data.items) {
                const data = result.data.items.map((item: any) => {
                    const commData = item.data as CommunicationData;
                    // データの出所を確認
                    debugLog(`[INBOX] Retrieved data ID: ${commData?.id || 'undefined'} from ${this.INBOX_TABLE}`);
                    return commData;
                });
                return data.sort((a, b) => a.timestamp - b.timestamp);
            }
            debugLog(`[INBOX] No data found in ${this.INBOX_TABLE}`);
            return [];
        } catch (error) {
            debugError(`Error getting ${this.INBOX_TABLE} data:`, error);
            return [];
        }
    }

    /**
     * 古いデータをクリーンアップ（INBOXのみ）
     */
    public async cleanupOldData(olderThanMs: number = 24 * 60 * 60 * 1000): Promise<void> {
        try {
            const cutoffTime = Date.now() - olderThanMs;
            debugLog(`Cleaning up INBOX data older than ${new Date(cutoffTime).toISOString()}`);

            let cleanedCount = 0;
            
            // Inboxの詳細クリーンアップ（INBOXのみ、OUTBOXは触らない）
            const inboxData = await this.getInboxData();
            for (const data of inboxData) {
                // データIDの検証
                if (!data || !data.id || data.id === 'undefined' || typeof data.id !== 'string') {
                    // 無効なデータを削除
                    const dataKey = this.generateDataKey(data?.id || 'invalid', data?.timestamp || Date.now());
                    await this.deleteInvalidData(dataKey);
                    cleanedCount++;
                    continue;
                }

                if (data.timestamp < cutoffTime) {
                    const dataKey = this.generateDataKey(data.id, data.timestamp);
                    await this.deleteProcessedData(dataKey, data.id);
                    cleanedCount++;
                }
            }

            // OUTBOXはクライアント側が管理するため削除しない
            debugLog(`Manual INBOX cleanup completed: removed ${cleanedCount} old items (OUTBOX left for client management)`);
        } catch (error) {
            debugError('Error during INBOX cleanup:', error);
        }
    }

    /**
     * 即座に処理済みデータをクリーンアップ（INBOXのみ）
     */
    public async cleanupProcessedData(): Promise<void> {
        try {
            debugLog('Cleaning up processed INBOX data...');
            
            const inboxData = await this.getInboxData();
            let cleanedCount = 0;
            
            for (const data of inboxData) {
                // データIDの検証
                if (!data || !data.id || data.id === 'undefined' || typeof data.id !== 'string') {
                    // 無効なデータを削除
                    const dataKey = this.generateDataKey(data?.id || 'invalid', data?.timestamp || Date.now());
                    await this.deleteInvalidData(dataKey);
                    cleanedCount++;
                    continue;
                }

                if (this.lastProcessedIds.has(data.id)) {
                    const dataKey = this.generateDataKey(data.id, data.timestamp);
                    await this.deleteProcessedData(dataKey, data.id);
                    cleanedCount++;
                }
            }
            
            debugLog(`Processed INBOX data cleanup completed: removed ${cleanedCount} processed/invalid items`);
        } catch (error) {
            debugError('Error during processed INBOX data cleanup:', error);
        }
    }

    /**
     * すべてのINBOXデータを強制クリーンアップ（処理済みIDもリセット）
     */
    public async forceCleanupAll(): Promise<void> {
        try {
            debugLog('Performing force cleanup of all INBOX data...');
            
            const inboxData = await this.getInboxData();
            let cleanedCount = 0;
            
            // すべてのInboxデータを削除
            for (const data of inboxData) {
                const dataKey = this.generateDataKey(data?.id || 'invalid', data?.timestamp || Date.now());
                await this.deleteInvalidData(dataKey);
                cleanedCount++;
            }
            
            // OUTBOXはクライアント側が管理するため削除しない
            
            // 処理済みIDセットを完全にリセット
            const oldProcessedCount = this.lastProcessedIds.size;
            this.lastProcessedIds.clear();
            
            debugLog(`Force INBOX cleanup completed: removed ${cleanedCount} INBOX items, cleared ${oldProcessedCount} processed IDs (OUTBOX left for client)`);
            console.log(`🧹 [DataBridge] Force INBOX cleanup completed: ${cleanedCount} INBOX items removed, ${oldProcessedCount} processed IDs cleared`);
            
        } catch (error) {
            debugError('Error during force INBOX cleanup:', error);
        }
    }

    /**
     * 処理済みID管理の統計情報を取得
     */
    public getProcessingStats(): {
        processedIdsCount: number;
        maxProcessedIds: number;
        isListening: boolean;
        cleanupInterval: number;
        isProcessingData: boolean;
        isPerformingCleanup: boolean;
        processingQueueSize: number;
        deletedKeysCount: number;
    } {
        return {
            processedIdsCount: this.lastProcessedIds.size,
            maxProcessedIds: this.maxProcessedIds,
            isListening: this.isListening,
            cleanupInterval: this.cleanupInterval,
            isProcessingData: this.isProcessingData,
            isPerformingCleanup: this.isPerformingCleanup,
            processingQueueSize: this.processingQueue.length,
            deletedKeysCount: this.deletedKeys.size
        };
    }

    // プライベートメソッド

    /**
     * データをポーリングして処理（INBOXテーブル専用）
     */
    private async pollForData(): Promise<void> {
        try {
            // 処理中またはクリーンアップ中の場合はスキップ
            if (this.isProcessingData || this.isPerformingCleanup) {
                return;
            }

            // ワールドが利用可能かチェック
            if (!utils?.world?.hasWorlds()) {
                debugLog('Polling skipped: No worlds available');
                return;
            }

            this.isProcessingData = true;

            try {
                // INBOXテーブルから新しいデータを取得（厳格にテーブル名を指定）
                const result = await jsonDB.list(this.INBOX_TABLE);

                if (!result.success || !result.data.items) {
                    return;
                }

                // 取得したデータの検証を強化
                const dataItems = result.data.items
                    .map((item: any) => ({ 
                        key: item.id, 
                        data: item.data as CommunicationData,
                        tableSource: this.INBOX_TABLE
                    }))
                    .filter(({ key, data, tableSource }) => {
                        // 削除済みキーを事前にフィルタリング
                        if (this.deletedKeys.has(key)) {
                            return false;
                        }
                        
                        // 無効なデータをフィルタリング
                        if (!data || typeof data !== 'object') {
                            return false;
                        }
                        
                        // INBOXテーブルのデータであることを再確認
                        if (tableSource !== this.INBOX_TABLE) {
                            return false;
                        }
                        
                        return true;
                    })
                    .sort((a, b) => (a.data.timestamp || 0) - (b.data.timestamp || 0));

                // 処理対象のデータがある場合のみ処理
                if (dataItems.length > 0) {
                    debugLog(`[INBOX] Found ${dataItems.length} unprocessed data items in INBOX table`);

                    // データを処理キューに追加（既存のキューと重複しないよう確認）
                    const newData = dataItems.filter(({ data }) => 
                        !this.processingQueue.some(queued => queued.id === data.id)
                    );

                    if (newData.length > 0) {
                        // キューに追加
                        this.processingQueue.push(...newData.map(item => ({ ...item.data, _key: item.key })));
                        
                        // キューを順次処理
                        await this.processDataQueue();
                    }
                }

            } finally {
                this.isProcessingData = false;
            }

        } catch (error) {
            this.isProcessingData = false;
            debugError('Error polling for INBOX data:', error);
        }
    }

    /**
     * 処理キューを順次処理
     */
    private async processDataQueue(): Promise<void> {
        while (this.processingQueue.length > 0) {
            const data = this.processingQueue.shift();
            if (!data) continue;

            const dataKey = (data as any)._key;
            delete (data as any)._key;

            await this.processIncomingData(data, dataKey);
            
            // 処理間隔を設ける（削除処理の完了を待つ）
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    /**
     * 受信データを処理（INBOXテーブル専用）
     */
    private async processIncomingData(data: CommunicationData, dataKey: number): Promise<void> {
        try {
            // 削除済みキーのチェック
            if (this.deletedKeys.has(dataKey)) {
                return;
            }

            // データの基本検証
            if (!data || typeof data !== 'object') {
                debugLog(`[INBOX] Invalid data object received, deleting from INBOX table (key: ${dataKey})`);
                await this.deleteInvalidDataSafely(dataKey);
                return;
            }

            // データIDの検証
            if (!data.id || data.id === 'undefined' || typeof data.id !== 'string') {
                debugLog(`[INBOX] Invalid or undefined data ID received, deleting from INBOX table (key: ${dataKey})`);
                await this.deleteInvalidDataSafely(dataKey);
                return;
            }

            // データIDの重複チェック
            if (this.lastProcessedIds.has(data.id)) {
                debugLog(`[INBOX] Data ${data.id} already processed, deleting duplicate from INBOX (key: ${dataKey})`);
                await this.deleteProcessedDataSafely(dataKey, data.id);
                return;
            }

            debugLog(`[INBOX] Processing data ${data.id} from INBOX table`);

            // 処理中のデータをすぐにマークして重複処理を防ぐ
            this.markAsProcessed(data.id);

            try {
                // データハンドラを実行
                for (const handler of this.dataHandlers) {
                    try {
                        const response = await handler(data);

                        // ハンドラからレスポンスが返された場合、OUTBOXに送信
                        if (response) {
                            await this.send(response.data, response.id);
                        }
                    } catch (handlerError) {
                        debugError(`Error in data handler:`, handlerError);
                    }
                }

                // 処理完了後にINBOXからデータを削除
                await this.deleteProcessedDataSafely(dataKey, data.id);
                debugLog(`[INBOX] Data ${data.id} processed and removed from INBOX table`);

            } catch (processingError) {
                // 処理エラーの場合、処理済みマークを削除
                this.lastProcessedIds.delete(data.id);
                debugError(`Error processing INBOX data ${data.id}, unmarking as processed:`, processingError);
                throw processingError;
            }

        } catch (error) {
            debugError(`Error processing INBOX data ${data?.id || 'unknown'}:`, error);
        }
    }

    /**
     * データIDを生成
     */
    private generateDataId(): string {
        return `data_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * データキーを生成
     */
    private generateDataKey(dataId: string, timestamp: number): number {
        // データIDとタイムスタンプの検証
        if (!dataId || dataId === 'undefined' || typeof dataId !== 'string') {
            debugLog(`Invalid dataId for key generation: ${dataId}, using fallback`);
            dataId = `invalid_${Date.now()}_${Math.random()}`;
        }

        if (!timestamp || isNaN(timestamp)) {
            debugLog(`Invalid timestamp for key generation: ${timestamp}, using current time`);
            timestamp = Date.now();
        }

        const combined = `${dataId}_${timestamp}`;
        let hash = 0;
        for (let i = 0; i < combined.length; i++) {
            const char = combined.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 32bit整数に変換
        }
        return Math.abs(hash);
    }

    /**
     * データを処理済みとしてマーク
     */
    private markAsProcessed(dataId: string): void {
        // データIDの検証
        if (!dataId || dataId === 'undefined' || typeof dataId !== 'string') {
            debugLog(`Attempted to mark invalid dataId as processed: ${dataId}`);
            return;
        }

        this.lastProcessedIds.add(dataId);
        
        // 処理済みIDが上限を超えた場合、古いものを削除
        if (this.lastProcessedIds.size > this.maxProcessedIds) {
            const idsArray = Array.from(this.lastProcessedIds);
            const toRemove = idsArray.slice(0, idsArray.length - this.maxProcessedIds);
            for (const id of toRemove) {
                this.lastProcessedIds.delete(id);
            }
            debugLog(`Cleaned up ${toRemove.length} old processed IDs`);
        }
    }

    /**
     * 無効なデータを安全に削除（INBOXテーブル専用、再試行付き、競合回避、削除検証付き）
     */
    private async deleteInvalidDataSafely(dataKey: number): Promise<void> {
        // 既に削除済みの場合はスキップ
        if (this.deletedKeys.has(dataKey)) {
            return;
        }

        const maxRetries = 3;
        let retryCount = 0;
        
        while (retryCount < maxRetries) {
            try {
                // クリーンアップ処理中は待機
                while (this.isPerformingCleanup) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

                debugLog(`[INBOX] Deleting invalid data from ${this.INBOX_TABLE} (key: ${dataKey}) - attempt ${retryCount + 1}/${maxRetries}`);
                const deleteResult = await jsonDB.delete(this.INBOX_TABLE, dataKey);
                
                if (deleteResult.success || 
                    (deleteResult.data && deleteResult.data.verified === true) ||
                    deleteResult.error?.toString().includes('not found')) {
                    
                    // 削除成功または既に存在しない場合
                    debugLog(`[INBOX] Successfully deleted invalid data from ${this.INBOX_TABLE} (key: ${dataKey})${deleteResult.data?.verified ? ' (verified)' : ''}`);
                    
                    // 削除済みキーを追跡
                    this.deletedKeys.add(dataKey);
                    this.maintainDeletedKeysSize();
                    return;
                } else {
                    debugLog(`[INBOX] Delete attempt ${retryCount + 1} failed for key ${dataKey}: ${deleteResult.error || 'Unknown error'}`);
                    
                    if (retryCount === maxRetries - 1) {
                        debugError(`[INBOX] Failed to delete invalid data from ${this.INBOX_TABLE} (key: ${dataKey}) after all attempts:`, deleteResult.error);
                    }
                }
            } catch (error) {
                if (retryCount === maxRetries - 1) {
                    debugError(`[INBOX] Error deleting invalid data from ${this.INBOX_TABLE} (key: ${dataKey}) after all attempts:`, error);
                }
            }
            
            retryCount++;
            if (retryCount < maxRetries) {
                // 次の試行前に短時間待機（指数バックオフ）
                await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, retryCount)));
            }
        }
        
        // 最終的に削除に失敗した場合でも追跡キーに追加（無限ループを防ぐ）
        this.deletedKeys.add(dataKey);
    }

    /**
     * 処理済みデータを安全に削除（INBOXテーブル専用、再試行付き、競合回避）
     */
    private async deleteProcessedDataSafely(dataKey: number, dataId: string): Promise<void> {
        try {
            // データIDの検証
            if (!dataId || dataId === 'undefined') {
                debugLog(`[INBOX] Attempted to delete data with invalid ID: ${dataId}, using key-only deletion from ${this.INBOX_TABLE}`);
                await this.deleteInvalidDataSafely(dataKey);
                return;
            }

            // 既に削除済みの場合はスキップ
            if (this.deletedKeys.has(dataKey)) {
                return;
            }

            const maxRetries = 3;
            let retryCount = 0;
            
            while (retryCount < maxRetries) {
                try {
                    // クリーンアップ処理中は待機
                    while (this.isPerformingCleanup) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }

                    debugLog(`[INBOX] Attempting to delete processed data from table: ${this.INBOX_TABLE}, ID: ${dataId} (key: ${dataKey}) - attempt ${retryCount + 1}/${maxRetries}`);
                    const deleteResult = await jsonDB.delete(this.INBOX_TABLE, dataKey);
                    
                    if (deleteResult.success || 
                        (deleteResult.data && deleteResult.data.verified === true) ||
                        deleteResult.error?.toString().includes('not found')) {
                        
                        // 削除成功、検証済み、または既に存在しない場合
                        const status = deleteResult.success ? 'success' : 
                                      deleteResult.data?.verified ? 'verified' : 'not found';
                        
                        debugLog(`[INBOX] Successfully deleted processed data ${dataId} from ${this.INBOX_TABLE} (key: ${dataKey}) - ${status}`);
                        
                        // 削除済みキーを追跡
                        this.deletedKeys.add(dataKey);
                        this.maintainDeletedKeysSize();
                        return;
                    } else {
                        debugLog(`[INBOX] Delete attempt ${retryCount + 1} failed for ${dataId} (key: ${dataKey}): ${deleteResult.error || 'Unknown error'}`);
                        
                        if (retryCount === maxRetries - 1) {
                            debugError(`[INBOX] Failed to delete processed data ${dataId} from ${this.INBOX_TABLE}:`, deleteResult.error);
                            
                            // デバッグ情報として削除に失敗したデータの詳細を記録
                            if (deleteResult.data) {
                                debugLog(`[INBOX] Failed deletion details for ${dataId}: ${JSON.stringify(deleteResult.data).substring(0, 200)}...`);
                            }
                        }
                    }
                } catch (error) {
                    if (retryCount === maxRetries - 1) {
                        debugError(`[INBOX] Error deleting processed data ${dataId} from ${this.INBOX_TABLE}:`, error);
                    }
                }
                
                retryCount++;
                if (retryCount < maxRetries) {
                    // 次の試行前に短時間待機（指数バックオフ）
                    await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, retryCount)));
                }
            }
            
            // 最終的に削除に失敗した場合でも追跡キーに追加（無限ループを防ぐ）
            debugLog(`[INBOX] Marking key ${dataKey} as deleted despite failures to prevent infinite loops`);
            this.deletedKeys.add(dataKey);
            
        } catch (error) {
            debugError(`[INBOX] Error in deleteProcessedDataSafely for ${dataId}:`, error);
            // 例外が発生した場合も追跡キーに追加
            this.deletedKeys.add(dataKey);
        }
    }

    /**
     * 削除済みキーセットのサイズを維持
     */
    private maintainDeletedKeysSize(): void {
        if (this.deletedKeys.size > 10000) {
            const keysArray = Array.from(this.deletedKeys);
            const toKeep = keysArray.slice(-5000); // 新しい5000個を保持
            this.deletedKeys.clear();
            toKeep.forEach(key => this.deletedKeys.add(key));
        }
    }
    private async deleteInvalidData(dataKey: number): Promise<void> {
        const maxRetries = 3;
        let retryCount = 0;
        
        while (retryCount < maxRetries) {
            try {
                // 最初の試行のみログ出力（スパムを減らす）
                if (retryCount === 0) {
                    debugLog(`[INBOX] Deleting invalid data from ${this.INBOX_TABLE} (key: ${dataKey})`);
                }
                const deleteResult = await jsonDB.delete(this.INBOX_TABLE, dataKey);
                
                if (deleteResult.success) {
                    if (retryCount > 0) {
                        debugLog(`[INBOX] Successfully deleted invalid data from ${this.INBOX_TABLE} (key: ${dataKey}) after ${retryCount + 1} attempts`);
                    } else {
                        debugLog(`[INBOX] Successfully deleted invalid data from ${this.INBOX_TABLE} (key: ${dataKey})`);
                    }
                    
                    // 削除済みキーを追跡
                    this.deletedKeys.add(dataKey);
                    
                    // 削除済みキーのサイズ制限（メモリ効率のため）
                    if (this.deletedKeys.size > 10000) {
                        const keysArray = Array.from(this.deletedKeys);
                        const toKeep = keysArray.slice(-5000); // 新しい5000個を保持
                        this.deletedKeys.clear();
                        toKeep.forEach(key => this.deletedKeys.add(key));
                    }
                    
                    return; // 成功したら終了
                } else {
                    if (retryCount === maxRetries - 1) {
                        debugError(`[INBOX] Failed to delete invalid data from ${this.INBOX_TABLE} (key: ${dataKey}) after all attempts:`, deleteResult.error);
                    }
                }
            } catch (error) {
                if (retryCount === maxRetries - 1) {
                    debugError(`[INBOX] Error deleting invalid data from ${this.INBOX_TABLE} (key: ${dataKey}) after all attempts:`, error);
                }
            }
            
            retryCount++;
            if (retryCount < maxRetries) {
                // 次の試行前に短時間待機
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        debugError(`[INBOX] Failed to delete invalid data after ${maxRetries} attempts (key: ${dataKey})`);
    }

    /**
     * 処理済みデータを削除（INBOXテーブル専用、再試行付き）
     */
    private async deleteProcessedData(dataKey: number, dataId: string): Promise<void> {
        try {
            // データIDの検証
            if (!dataId || dataId === 'undefined') {
                debugLog(`[INBOX] Attempted to delete data with invalid ID: ${dataId}, using key-only deletion from ${this.INBOX_TABLE}`);
                await this.deleteInvalidData(dataKey);
                return;
            }

            const maxRetries = 3;
            let retryCount = 0;
            
            while (retryCount < maxRetries) {
                try {
                    debugLog(`[INBOX] Attempting to delete processed data from table: ${this.INBOX_TABLE}, ID: ${dataId} (key: ${dataKey}) - attempt ${retryCount + 1}/${maxRetries}`);
                    const deleteResult = await jsonDB.delete(this.INBOX_TABLE, dataKey);
                    
                    if (deleteResult.success) {
                        debugLog(`[INBOX] Successfully deleted processed data ${dataId} from ${this.INBOX_TABLE} (key: ${dataKey})`);
                        
                        // 削除済みキーを追跡
                        this.deletedKeys.add(dataKey);
                        
                        // 削除済みキーのサイズ制限（メモリ効率のため）
                        if (this.deletedKeys.size > 10000) {
                            const keysArray = Array.from(this.deletedKeys);
                            const toKeep = keysArray.slice(-5000); // 新しい5000個を保持
                            this.deletedKeys.clear();
                            toKeep.forEach(key => this.deletedKeys.add(key));
                        }
                        
                        return; // 成功したら終了
                    } else {
                        debugError(`[INBOX] Failed to delete processed data ${dataId} from ${this.INBOX_TABLE} - attempt ${retryCount + 1}:`, deleteResult.error);
                    }
                } catch (error) {
                    debugError(`[INBOX] Error deleting processed data ${dataId} from ${this.INBOX_TABLE} - attempt ${retryCount + 1}:`, error);
                }
                
                retryCount++;
                if (retryCount < maxRetries) {
                    // 次の試行前に短時間待機
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            
            debugError(`[INBOX] Failed to delete processed data ${dataId} after ${maxRetries} attempts (key: ${dataKey})`);
            
        } catch (error) {
            debugError(`[INBOX] Error in deleteProcessedData for ${dataId}:`, error);
        }
    }

    /**
     * 自動クリーンアップ実行（INBOXのみ、競合回避版）
     */
    private async performAutomaticCleanup(): Promise<void> {
        try {
            // 既にクリーンアップ中またはデータ処理中の場合はスキップ
            if (this.isPerformingCleanup || this.isProcessingData) {
                return;
            }

            this.isPerformingCleanup = true;
            
            try {
                debugLog('Performing automatic INBOX cleanup...');
                
                // 古いデータをクリーンアップ（1時間以上古いデータ）
                const oneHourAgo = Date.now() - (60 * 60 * 1000);
                
                // 受信データ（INBOX）のみの確認 - OUTBOXは触らない
                const inboxData = await this.getInboxData();
                let cleanedCount = 0;
                
                for (const data of inboxData) {
                    // 削除済みキーのチェック
                    const dataKey = this.generateDataKey(data?.id || 'invalid', data?.timestamp || Date.now());
                    if (this.deletedKeys.has(dataKey)) {
                        continue;
                    }

                    // データIDの検証
                    if (!data || !data.id || data.id === 'undefined' || typeof data.id !== 'string') {
                        // 無効なデータを削除
                        await this.deleteInvalidData(dataKey);
                        cleanedCount++;
                        continue;
                    }

                    if (data.timestamp < oneHourAgo || this.lastProcessedIds.has(data.id)) {
                        // 古いデータまたは処理済みデータを削除（INBOXのみ）
                        await this.deleteProcessedData(dataKey, data.id);
                        cleanedCount++;
                    }

                    // 処理間隔を設ける（過負荷を防ぐ）
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
                
                if (cleanedCount > 0) {
                    debugLog(`Automatic INBOX cleanup completed: removed ${cleanedCount} old/processed/invalid items`);
                }
                
                // 処理済みIDセットのクリーンアップ（メモリ効率のため）
                if (this.lastProcessedIds.size > this.maxProcessedIds * 1.2) {
                    const idsArray = Array.from(this.lastProcessedIds);
                    const toKeep = idsArray.slice(-this.maxProcessedIds);
                    this.lastProcessedIds.clear();
                    toKeep.forEach(id => this.lastProcessedIds.add(id));
                    debugLog(`Cleaned up processed IDs set, kept ${toKeep.length} recent IDs`);
                }
                
            } finally {
                this.isPerformingCleanup = false;
            }
            
        } catch (error) {
            this.isPerformingCleanup = false;
            debugError('Error during automatic INBOX cleanup:', error);
        }
    }

    /**
     * INBOXテーブル全体を強制削除（最終手段）
     */
    public async forceDeleteAllInboxData(): Promise<void> {
        try {
            debugLog('Performing FORCE DELETE of entire INBOX table...');
            
            // テーブル全体を削除（実装依存）
            const deleteAllResult = await jsonDB.clear?.(this.INBOX_TABLE);
            
            if (deleteAllResult?.success) {
                debugLog('Successfully cleared entire INBOX table');
                console.log(`🧹 [DataBridge] FORCE DELETE: Entire INBOX table cleared`);
            } else {
                // clearメソッドがない場合、個別削除でフォールバック
                debugLog('Clear method not available, falling back to individual deletion');
                const inboxData = await this.getInboxData();
                let deletedCount = 0;
                
                for (const data of inboxData) {
                    const dataKey = this.generateDataKey(data?.id || 'force_delete', data?.timestamp || Date.now());
                    try {
                        const result = await jsonDB.delete(this.INBOX_TABLE, dataKey);
                        if (result.success) {
                            deletedCount++;
                        }
                    } catch (error) {
                        debugError(`Error force deleting data with key ${dataKey}:`, error);
                    }
                }
                
                debugLog(`Force deleted ${deletedCount} items from INBOX table`);
                console.log(`🧹 [DataBridge] FORCE DELETE: ${deletedCount} items forcefully removed from INBOX`);
            }
            
            // 全ての追跡データをリセット
            this.deletedKeys.clear();
            this.lastProcessedIds.clear();
            debugLog('All tracking data cleared');
            
        } catch (error) {
            debugError('Error during force delete of INBOX table:', error);
        }
    }
}

// グローバルインスタンス
const dataBridge = DataBridge.getInstance();

// 簡単なAPI関数エクスポート
export const bridge = {
    // データ送信
    send: (data: any, id?: string) => dataBridge.send(data, id),

    // データハンドラ登録
    onReceive: (handler: DataHandler) => dataBridge.onReceive(handler),

    // リスニング制御
    startListening: () => dataBridge.startListening(),
    stopListening: () => dataBridge.stopListening(),
    setPollingInterval: (intervalMs: number) => dataBridge.setPollingInterval(intervalMs),

    // データ取得
    getOutboxData: () => dataBridge.getOutboxData(),
    getInboxData: () => dataBridge.getInboxData(),

    // クリーンアップ（強化版）
    cleanup: (olderThanMs?: number) => dataBridge.cleanupOldData(olderThanMs),
    cleanupProcessed: () => dataBridge.cleanupProcessedData(),
    forceCleanup: () => dataBridge.forceCleanupAll(),
    
    // 統計情報
    getStats: () => dataBridge.getProcessingStats(),
    
    // 強制全削除（データベーステーブル全体をクリア）
    forceDeleteAll: () => dataBridge.forceDeleteAllInboxData()
};

// 型エクスポート
export type { CommunicationData, DataHandler };

// クラスエクスポート
export { DataBridge };

// デフォルトエクスポート
export default dataBridge;

debugLog('DataBridge initialized');
debugLog('Ready for bidirectional data communication via MineScoreBoard JSON database');
