import { IUtil, UtilError } from './types.js';

/**
 * 時間測定・管理ユーティリティクラス
 */
export class TimeUtil implements IUtil {
  private startTime: number;
  private timers: Map<string, number> = new Map();
  private records: Map<string, { start: number; end?: number; duration?: number }> = new Map();

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * 現在の時刻を取得（ミリ秒）
   * @returns 現在時刻のタイムスタンプ
   */
  getCurrentTime(): number {
    return Date.now();
  }

  /**
   * 現在時刻を人間が読みやすい形式で取得
   * @param format フォーマット（デフォルト: 'YYYY-MM-DD HH:mm:ss'）
   * @returns フォーマット後の現在時刻
   */
  getCurrentTimeFormatted(format: string = 'YYYY-MM-DD HH:mm:ss'): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return format
      .replace('YYYY', String(year))
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds);
  }

  /**
   * アプリケーション開始からの経過時間を取得（ミリ秒）
   * @returns 経過時間（ミリ秒）
   */
  getElapsedTime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * アプリケーション開始からの経過時間を人間が読みやすい形式で取得
   * @returns フォーマット後の経過時間
   */
  getElapsedTimeFormatted(): string {
    const elapsed = this.getElapsedTime();
    return this.formatDuration(elapsed);
  }

  /**
   * プロセスの稼働時間を取得（process.uptime()のラッパー）
   * @returns 稼働時間（秒）
   */
  getProcessUptime(): number {
    return process.uptime();
  }

  /**
   * プロセスの稼働時間を人間が読みやすい形式で取得
   * @returns フォーマット後の稼働時間
   */
  getProcessUptimeFormatted(): string {
    const uptime = this.getProcessUptime() * 1000; // ミリ秒に変換
    return this.formatDuration(uptime);
  }

  /**
   * 名前付きタイマーを開始
   * @param name タイマー名
   */
  startTimer(name: string): void {
    const now = Date.now();
    this.timers.set(name, now);
    this.records.set(name, { start: now });
  }

  /**
   * 名前付きタイマーを停止して経過時間を取得
   * @param name タイマー名
   * @returns 経過時間（ミリ秒）
   */
  stopTimer(name: string): number {
    const startTime = this.timers.get(name);
    if (!startTime) {
      throw new UtilError(`タイマー '${name}' が見つかりません`, 'TimeUtil');
    }

    const now = Date.now();
    const duration = now - startTime;
    
    // 記録を更新
    const record = this.records.get(name);
    if (record) {
      record.end = now;
      record.duration = duration;
    }

    this.timers.delete(name);
    return duration;
  }

  /**
   * 名前付きタイマーの経過時間を取得（停止せずに）
   * @param name タイマー名
   * @returns 経過時間（ミリ秒）
   */
  getTimerElapsed(name: string): number {
    const startTime = this.timers.get(name);
    if (!startTime) {
      throw new UtilError(`タイマー '${name}' が見つかりません`, 'TimeUtil');
    }

    return Date.now() - startTime;
  }

  /**
   * 名前付きタイマーが実行中かチェック
   * @param name タイマー名
   * @returns 実行中の場合true
   */
  isTimerRunning(name: string): boolean {
    return this.timers.has(name);
  }

  /**
   * 全ての実行中タイマーの一覧を取得
   * @returns タイマー名の配列
   */
  getActiveTimers(): string[] {
    return Array.from(this.timers.keys());
  }

  /**
   * タイマーの記録を取得
   * @param name タイマー名
   * @returns タイマー記録
   */
  getTimerRecord(name: string): { start: number; end?: number; duration?: number } | undefined {
    return this.records.get(name);
  }

  /**
   * 全てのタイマー記録を取得
   * @returns 全タイマー記録
   */
  getAllTimerRecords(): Map<string, { start: number; end?: number; duration?: number }> {
    return new Map(this.records);
  }

  /**
   * 期間（ミリ秒）を人間が読みやすい形式にフォーマット
   * @param duration 期間（ミリ秒）
   * @returns フォーマット後の文字列
   */
  formatDuration(duration: number): string {
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}日 ${hours % 24}時間 ${minutes % 60}分 ${seconds % 60}秒`;
    } else if (hours > 0) {
      return `${hours}時間 ${minutes % 60}分 ${seconds % 60}秒`;
    } else if (minutes > 0) {
      return `${minutes}分 ${seconds % 60}秒`;
    } else if (seconds > 0) {
      return `${seconds}秒`;
    } else {
      return `${duration}ms`;
    }
  }

  /**
   * パフォーマンス測定用の高精度タイマー
   * @returns 高精度タイムスタンプ
   */
  getHighResTime(): number {
    return performance.now();
  }

  /**
   * 指定時間だけ待機（async/await用）
   * @param ms 待機時間（ミリ秒）
   * @returns Promise
   */
  async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * タイマー記録をクリア
   * @param name タイマー名（省略時は全てクリア）
   */
  clearTimer(name?: string): void {
    if (name) {
      this.timers.delete(name);
      this.records.delete(name);
    } else {
      this.timers.clear();
      this.records.clear();
    }
  }

  /**
   * 時間測定統計を取得
   * @returns 統計情報
   */
  getStats(): {
    startTime: number;
    currentTime: number;
    elapsedTime: number;
    activeTimers: number;
    totalRecords: number;
  } {
    return {
      startTime: this.startTime,
      currentTime: this.getCurrentTime(),
      elapsedTime: this.getElapsedTime(),
      activeTimers: this.timers.size,
      totalRecords: this.records.size
    };
  }

  /**
   * 初期化処理
   */
  async initialize(): Promise<void> {
    console.log('⏰ [TimeUtil] 時間管理システムを初期化しました');
  }

  /**
   * クリーンアップ処理
   */
  async cleanup(): Promise<void> {
    this.clearTimer(); // 全てのタイマーをクリア
    console.log('⏰ [TimeUtil] 時間管理システムをクリーンアップしました');
  }
}
