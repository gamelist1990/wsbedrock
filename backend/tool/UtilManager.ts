import { IUtil, UtilError } from './types.js';
import { StringUtil } from './StringUtil.js';
import { DateUtil } from './DateUtil.js';
import { LogUtil } from './LogUtil.js';
import { TimeUtil } from './TimeUtil.js';
import { WorldUtil } from './WorldUtil.js';

/**
 * Utilityシステムのメイン管理クラス
 * 各種Utilクラスのインスタンスを管理し、統一されたアクセスポイントを提供
 */
export class UtilManager {
  // 各Utilクラスのインスタンス
  public readonly string: StringUtil;
  public readonly date: DateUtil;
  public readonly log: LogUtil;
  public readonly time: TimeUtil;
  public readonly world: WorldUtil;

  // シングルトンインスタンス
  private static instance: UtilManager | null = null;

  /**
   * コンストラクタ
   * 各Utilクラスのインスタンスを生成
   */
  constructor() {
    this.string = new StringUtil();
    this.date = new DateUtil();
    this.log = new LogUtil();
    this.time = new TimeUtil();
    this.world = new WorldUtil();
  }

  /**
   * シングルトンインスタンスを取得
   * @returns UtilManagerインスタンス
   */
  static getInstance(): UtilManager {
    if (!this.instance) {
      this.instance = new UtilManager();
    }
    return this.instance;
  }

  /**
   * 全Utilクラスの初期化を実行
   * @returns 初期化完了のPromise
   */
  async initialize(): Promise<void> {
    try {
      const utils: IUtil[] = [
        this.string,
        this.date,
        this.log,
        this.time,
        this.world
      ];

      // 各Utilの初期化を並行実行
      await Promise.all(
        utils.map(async (util) => {
          if (util.initialize) {
            await util.initialize();
          }
        })
      );

      console.log('🛠️ [UtilManager] 全Utilクラスの初期化が完了しました');
    } catch (error) {
      throw new UtilError(`Util初期化に失敗しました: ${error}`, 'UtilManager');
    }
  }

  /**
   * 全Utilクラスのクリーンアップを実行
   * @returns クリーンアップ完了のPromise
   */
  async cleanup(): Promise<void> {
    try {
      const utils: IUtil[] = [
        this.string,
        this.date,
        this.log,
        this.time,
        this.world
      ];

      // 各Utilのクリーンアップを並行実行
      await Promise.all(
        utils.map(async (util) => {
          if (util.cleanup) {
            await util.cleanup();
          }
        })
      );

      console.log('🛠️ [UtilManager] 全Utilクラスのクリーンアップが完了しました');
    } catch (error) {
      throw new UtilError(`Utilクリーンアップに失敗しました: ${error}`, 'UtilManager');
    }
  }

  /**
   * Utilシステムの状態を取得
   * @returns システム状態の情報
   */
  getStatus(): {
    initialized: boolean;
    availableUtils: string[];
    version: string;
  } {
    return {
      initialized: true,
      availableUtils: ['string', 'date', 'file', 'log', 'time', 'world', 'worldChecker'],
      version: '1.0.0'
    };
  }

  /**
   * Utilシステムの使用統計を取得（将来拡張用）
   * @returns 使用統計情報
   */
  getUsageStats(): {
    totalCalls: number;
    utilCalls: { [key: string]: number };
  } {
    // 将来的に使用統計を実装する場合のプレースホルダー
    return {
      totalCalls: 0,
      utilCalls: {
        string: 0,
        date: 0,
        file: 0,
        log: 0,
        time: 0,
        world: 0
      }
    };
  }
}
