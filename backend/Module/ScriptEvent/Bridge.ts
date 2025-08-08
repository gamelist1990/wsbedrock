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
            console.warn('⚠️ [DataBridge] ワールドが利用可能でないため、リスニングを延期します');

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

        debugLog(`Data listener started with ${this.pollingInterval}ms interval`);
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
     * 受信データ（Inbox）を取得
     */
    public async getInboxData(): Promise<CommunicationData[]> {
        try {
            const result = await jsonDB.list(this.INBOX_TABLE);
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
     * 古いデータをクリーンアップ
     */
    public async cleanupOldData(olderThanMs: number = 24 * 60 * 60 * 1000): Promise<void> {
        try {
            const cutoffTime = Date.now() - olderThanMs;
            debugLog(`Cleaning up data older than ${new Date(cutoffTime).toISOString()}`);

            // 実装簡略化 - 必要に応じて詳細な削除ロジックを追加
            await jsonDB.clear(this.OUTBOX_TABLE);
            await jsonDB.clear(this.INBOX_TABLE);

            debugLog('Cleanup completed');
        } catch (error) {
            debugError('Error during cleanup:', error);
        }
    }

    // プライベートメソッド

    /**
     * データをポーリングして処理
     */
    private async pollForData(): Promise<void> {
        try {
            // ワールドが利用可能かチェック
            if (!utils?.world?.hasWorlds()) {
                debugLog('Polling skipped: No worlds available');
                return;
            }

            // debugLog('Polling for incoming data...');

            // Inboxテーブルから新しいデータを取得
            const result = await jsonDB.list(this.INBOX_TABLE);

            if (!result.success || !result.data.items) {
                debugLog('No data found in inbox');
                return;
            }

            const dataItems = result.data.items
                .map((item: any) => ({ key: item.id, data: item.data as CommunicationData }))
                .sort((a, b) => a.data.timestamp - b.data.timestamp);

            //  debugLog(`Found ${dataItems.length} data items in inbox`);

            for (const { key, data } of dataItems) {
                await this.processIncomingData(data, key);
            }

        } catch (error) {
            debugError('Error polling for data:', error);
        }
    }

    /**
     * 受信データを処理
     */
    private async processIncomingData(data: CommunicationData, dataKey: number): Promise<void> {
        try {
            // データIDの重複チェック
            if (this.lastProcessedIds.has(data.id)) {
                return;
            }

            debugLog(`Processing data ${data.id}`);

            // データハンドラを実行
            for (const handler of this.dataHandlers) {
                try {
                    const response = await handler(data);

                    // ハンドラからレスポンスが返された場合、送信
                    if (response) {
                        await this.send(response.data, response.id);
                    }
                } catch (handlerError) {
                    debugError(`Error in data handler:`, handlerError);
                }
            }

            // 処理済みとしてマーク
            this.lastProcessedIds.add(data.id);

            // データを削除（処理済みなので）
            await jsonDB.delete(this.INBOX_TABLE, dataKey);

           // debugLog(`Data ${data.id} processed and removed from inbox`);

        } catch (error) {
            debugError(`Error processing data ${data.id}:`, error);
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

debugLog('DataBridge initialized');
debugLog('Ready for bidirectional data communication via MineScoreBoard JSON database');
