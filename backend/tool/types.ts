// Utilシステム用の型定義

// Utilの基底インターフェース
export interface IUtil {
  initialize?(): Promise<void>;
  cleanup?(): Promise<void>;
}

// 文字列フォーマット用の型
export type StringFormatArgs = string | number | boolean;

// ファイルパス関連の型
export type FilePath = string;
export type FileContent = string | Buffer;

// 日付フォーマット用の型
export type DateFormat = 'YYYY-MM-DD' | 'YYYY-MM-DD HH:mm:ss' | 'HH:mm:ss' | string;

// ログレベルの型
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

// Utilエラークラス
export class UtilError extends Error {
  constructor(message: string, public readonly utilName: string) {
    super(`[${utilName}] ${message}`);
    this.name = 'UtilError';
  }
}
