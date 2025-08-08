import { UtilManager } from './UtilManager.js';

/**
 * ワールド状況チェック用のユーティリティクラス
 * DataBridgeやイベントシステムでワールドが利用可能かどうかを確認するためのヘルパー
 */
export class WorldChecker {
    private static instance: WorldChecker | null = null;
    private utilManager: UtilManager;

    private constructor() {
        this.utilManager = UtilManager.getInstance();
    }

    /**
     * シングルトンインスタンスを取得
     */
    public static getInstance(): WorldChecker {
        if (!WorldChecker.instance) {
            WorldChecker.instance = new WorldChecker();
        }
        return WorldChecker.instance;
    }

    /**
     * ワールドが利用可能かどうかをチェック
     * @returns ワールドが利用可能な場合true
     */
    public hasWorlds(): boolean {
        try {
            return this.utilManager.world.hasWorlds();
        } catch (error) {
            console.error('❌ [WorldChecker] Error checking world availability:', error);
            return false;
        }
    }

    /**
     * 特定のワールドが利用可能かどうかをチェック
     * @param worldName ワールド名
     * @returns 指定されたワールドが利用可能な場合true
     */
    public hasWorld(worldName: string): boolean {
        try {
            return this.utilManager.world.hasWorld(worldName);
        } catch (error) {
            console.error(`❌ [WorldChecker] Error checking world '${worldName}':`, error);
            return false;
        }
    }

    /**
     * ワールド状況の詳細情報を取得
     * @returns ワールド状況の詳細
     */
    public getWorldStatus(): {
        hasWorlds: boolean;
        worldCount: number;
        worldNames: string[];
        initialized: boolean;
    } {
        try {
            return this.utilManager.world.getStatus();
        } catch (error) {
            console.error('❌ [WorldChecker] Error getting world status:', error);
            return {
                hasWorlds: false,
                worldCount: 0,
                worldNames: [],
                initialized: false
            };
        }
    }

    /**
     * ワールドが利用可能でない場合の処理をスキップする関数デコレータ
     * @param func 実行する関数
     * @param errorMessage スキップ時のエラーメッセージ
     * @returns ワールドチェック付きの関数
     */
    public requireWorld<T extends (...args: any[]) => any>(
        func: T,
        errorMessage?: string
    ): T {
        return ((...args: any[]) => {
            if (!this.hasWorlds()) {
                const msg = errorMessage || `ワールドが利用可能でないため、${func.name}の実行をスキップしました`;
                console.warn(`⚠️ [WorldChecker] ${msg}`);
                return Promise.resolve(null);
            }
            return func(...args);
        }) as T;
    }

    /**
     * ワールドが利用可能になるまで待機
     * @param timeoutMs タイムアウト時間（ミリ秒）
     * @returns ワールドが利用可能になった場合true
     */
    public async waitForWorlds(timeoutMs: number = 10000): Promise<boolean> {
        try {
            return await this.utilManager.world.waitForWorlds(timeoutMs);
        } catch (error) {
            console.error('❌ [WorldChecker] Error waiting for worlds:', error);
            return false;
        }
    }

    /**
     * ワールド追加時のコールバックを登録
     * @param callback ワールド追加時に実行するコールバック
     */
    public onWorldAdd(callback: (worldName: string) => void): void {
        try {
            this.utilManager.world.onWorldAdd(callback);
        } catch (error) {
            console.error('❌ [WorldChecker] Error registering world add callback:', error);
        }
    }

    /**
     * ワールド削除時のコールバックを登録
     * @param callback ワールド削除時に実行するコールバック
     */
    public onWorldRemove(callback: (worldName: string) => void): void {
        try {
            this.utilManager.world.onWorldRemove(callback);
        } catch (error) {
            console.error('❌ [WorldChecker] Error registering world remove callback:', error);
        }
    }

    /**
     * 安全な関数実行（ワールドチェック付き）
     * @param func 実行する関数
     * @param fallbackValue ワールドが利用可能でない場合の戻り値
     * @param errorMessage エラー時のメッセージ
     * @returns 実行結果またはfallbackValue
     */
    public async safeExecute<T>(
        func: () => Promise<T> | T,
        fallbackValue: T,
        errorMessage?: string
    ): Promise<T> {
        if (!this.hasWorlds()) {
            const msg = errorMessage || 'ワールドが利用可能でないため処理をスキップしました';
            console.warn(`⚠️ [WorldChecker] ${msg}`);
            return fallbackValue;
        }

        try {
            return await func();
        } catch (error) {
            console.error('❌ [WorldChecker] Error in safe execution:', error);
            return fallbackValue;
        }
    }

    /**
     * デバッグ情報を出力
     */
    public debugInfo(): void {
        console.log('🌍 [WorldChecker] Debug Information:');
        try {
            const status = this.getWorldStatus();
            console.log(`  - Has Worlds: ${status.hasWorlds}`);
            console.log(`  - World Count: ${status.worldCount}`);
            console.log(`  - World Names: ${status.worldNames.join(', ')}`);
            console.log(`  - Initialized: ${status.initialized}`);
        } catch (error) {
            console.log('  - Error getting status:', error);
        }
    }
}

// グローバルインスタンス
const worldChecker = WorldChecker.getInstance();

// 簡単なAPI関数エクスポート
export const worldCheck = {
    hasWorlds: () => worldChecker.hasWorlds(),
    hasWorld: (name: string) => worldChecker.hasWorld(name),
    getStatus: () => worldChecker.getWorldStatus(),
    waitForWorlds: (timeoutMs?: number) => worldChecker.waitForWorlds(timeoutMs),
    onWorldAdd: (callback: (name: string) => void) => worldChecker.onWorldAdd(callback),
    onWorldRemove: (callback: (name: string) => void) => worldChecker.onWorldRemove(callback),
    requireWorld: <T extends (...args: any[]) => any>(func: T, errorMsg?: string) => 
        worldChecker.requireWorld(func, errorMsg),
    safeExecute: <T>(func: () => Promise<T> | T, fallback: T, errorMsg?: string) => 
        worldChecker.safeExecute(func, fallback, errorMsg),
    debugInfo: () => worldChecker.debugInfo()
};

export default worldChecker;

console.log('🌍 [WorldChecker] World checking utility loaded');
