import { IUtil, DateFormat, UtilError } from './types.js';

/**
 * 日付処理ユーティリティクラス
 */
export class DateUtil implements IUtil {

  /**
   * 現在時刻を指定フォーマットで取得
   * @param format フォーマット文字列
   * @returns フォーマット後の日付文字列
   */
  formatNow(format: DateFormat): string {
    return this.format(new Date(), format);
  }

  /**
   * 日付を指定フォーマットで変換
   * @param date 対象の日付
   * @param format フォーマット文字列
   * @returns フォーマット後の日付文字列
   */
  format(date: Date, format: DateFormat): string {
    try {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');

      return format
        .replace('YYYY', String(year))
        .replace('MM', month)
        .replace('DD', day)
        .replace('HH', hours)
        .replace('mm', minutes)
        .replace('ss', seconds);
    } catch (error) {
      throw new UtilError(`日付フォーマットに失敗しました: ${error}`, 'DateUtil');
    }
  }

  /**
   * 日付に指定日数を加算
   * @param date 基準日付
   * @param days 加算する日数
   * @returns 新しい日付
   */
  addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  /**
   * 日付に指定時間を加算
   * @param date 基準日付
   * @param hours 加算する時間
   * @returns 新しい日付
   */
  addHours(date: Date, hours: number): Date {
    const result = new Date(date);
    result.setHours(result.getHours() + hours);
    return result;
  }

  /**
   * 2つの日付の差を取得（ミリ秒）
   * @param date1 日付1
   * @param date2 日付2
   * @returns 差（ミリ秒）
   */
  getDifference(date1: Date, date2: Date): number {
    return Math.abs(date1.getTime() - date2.getTime());
  }

  /**
   * 2つの日付の差を日数で取得
   * @param date1 日付1
   * @param date2 日付2
   * @returns 差（日数）
   */
  getDifferenceInDays(date1: Date, date2: Date): number {
    const timeDiff = this.getDifference(date1, date2);
    return Math.floor(timeDiff / (1000 * 60 * 60 * 24));
  }

  /**
   * タイムスタンプ（Unix時間）を取得
   * @param date 対象日付（省略時は現在時刻）
   * @returns タイムスタンプ
   */
  getTimestamp(date?: Date): number {
    return (date || new Date()).getTime();
  }

  /**
   * タイムスタンプから日付オブジェクトを生成
   * @param timestamp タイムスタンプ
   * @returns 日付オブジェクト
   */
  fromTimestamp(timestamp: number): Date {
    return new Date(timestamp);
  }

  /**
   * 経過時間を人間が読みやすい形式で取得
   * @param date 基準日付
   * @returns 経過時間の文字列
   */
  getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffDay > 0) return `${diffDay}日前`;
    if (diffHour > 0) return `${diffHour}時間前`;
    if (diffMin > 0) return `${diffMin}分前`;
    return `${diffSec}秒前`;
  }

  /**
   * 初期化処理（必要に応じて）
   */
  async initialize(): Promise<void> {
    // 初期化処理があれば記述
  }
}
