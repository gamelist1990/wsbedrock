import { IUtil, UtilError } from './types.js';
import { server } from '../index.js';

/**
 * World管理用のUtilクラス
 * ワールドの追加/削除状態を監視し、データベース操作の実行可否を管理
 */
export class WorldUtil implements IUtil {
  private initialized: boolean = false;
  private availableWorlds: Set<string> = new Set();
  private worldAddCallbacks: Set<(worldName: string) => void> = new Set();
  private worldRemoveCallbacks: Set<(worldName: string) => void> = new Set();

  /**
   * WorldUtilの初期化
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      console.log('🌍 [WorldUtil] World管理システムを初期化中...');
      
      // 既存のワールドを取得
      this.updateAvailableWorlds();
      
      // ワールド追加/削除のイベントリスナーは、serverが初期化されてから設定する
      // このため、遅延初期化を使用
      setTimeout(() => {
        this.setupWorldEventListeners();
      }, 1000);
      
      this.initialized = true;
      console.log('✅ [WorldUtil] World管理システムの初期化が完了しました');
      console.log(`🌍 [WorldUtil] 現在利用可能なワールド数: ${this.availableWorlds.size}`);
      
    } catch (error) {
      throw new UtilError(`WorldUtil初期化に失敗しました: ${error}`, 'WorldUtil');
    }
  }

  /**
   * WorldUtilのクリーンアップ
   */
  async cleanup(): Promise<void> {
    console.log('🌍 [WorldUtil] World管理システムのクリーンアップ中...');
    this.availableWorlds.clear();
    this.worldAddCallbacks.clear();
    this.worldRemoveCallbacks.clear();
    this.initialized = false;
    console.log('✅ [WorldUtil] World管理システムのクリーンアップが完了しました');
  }

  /**
   * ワールドイベントリスナーを設定
   */
  private setupWorldEventListeners(): void {
    try {
      if (!server) {
        console.warn('⚠️ [WorldUtil] サーバーインスタンスが利用できません');
        return;
      }

      // ServerEventをdynamic importで取得（循環依存を回避）
      import('socket-be').then(({ ServerEvent }) => {
        server.on(ServerEvent.WorldAdd, (world) => {
          const worldName = world.world.name;
          console.log(`🌍 [WorldUtil] ワールドが追加されました: ${worldName}`);
          this.availableWorlds.add(worldName);
          
          // コールバックを実行
          this.worldAddCallbacks.forEach(callback => {
            try {
              callback(worldName);
            } catch (error) {
              console.error(`❌ [WorldUtil] ワールド追加コールバックエラー: ${error}`);
            }
          });
        });

        server.on(ServerEvent.WorldRemove, (world) => {
          const worldName = world.world.name;
          console.log(`🌍 [WorldUtil] ワールドが削除されました: ${worldName}`);
          this.availableWorlds.delete(worldName);
          
          // コールバックを実行
          this.worldRemoveCallbacks.forEach(callback => {
            try {
              callback(worldName);
            } catch (error) {
              console.error(`❌ [WorldUtil] ワールド削除コールバックエラー: ${error}`);
            }
          });
        });

        console.log('✅ [WorldUtil] ワールドイベントリスナーを設定しました');
      }).catch(error => {
        console.error('❌ [WorldUtil] ServerEventのインポートに失敗:', error);
      });

    } catch (error) {
      console.error('❌ [WorldUtil] ワールドイベントリスナー設定エラー:', error);
    }
  }

  /**
   * 利用可能なワールドリストを更新
   */
  private updateAvailableWorlds(): void {
    try {
      if (!server) {
        console.warn('⚠️ [WorldUtil] サーバーインスタンスが利用できません');
        return;
      }

      const worlds = server.getWorlds();
      this.availableWorlds.clear();
      
      for (const world of worlds) {
        this.availableWorlds.add(world.name);
      }
      
      console.log(`🌍 [WorldUtil] ワールドリストを更新: ${Array.from(this.availableWorlds).join(', ')}`);
    } catch (error) {
      console.error('❌ [WorldUtil] ワールドリスト更新エラー:', error);
    }
  }

  /**
   * ワールドが利用可能かチェック
   */
  hasWorlds(): boolean {
    return this.availableWorlds.size > 0;
  }

  /**
   * 特定のワールドが利用可能かチェック
   */
  hasWorld(worldName: string): boolean {
    return this.availableWorlds.has(worldName);
  }

  /**
   * 利用可能なワールド数を取得
   */
  getWorldCount(): number {
    return this.availableWorlds.size;
  }

  /**
   * 利用可能なワールド名のリストを取得
   */
  getWorldNames(): string[] {
    return Array.from(this.availableWorlds);
  }

  /**
   * 最初の利用可能なワールドを取得
   */
  getFirstWorld(): any | null {
    try {
      if (!server) return null;
      
      const worlds = server.getWorlds();
      return worlds.length > 0 ? worlds[0] : null;
    } catch (error) {
      console.error('❌ [WorldUtil] ワールド取得エラー:', error);
      return null;
    }
  }

  /**
   * ワールド追加時のコールバックを登録
   */
  onWorldAdd(callback: (worldName: string) => void): void {
    this.worldAddCallbacks.add(callback);
  }

  /**
   * ワールド削除時のコールバックを登録
   */
  onWorldRemove(callback: (worldName: string) => void): void {
    this.worldRemoveCallbacks.add(callback);
  }

  /**
   * ワールド追加コールバックを削除
   */
  removeWorldAddCallback(callback: (worldName: string) => void): void {
    this.worldAddCallbacks.delete(callback);
  }

  /**
   * ワールド削除コールバックを削除
   */
  removeWorldRemoveCallback(callback: (worldName: string) => void): void {
    this.worldRemoveCallbacks.delete(callback);
  }

  /**
   * ワールドが利用可能になるまで待機
   * @param timeoutMs タイムアウト時間（ミリ秒）
   * @returns Promise<boolean> ワールドが利用可能になったかどうか
   */
  async waitForWorlds(timeoutMs: number = 10000): Promise<boolean> {
    if (this.hasWorlds()) {
      return true;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.removeWorldAddCallback(callback);
        resolve(false);
      }, timeoutMs);

      const callback = () => {
        clearTimeout(timeout);
        this.removeWorldAddCallback(callback);
        resolve(true);
      };

      this.onWorldAdd(callback);
    });
  }

  /**
   * ワールドが利用可能でない場合に実行をスキップするデコレータ関数
   */
  requireWorld<T extends (...args: any[]) => any>(
    func: T,
    errorMessage?: string
  ): T {
    return ((...args: any[]) => {
      if (!this.hasWorlds()) {
        const msg = errorMessage || `ワールドが利用可能でないため、${func.name}の実行をスキップしました`;
        console.warn(`⚠️ [WorldUtil] ${msg}`);
        return Promise.resolve(null);
      }
      return func(...args);
    }) as T;
  }

  /**
   * システム状態を取得
   */
  getStatus(): {
    initialized: boolean;
    worldCount: number;
    worldNames: string[];
    hasWorlds: boolean;
  } {
    return {
      initialized: this.initialized,
      worldCount: this.getWorldCount(),
      worldNames: this.getWorldNames(),
      hasWorlds: this.hasWorlds()
    };
  }

  /**
   * デバッグ情報を表示
   */
  debugInfo(): void {
    console.log('🌍 [WorldUtil] デバッグ情報:');
    console.log(`  - 初期化済み: ${this.initialized}`);
    console.log(`  - ワールド数: ${this.getWorldCount()}`);
    console.log(`  - ワールド名: ${this.getWorldNames().join(', ')}`);
    console.log(`  - 追加コールバック数: ${this.worldAddCallbacks.size}`);
    console.log(`  - 削除コールバック数: ${this.worldRemoveCallbacks.size}`);
  }
}
