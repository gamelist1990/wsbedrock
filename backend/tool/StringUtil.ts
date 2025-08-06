import { IUtil, StringFormatArgs, UtilError } from './types.js';

/**
 * 文字列処理ユーティリティクラス
 */
export class StringUtil implements IUtil {
  
  /**
   * 文字列フォーマット（{0}, {1}形式）
   * @param template テンプレート文字列
   * @param args フォーマット引数
   * @returns フォーマット後の文字列
   */
  format(template: string, ...args: StringFormatArgs[]): string {
    try {
      return template.replace(/{(\d+)}/g, (match, index) => {
        const argIndex = parseInt(index, 10);
        return argIndex < args.length ? String(args[argIndex]) : match;
      });
    } catch (error) {
      throw new UtilError(`文字列フォーマットに失敗しました: ${error}`, 'StringUtil');
    }
  }

  /**
   * 最初の文字を大文字にする
   * @param str 対象文字列
   * @returns 大文字化された文字列
   */
  capitalize(str: string): string {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  /**
   * キャメルケースに変換
   * @param str 対象文字列
   * @returns キャメルケース文字列
   */
  camelCase(str: string): string {
    return str
      .replace(/[-_\s]+(.)?/g, (_, char) => char ? char.toUpperCase() : '')
      .replace(/^[A-Z]/, (char) => char.toLowerCase());
  }

  /**
   * Minecraftのカラーコードを除去
   * @param str 対象文字列
   * @returns カラーコード除去後の文字列
   */
  removeColorCodes(str: string): string {
    return str.replace(/§[0-9a-fklmnor]/g, '');
  }

  /**
   * Minecraftプレイヤー名のバリデーション
   * @param name プレイヤー名
   * @returns 有効かどうか
   */
  validateMinecraftName(name: string): boolean {
    return /^[a-zA-Z0-9_]{3,16}$/.test(name);
  }

  /**
   * 文字列が空または空白のみかチェック
   * @param str 対象文字列
   * @returns 空または空白のみの場合true
   */
  isNullOrWhitespace(str: string | null | undefined): boolean {
    return !str || str.trim().length === 0;
  }

  /**
   * 文字列を指定された長さで切り詰め
   * @param str 対象文字列
   * @param length 最大長
   * @param suffix 省略記号（デフォルト: '...'）
   * @returns 切り詰められた文字列
   */
  truncate(str: string, length: number, suffix: string = '...'): string {
    if (str.length <= length) return str;
    return str.substring(0, length - suffix.length) + suffix;
  }

  /**
   * 初期化処理（必要に応じて）
   */
  async initialize(): Promise<void> {
    // 初期化処理があれば記述
  }
}
