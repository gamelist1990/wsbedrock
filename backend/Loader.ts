import { Server } from 'socket-be';
import { WSCommandRegistry } from './Module/Command/register.js';
import { PlayerChatHandler } from './Module/Command/handler.js';
import * as fs from 'fs';
import * as path from 'path';

// ロード統計情報
interface LoadStats {
  totalFiles: number;
  successfulLoads: number;
  failedLoads: number;
  totalTime: number;
  commandsLoaded: number;
  modulesLoaded: number;
}

// ローダークラス
export class ModuleLoader {
  private server: Server;
  private registry: WSCommandRegistry;
  private chatHandler: PlayerChatHandler | null = null;
  private loadStats: LoadStats = {
    totalFiles: 0,
    successfulLoads: 0,
    failedLoads: 0,
    totalTime: 0,
    commandsLoaded: 0,
    modulesLoaded: 0
  };
  
  constructor(server: Server) {
    this.server = server;
    this.registry = new WSCommandRegistry();
  }

  // 自動ロードメイン関数
  async autoLoad(): Promise<void> {
    const startTime = Date.now();
    console.log('🚀 [ModuleLoader] 自動ロード開始...');
    console.log('📊 [ModuleLoader] システム情報:');
    console.log(`   - Node.js: ${process.version}`);
    console.log(`   - Platform: ${process.platform} ${process.arch}`);
    console.log(`   - Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);

    try {
      // コマンドの読み込み
      await this.loadCommands();
      
      // モジュールの読み込み
      await this.loadModules();
            
      // チャットハンドラーの初期化
      this.initializeChatHandler();
      
      const endTime = Date.now();
      this.loadStats.totalTime = endTime - startTime;
      
      // 統計情報の表示
      this.displayLoadStats();
      
    } catch (error) {
      console.error('❌ [ModuleLoader] 自動ロード中にエラーが発生しました:', error);
      throw error;
    }
  }

  // 統計情報を表示
  private displayLoadStats(): void {
    console.log('');
    console.log('[ModuleLoader] === 読み込み統計 ===');
    console.log(`✅ 成功: ${this.loadStats.successfulLoads}/${this.loadStats.totalFiles} ファイル`);
    console.log(`❌ 失敗: ${this.loadStats.failedLoads}/${this.loadStats.totalFiles} ファイル`);
    console.log(`📦 コマンド: ${this.loadStats.commandsLoaded} 個`);
    console.log(`🔧 モジュール: ${this.loadStats.modulesLoaded} 個`);
    console.log(`⏱️  合計時間: ${this.loadStats.totalTime}ms`);
    console.log(`⚡ 平均速度: ${Math.round(this.loadStats.totalTime / this.loadStats.totalFiles)}ms/ファイル`);
    
    if (this.loadStats.failedLoads > 0) {
      console.log(`⚠️  ${this.loadStats.failedLoads} 個のファイルが読み込みに失敗しました`);
    }
    
    console.log('🎉 [ModuleLoader] 自動ロード完了!');
    console.log('');
  }

  // commandフォルダからコマンドを読み込み
  private async loadCommands(): Promise<void> {
    const commandsStartTime = Date.now();
    const commandsPath = path.join(__dirname, 'command');
    
    if (!fs.existsSync(commandsPath)) {
      console.log('⚠️  [ModuleLoader] commandフォルダが見つかりません');
      return;
    }

    const commandFiles = fs.readdirSync(commandsPath).filter(file => 
      file.endsWith('.ts') || file.endsWith('.js')
    );

    console.log(`📁 [ModuleLoader] commandフォルダから ${commandFiles.length} ファイルを発見`);
    this.loadStats.totalFiles += commandFiles.length;

    let commandsLoaded = 0;

    for (const file of commandFiles) {
      const fileStartTime = Date.now();
      const filePath = path.join(commandsPath, file);
      const fileName = path.basename(file, path.extname(file));
      
      try {
        console.log(`📄 [ModuleLoader] Loading: ${file}`);
        
        const commandModule = await import(filePath);
        
        // register関数を探す（複数の命名規則に対応）
        const registerFunctionNames = [
          `register${fileName.charAt(0).toUpperCase() + fileName.slice(1)}Command`,
          `register${fileName}Command`,
          'register',
          'default'
        ];

        let registerFunction: ((registry: WSCommandRegistry) => void) | null = null;
        for (const funcName of registerFunctionNames) {
          if (commandModule[funcName] && typeof commandModule[funcName] === 'function') {
            registerFunction = commandModule[funcName] as (registry: WSCommandRegistry) => void;
            break;
          }
        }

        if (registerFunction) {
          const beforeCount = this.registry.commands.length;
          registerFunction(this.registry);
          const afterCount = this.registry.commands.length;
          const newCommands = afterCount - beforeCount;
          
          commandsLoaded += newCommands;
          this.loadStats.successfulLoads++;
          
          const fileEndTime = Date.now();
          console.log(`   ✅ ${file} (+${newCommands} commands) (${fileEndTime - fileStartTime}ms)`);
        } else {
          console.log(`   ⚠️  ${file}: register関数が見つかりません`);
          this.loadStats.failedLoads++;
        }
        
      } catch (error) {
        console.error(`   ❌ ${file}: 読み込みエラー:`, error);
        this.loadStats.failedLoads++;
      }
    }

    this.loadStats.commandsLoaded = commandsLoaded;
    const commandsEndTime = Date.now();
    console.log(`📦 [ModuleLoader] ${commandsLoaded} コマンドを ${commandsEndTime - commandsStartTime}ms で読み込み完了`);
  }


  // Moduleフォルダからモジュールを読み込み
  private async loadModules(): Promise<void> {
    const modulesStartTime = Date.now();
    const modulesPath = path.join(__dirname, 'Module');
    
    if (!fs.existsSync(modulesPath)) {
      console.log('⚠️  [ModuleLoader] Moduleフォルダが見つかりません');
      return;
    }

    const moduleFilesBefore = this.loadStats.totalFiles;
    await this.loadModulesRecursively(modulesPath);
    const moduleFilesLoaded = this.loadStats.totalFiles - moduleFilesBefore;
    
    this.loadStats.modulesLoaded = moduleFilesLoaded;
    const modulesEndTime = Date.now();
    console.log(`📦 [ModuleLoader] ${moduleFilesLoaded} モジュールを ${modulesEndTime - modulesStartTime}ms で読み込み完了`);
  }

  // 再帰的にモジュールフォルダを読み込み
  private async loadModulesRecursively(dir: string): Promise<void> {
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        // ディレクトリの場合、再帰的に読み込み
        await this.loadModulesRecursively(fullPath);
      } else if (item.endsWith('.ts') || item.endsWith('.js')) {
        // TypeScript/JavaScriptファイルの場合、読み込みを試行
        this.loadStats.totalFiles++;
        const fileStartTime = Date.now();
        
        try {
          console.log(`📄 [ModuleLoader] Loading module: ${path.relative(__dirname, fullPath)}`);
          
          // モジュールのインポート（現時点では基本的なインポートのみ）
          await import(fullPath);
          
          this.loadStats.successfulLoads++;
          const fileEndTime = Date.now();
          console.log(`   ✅ ${path.relative(__dirname, fullPath)} (${fileEndTime - fileStartTime}ms)`);
          
        } catch (error) {
          console.error(`   ❌ ${path.relative(__dirname, fullPath)}: 読み込みエラー:`, error);
          this.loadStats.failedLoads++;
        }
      }
    }
  }

  // チャットハンドラーの初期化
  private initializeChatHandler(): void {
    this.chatHandler = new PlayerChatHandler(this.server, this.registry);
    console.log('💬 [ModuleLoader] チャットハンドラーを初期化しました');
  }

  // レジストリーを取得
  getRegistry(): WSCommandRegistry {
    return this.registry;
  }

  // チャットハンドラーを取得
  getChatHandler(): PlayerChatHandler | null {
    return this.chatHandler;
  }

  // 統計情報を取得
  getLoadStats(): LoadStats {
    return { ...this.loadStats };
  }
}