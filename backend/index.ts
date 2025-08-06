import { EncryptionMode, Server, ServerEvent } from 'socket-be';
import { settings } from './settings.js';
import { ModuleLoader } from './Loader.js';

// グローバルエラーハンドラーを設定
process.on('uncaughtException', (error) => {
  // RequestTimeoutErrorなどの特定のエラーは無視
  if (error.message === 'Response timeout' || error.name === 'RequestTimeoutError') {
    return; // エラーログを出さずに続行
  }
  console.error('⚠️ Uncaught Exception:', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
  // RequestTimeoutErrorなどの特定のエラーは無視
  if (reason && typeof reason === 'object' && 'message' in reason) {
    if (reason.message === 'Response timeout' || (reason as any).name === 'RequestTimeoutError') {
      return; // エラーログを出さずに続行
    }
  }
  console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});

// コンソールログをフィルタリング
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;
const originalInfo = console.info;

// ネットワークエラーをフィルタリングする関数
const shouldFilterMessage = (message: string): boolean => {
  return message.includes('[Network] Failed to parse packet') || 
         message.includes('Failed to parse packet from') ||
         (message.includes('[Network]') && message.includes('Failed to parse packet')) ||
         message.includes('RequestTimeoutError') || 
         message.includes('Response timeout');
};

console.log = (...args: any[]) => {
  const message = args.join(' ');
  if (shouldFilterMessage(message)) {
    return;
  }
  originalLog.apply(console, args);
};

console.error = (...args: any[]) => {
  const message = args.join(' ');
  if (shouldFilterMessage(message)) {
    return;
  }
  originalError.apply(console, args);
};

console.warn = (...args: any[]) => {
  const message = args.join(' ');
  if (shouldFilterMessage(message)) {
    return;
  }
  originalWarn.apply(console, args);
};

console.info = (...args: any[]) => {
  const message = args.join(' ');
  if (shouldFilterMessage(message)) {
    return;
  }
  originalInfo.apply(console, args);
};

// プロセスの標準出力もフィルタリング
const originalStdoutWrite = process.stdout.write;
const originalStderrWrite = process.stderr.write;

process.stdout.write = function(chunk: any, encoding?: any, callback?: any) {
  const message = chunk.toString();
  if (shouldFilterMessage(message)) {
    return true;
  }
  return originalStdoutWrite.call(this, chunk, encoding, callback);
};

process.stderr.write = function(chunk: any, encoding?: any, callback?: any) {
  const message = chunk.toString();
  if (shouldFilterMessage(message)) {
    return true;
  }
  return originalStderrWrite.call(this, chunk, encoding, callback);
};

const server = new Server({
  port: settings.port,
  encryptionMode: EncryptionMode.Aes256cfb128
});

// ModuleLoaderのインスタンスを作成
const moduleLoader = new ModuleLoader(server);

server.on(ServerEvent.Open, async () => {
  try {
    console.log('🌐 Server started on port:', settings.port);
    
    // 自動ロード機能を実行
    await moduleLoader.autoLoad();
  } catch (error) {
    console.error('💥 サーバー起動中にエラーが発生しました:', error);
    // エラーが発生してもサーバーは続行
  }
});

server.on(ServerEvent.Close, async () => {
  try {
    console.log('🔌 Server closed');
  } catch (error) {
    console.error('💥 サーバー終了中にエラーが発生しました:', error);
  }
});
