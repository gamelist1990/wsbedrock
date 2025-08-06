import { IUtil, LogLevel } from './types.js';

/**
 * ログ管理ユーティリティクラス
 */
export class LogUtil implements IUtil {
  private readonly originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error
  };

  /**
   * 情報ログを出力
   * @param message メッセージ
   * @param args 追加引数
   */
  info(message: string, ...args: any[]): void {
    this.log('info', `ℹ️ ${message}`, ...args);
  }

  /**
   * 警告ログを出力
   * @param message メッセージ
   * @param args 追加引数
   */
  warn(message: string, ...args: any[]): void {
    this.log('warn', `⚠️ ${message}`, ...args);
  }

  /**
   * エラーログを出力
   * @param message メッセージ
   * @param args 追加引数
   */
  error(message: string, ...args: any[]): void {
    this.log('error', `❌ ${message}`, ...args);
  }

  /**
   * デバッグログを出力
   * @param message メッセージ
   * @param args 追加引数
   */
  debug(message: string, ...args: any[]): void {
    this.log('debug', `🐛 ${message}`, ...args);
  }

  /**
   * 成功ログを出力
   * @param message メッセージ
   * @param args 追加引数
   */
  success(message: string, ...args: any[]): void {
    this.log('info', `✅ ${message}`, ...args);
  }

  /**
   * プロセスログを出力
   * @param message メッセージ
   * @param args 追加引数
   */
  process(message: string, ...args: any[]): void {
    this.log('info', `🔄 ${message}`, ...args);
  }

  /**
   * 完了ログを出力
   * @param message メッセージ
   * @param args 追加引数
   */
  complete(message: string, ...args: any[]): void {
    this.log('info', `🎉 ${message}`, ...args);
  }

  /**
   * タイムスタンプ付きでログを出力
   * @param level ログレベル
   * @param message メッセージ
   * @param args 追加引数
   */
  withTimestamp(level: LogLevel, message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    this.log(level, `[${timestamp}] ${message}`, ...args);
  }

  /**
   * 区切り線を出力
   * @param char 区切り文字（デフォルト: '-'）
   * @param length 長さ（デフォルト: 50）
   */
  separator(char: string = '-', length: number = 50): void {
    this.log('info', char.repeat(length));
  }

  /**
   * グループ化されたログの開始
   * @param title グループタイトル
   */
  groupStart(title: string): void {
    this.log('info', `📦 === ${title} ===`);
  }

  /**
   * グループ化されたログの終了
   * @param title グループタイトル
   */
  groupEnd(title?: string): void {
    if (title) {
      this.log('info', `📦 === ${title} 完了 ===`);
    } else {
      this.separator('=');
    }
  }

  /**
   * パフォーマンス測定開始
   * @param label 測定ラベル
   */
  timeStart(label: string): void {
    console.time(`⏱️ ${label}`);
  }

  /**
   * パフォーマンス測定終了
   * @param label 測定ラベル
   */
  timeEnd(label: string): void {
    console.timeEnd(`⏱️ ${label}`);
  }

  /**
   * 基本ログ出力メソッド
   * @param level ログレベル
   * @param message メッセージ
   * @param args 追加引数
   */
  private log(level: LogLevel, message: string, ...args: any[]): void {
    const method = level === 'debug' ? 'log' : level === 'info' ? 'log' : level;
    this.originalConsole[method](message, ...args);
  }

  /**
   * 初期化処理（必要に応じて）
   */
  async initialize(): Promise<void> {
    // 初期化処理があれば記述
    this.info('LogUtil initialized');
  }
}
