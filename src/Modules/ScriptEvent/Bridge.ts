import { system } from '@minecraft/server';
import { jsonDB } from './jsonScoreboardBridge';

// 汎用データ通信の型定義
interface CommunicationData {
    id: string;              // 任意のID（データを一意識別）
    timestamp: number;       // タイムスタンプ（Unix時間）
    data: any;              // 実際のデータ（任意の形式）
}

// レスポンス用の型定義
export interface BridgeResponse {
    id: string;
    timestamp: number;
    type: string;
    jsonData?: any;
}

// データハンドラの型定義（BridgeResponseまたはvoidを返す）
type DataHandler = (data: CommunicationData) => Promise<BridgeResponse | void>;

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
    private pollingInterval: number = 20; // 20tick = 1s
    private pollingTimer?: number;
    private lastProcessedIds: Set<string> = new Set(); // 処理済みデータID
    private isProcessingData: boolean = false;

    // テーブル名の定数
    private readonly OUTBOX_TABLE = 'data_bridge_outbox';    // Backend → Client
    private readonly INBOX_TABLE = 'data_bridge_inbox';     // Client → Backend

    private constructor() {
        debugLog('DataBridge instance created');
        // 初期化時にoutboxとinboxの全データを削除
        this.clearAllTables();
        // 自動でリスニング開始
        this.startListening();
    }

    public static getInstance(): DataBridge {
        if (!DataBridge.instance) {
            DataBridge.instance = new DataBridge();
        }
        return DataBridge.instance;
    }

    /**
     * データを送信（Client → Backend）
     */
    public async send(data: any, id?: string): Promise<boolean> {
        try {
            const timestamp = Date.now();
            const dataId = id || this.generateDataId();

            debugLog(`[CLIENT] Sending data to INBOX with ID: ${dataId}`);

            const communicationData: CommunicationData = {
                id: dataId,
                timestamp,
                data
            };

            // Inboxテーブルにデータを送信（Client → Backend）
            const dataKey = this.generateDataKey(dataId, timestamp);
            const result = jsonDB.set(this.INBOX_TABLE, dataKey, communicationData);

            if (result.success) {
                debugLog(`[CLIENT] Data sent successfully to INBOX with ID: ${dataId}`);
                return true;
            } else {
                debugError(`[CLIENT] Failed to send data to INBOX:`, result.error);
                return false;
            }
        } catch (error) {
            debugError(`[CLIENT] Error sending data:`, error);
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

        debugLog('Starting data listener');
        this.isListening = true;
        this.pollingTimer = system.runInterval(() => {
            this.pollForData();
        }, this.pollingInterval);

        debugLog(`Data listener started with ${this.pollingInterval}ms interval`);
        debugLog(`Listening for OUTBOX data on table: ${this.OUTBOX_TABLE}`);
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
        
        if (this.pollingTimer !== undefined) {
            system.clearRun(this.pollingTimer);
            this.pollingTimer = undefined;
        }

        debugLog('Data listener stopped');
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
     * 現在のリスニング状態を取得
     */
    public getListeningStatus(): { isListening: boolean; pollingInterval: number; handlersCount: number } {
        return {
            isListening: this.isListening,
            pollingInterval: this.pollingInterval,
            handlersCount: this.dataHandlers.length
        };
    }

    /**
     * 送信データ（Inbox: Client→Backend）を取得
     */
    public async getInboxData(): Promise<CommunicationData[]> {
        try {
            const result = jsonDB.list(this.INBOX_TABLE);
            if (result.success && result.data.items) {
                const data = result.data.items.map((item: any) => item.data as CommunicationData);
                return data.sort((a, b) => a.timestamp - b.timestamp);
            }
            return [];
        } catch (error) {
            debugError('Error getting inbox data:', error);
            return [];
        }
    }

    /**
     * 受信データ（Outbox: Backend→Client）を取得
     */
    public async getOutboxData(): Promise<CommunicationData[]> {
        try {
            const result = jsonDB.list(this.OUTBOX_TABLE);
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
     * 古いデータをクリーンアップ（クライアント側：INBOXの送信済み、OUTBOXの処理済み）
     */
    public async cleanupOldData(olderThanMs: number = 24 * 60 * 60 * 1000): Promise<void> {
        try {
            const cutoffTime = Date.now() - olderThanMs;
            debugLog(`[CLIENT] Cleaning up data older than ${new Date(cutoffTime).toISOString()}`);

            let cleanedCount = 0;

            // INBOX（送信済み）の古いデータを削除
            const inboxData = await this.getInboxData();
            for (const data of inboxData) {
                if (data.timestamp < cutoffTime) {
                    const dataKey = this.generateDataKey(data.id, data.timestamp);
                    const result = jsonDB.delete(this.INBOX_TABLE, dataKey);
                    if (result.success) {
                        cleanedCount++;
                    }
                }
            }

            // OUTBOX（処理済み）の古いデータを削除
            const outboxData = await this.getOutboxData();
            for (const data of outboxData) {
                if (data.timestamp < cutoffTime && this.lastProcessedIds.has(data.id)) {
                    const dataKey = this.generateDataKey(data.id, data.timestamp);
                    const result = jsonDB.delete(this.OUTBOX_TABLE, dataKey);
                    if (result.success) {
                        cleanedCount++;
                    }
                }
            }

            debugLog(`[CLIENT] Cleanup completed: removed ${cleanedCount} old items`);
        } catch (error) {
            debugError('[CLIENT] Error during cleanup:', error);
        }
    }

    // プライベートメソッド

    /**
     * 初期化時に全テーブルをクリア
     */
    private clearAllTables(): void {
        try {
            debugLog('Clearing all data tables on initialization...');

            // OUTBOXテーブルのスコアボードオブジェクトを削除（Backend → Client）
            const outboxResult = jsonDB.clear(this.OUTBOX_TABLE);
            if (outboxResult.success) {
                debugLog('OUTBOX scoreboard object cleared successfully');
            } else {
                debugError('Failed to clear OUTBOX scoreboard object:', outboxResult.error);
            }

            // INBOXテーブルのスコアボードオブジェクトを削除（Client → Backend）
            const inboxResult = jsonDB.clear(this.INBOX_TABLE);
            if (inboxResult.success) {
                debugLog('INBOX scoreboard object cleared successfully');
            } else {
                debugError('Failed to clear INBOX scoreboard object:', inboxResult.error);
            }

            // 処理済みIDセットもクリア
            this.lastProcessedIds.clear();
            debugLog('All scoreboard objects cleared and processed IDs reset');

        } catch (error) {
            debugError('Error clearing scoreboard objects during initialization:', error);
        }
    }

    /**
     * データをポーリングして処理（OUTBOX: Backend→Client）
     */
    private async pollForData(): Promise<void> {
        if (this.isProcessingData) {
            debugLog('[CLIENT] Skipping poll: already processing');
            return;
        }
        this.isProcessingData = true;
        try {
            const result = await jsonDB.list(this.OUTBOX_TABLE);
            if (!result.success) {
                debugError(`[CLIENT] Failed to list OUTBOX data:`, result.error);
                return;
            }
            if (!result.data || !result.data.items) {
                debugLog('[CLIENT] No data found in OUTBOX');
                return;
            }
            const dataItems = result.data.items
                .map((item: any) => ({ key: item.id, data: item.data as CommunicationData }))
                .filter(({ data }) => data && data.id && !this.lastProcessedIds.has(data.id))
                .sort((a, b) => a.data.timestamp - b.data.timestamp);
            for (const { key, data } of dataItems) {
                try {
                    await this.processIncomingData(data);
                    await this.deleteOutboxDataWithRetry(key, data.id);
                } catch (err) {
                    debugError(`[CLIENT] Error processing or deleting OUTBOX data:`, err);
                }
            }
        } catch (error) {
            debugError('[CLIENT] Error polling for OUTBOX data:', error);
        } finally {
            this.isProcessingData = false;
        }
    }

    /**
     * OUTBOXデータを削除（リトライ付き）
     */
    private async deleteOutboxDataWithRetry(key: number, dataId: string, maxRetries = 3): Promise<void> {
        let retry = 0;
        while (retry < maxRetries) {
            try {
                const deleteResult = await jsonDB.delete(this.OUTBOX_TABLE, key);
                if (deleteResult.success) {
                    debugLog(`[CLIENT] OUTBOX data ${dataId} deleted (key: ${key})`);
                    return;
                } else {
                    debugError(`[CLIENT] Failed to delete OUTBOX data ${dataId} (key: ${key}):`, deleteResult.error);
                }
            } catch (err) {
                debugError(`[CLIENT] Exception deleting OUTBOX data ${dataId} (key: ${key}):`, err);
            }
            retry++;
            await new Promise(res => setTimeout(res, 100 * retry));
        }
        debugError(`[CLIENT] Gave up deleting OUTBOX data ${dataId} after ${maxRetries} attempts.`);
    }

    /**
     * 受信データを処理（OUTBOX: Backend→Client）
     */
    private async processIncomingData(data: CommunicationData): Promise<void> {
        // データIDの重複チェック
        if (this.lastProcessedIds.has(data.id)) {
            debugLog(`[CLIENT] Data ${data.id} already processed, skipping`);
            return;
        }
        debugLog(`[CLIENT] Processing data ${data.id} from OUTBOX`);
        for (const handler of this.dataHandlers) {
            try {
                const response = await handler(data);
                // BridgeResponse型かつ必須プロパティが揃っているかチェック
                if (response && typeof response === 'object' && typeof response.id === 'string' && typeof response.timestamp === 'number' && typeof response.type === 'string') {
                    // INBOXに送信するデータを構築
                    const inboxData = {
                        id: response.id,
                        timestamp: response.timestamp,
                        type: response.type,
                        data: response.jsonData !== undefined ? response.jsonData : null
                    };
                    // 送信前にJSON化できるか検証
                    try {
                        JSON.stringify(inboxData);
                        debugLog(`[INBOX] Sending response to INBOX: ${JSON.stringify(inboxData)}`);
                        await this.send(inboxData, response.id);
                    } catch (jsonErr) {
                        debugError(`[INBOX] Handler response could not be stringified, skipping INBOX send:`, jsonErr);
                        debugError(`[INBOX] Problematic response:`, response);
                    }
                } else if (response) {
                    debugError(`[INBOX] Handler returned invalid response, skipping INBOX send:`, response);
                }
            } catch (handlerError) {
                debugError(`[CLIENT] Error in data handler:`, handlerError);
            }
        }
        this.lastProcessedIds.add(data.id);
        debugLog(`[CLIENT] Data ${data.id} processed and marked for cleanup`);
    }

    // cleanupProcessedOutboxDataは不要になったため削除

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
        const combined = `${dataId}_${timestamp}`;
        let hash = 0;
        for (let i = 0; i < combined.length; i++) {
            const char = combined.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 32bit整数に変換
        }
        return Math.abs(hash);
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
    
    // ステータス確認
    getListeningStatus: () => dataBridge.getListeningStatus(),
    
    // データ取得
    getOutboxData: () => dataBridge.getOutboxData(),
    getInboxData: () => dataBridge.getInboxData(),
    
    // メンテナンス
    cleanup: (olderThanMs?: number) => dataBridge.cleanupOldData(olderThanMs)
};

// 型エクスポート
export type { CommunicationData, DataHandler };

// クラスエクスポート
export { DataBridge };

// デフォルトエクスポート
export default dataBridge;

debugLog('[CLIENT] DataBridge initialized');
debugLog('[CLIENT] Ready for bidirectional data communication via jsonScoreboardBridge');
debugLog('[CLIENT] - Sends data to INBOX (Client → Backend)');
debugLog('[CLIENT] - Receives data from OUTBOX (Backend → Client)');
debugLog('[CLIENT] IMPORTANT: Remember to call bridge.startListening() to receive OUTBOX data!');
