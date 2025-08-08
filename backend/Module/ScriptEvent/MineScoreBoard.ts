import { server } from "../..";

// JSONデータベースレスポンスの型
interface JsonDatabaseResponse {
    success: boolean;
    data?: any;
    error?: string;
}

// デバッグフラグ（本番環境では false にする）
const DEBUG_ENABLED = false;

// デバッグログ用ヘルパー関数
const debugLog = (message: string) => {
    if (DEBUG_ENABLED) {
        console.log(message);
    }
};

const debugError = (message: string, error?: any) => {
    if (DEBUG_ENABLED) {
        console.error(message, error);
    }
};



// JSON用スコアボードデータベースクラス
class JsonScoreboardDatabase {
    private static instance: JsonScoreboardDatabase;

    private constructor() { }

    public static getInstance(): JsonScoreboardDatabase {
        if (!JsonScoreboardDatabase.instance) {
            JsonScoreboardDatabase.instance = new JsonScoreboardDatabase();
        }
        return JsonScoreboardDatabase.instance;
    }

    // 利用可能なワールドとスコアボードを取得
    private getWorldWithScoreboard(): { world: any; scoreboard: any } | null {
        const worlds = server.getWorlds();
        if (worlds.length === 0) {
            debugLog(`[JsonScoreboardDatabase] DEBUG: No worlds available`);
            return null;
        }

        // 現在のsocket-beではスコアボードAPIが完全に実装されていない可能性があるため
        // 常にコマンドベース方式を使用するように変更
        const world = worlds[0];
        debugLog(`[JsonScoreboardDatabase] DEBUG: Using world: ${world.name} (command-only mode)`);
        return { world, scoreboard: null };
    }

    // スコアボードオブジェクトを取得または作成
    private async getOrCreateObjective(tableName: string): Promise<boolean> {
        const timestamp = new Date().toISOString();
        debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: getOrCreateObjective called for table: ${tableName}`);

        try {
            const worldData = this.getWorldWithScoreboard();
            if (!worldData) {
                debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: No worlds available`);
                return false;
            }

            const { world, scoreboard } = worldData;

            // Socket-BEのスコアボードAPIは現在限定的なため、コマンドベースアプローチを優先
            // 将来のAPIアップデートに備えてAPIチェックコードは保持
            if (scoreboard && false) { // 現在は無効化
                debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Using scoreboard API for objective check`);
                // APIコードは将来の実装のために保持
            }

            // 従来のコマンドベース方式（フォールバック）
            debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Using command-based approach for objective management`);

            // オブジェクトの存在確認コマンド
            debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Checking if objective exists: ${tableName}`);
            const checkResult = await world.runCommand(`scoreboard objectives list`);
            debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Objectives list command result:`);
            debugLog(`  - Success count: ${checkResult.successCount}`);
            debugLog(`  - Status message: ${checkResult.statusMessage}`);
            debugLog(`  - Message length: ${checkResult.statusMessage?.length || 0}`);

            // より厳密な存在確認：行の開始または空白の後にテーブル名が来る場合のみマッチ
            let objectiveExists = false;
            if (checkResult.statusMessage) {
                const lines = checkResult.statusMessage.split('\n');
                for (const line of lines) {
                    // 行の形式: "- tableName: 'displayName' と表示され、型は 'type' です"
                    const match = line.match(/^-\s*(\w+):/);
                    if (match && match[1] === tableName) {
                        objectiveExists = true;
                        debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Found exact match for objective: ${tableName} in line: ${line.trim()}`);
                        break;
                    }
                }
                if (!objectiveExists) {
                    debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: No exact match found for objective: ${tableName}`);
                    debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Available objectives:`);
                    lines.forEach((line, index) => {
                        if (line.trim()) {
                            debugLog(`  [${index}]: ${line.trim()}`);
                        }
                    });
                }
            }

            debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Objective "${tableName}" exists: ${objectiveExists}`);

            if (!objectiveExists) {
                debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Creating new objective: ${tableName}`);
                // オブジェクトが存在しない場合は作成
                const createResult = await world.runCommand(`scoreboard objectives add ${tableName} dummy "JSON Table: ${tableName}"`);
                debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Create command result:`);
                debugLog(`  - Success count: ${createResult.successCount}`);
                debugLog(`  - Status message: ${createResult.statusMessage}`);

                // successCountがundefinedの場合は、statusMessageでエラーかどうかを判定
                const isError = createResult.statusMessage?.includes('既に存在します') ||
                    createResult.statusMessage?.includes('already exists');

                if (createResult.successCount === 0 && !isError) {
                    console.error(`[JsonScoreboardDatabase][${timestamp}] ERROR: Failed to create scoreboard objective: ${tableName}`);
                    return false;
                }

                if (isError) {
                    debugLog(`[JsonScoreboardDatabase][${timestamp}] INFO: Objective ${tableName} already exists (detected from error message)`);
                } else {
                    debugLog(`[JsonScoreboardDatabase][${timestamp}] INFO: Created new JSON table: ${tableName}`);
                }
            } else {
                debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Objective "${tableName}" already exists, skipping creation`);
            }

            debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: getOrCreateObjective completed successfully for: ${tableName}`);
            return true;
        } catch (error) {
            return false;
        }
    }

    // スコアボード行を処理するヘルパーメソッド
    private processScoreboardLines(lines: string[], targetId: number, timestamp: string, targetTableName: string): JsonDatabaseResponse {
        debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Processing ${lines.length} lines for ID ${targetId} in table ${targetTableName}`);

        let currentParticipant = "";

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Processing line ${i}: "${line.substring(0, 100)}..."`);

            // スコアボードの新しい出力形式を解析
            // 形式1: "§a選択された X 個のオブジェクトを PARTICIPANT に表示:"
            const participantMatch = line.match(/§a選択された\s+\d+\s+個のオブジェクトを\s+(.+?)\s+に表示:/);
            if (participantMatch) {
                currentParticipant = participantMatch[1].trim();
                debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Found participant: "${currentParticipant.substring(0, 50)}..."`);
                continue;
            }

        // 形式2: "- JSON Table: tableName: score (tableName)"
        const scoreMatch = line.match(/^-\s+JSON Table:\s+(.+?):\s+(\d+)\s+\((.+?)\)$/);
        if (scoreMatch && currentParticipant) {
            const tableNameInLine = scoreMatch[1].trim();
            const score = parseInt(scoreMatch[2]);
            const actualTableName = scoreMatch[3].trim();

            debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Found score entry - table: ${tableNameInLine}, score: ${score}, participant: "${currentParticipant.substring(0, 50)}..."`);

            // テーブル名の厳格なチェック: 要求されたテーブル名と実際のテーブル名が一致する場合のみ処理
            if (actualTableName === targetTableName && score === targetId) {
                debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Found matching ID ${targetId} in correct table ${targetTableName}, parsing JSON`);
                try {
                    // エスケープされた文字列をアンエスケープ
                    let unescapedParticipant = currentParticipant;
                    
                    // バックスラッシュエスケープを処理
                    if (unescapedParticipant.includes('\\"')) {
                        unescapedParticipant = unescapedParticipant.replace(/\\"/g, '"');
                        debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Unescaped participant: "${unescapedParticipant.substring(0, 100)}..."`);
                    }
                    
                    // participant名をJSONとしてパース
                    const jsonData = JSON.parse(unescapedParticipant);
                    debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: JSON parsing completed successfully for table ${targetTableName}`);
                    return {
                        success: true,
                        data: jsonData
                    };
                } catch (parseError) {
                    console.error(`[JsonScoreboardDatabase][${timestamp}] ERROR: JSON parse error:`, parseError);
                    console.error(`[JsonScoreboardDatabase][${timestamp}] ERROR: Failed to parse: "${currentParticipant.substring(0, 100)}..."`);
                    return {
                        success: false,
                        error: "Failed to parse JSON from participant name"
                    };
                }
            } else {
                // テーブル名が一致しない場合は無視
                if (actualTableName !== targetTableName) {
                    debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Skipping entry from different table: ${actualTableName} (looking for ${targetTableName})`);
                }
            }
        }            // 従来の形式も残しておく (フォールバック)
            let match = line.match(/^(.+):\s*(\d+)$/);
            if (!match) {
                match = line.match(/^(.+?)\s*の\s*.+?\s*を\s*(\d+)\s*に設定しました/);
            }

            if (match) {
                const participantName = match[1].trim();
                const score = parseInt(match[2]);

                debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Found participant (legacy format) "${participantName.substring(0, 50)}..." with score ${score}, looking for ID ${targetId}`);

                if (score === targetId) {
                    debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Found matching ID ${targetId} (legacy format), parsing JSON`);
                    try {
                        // エスケープされた文字列をアンエスケープ
                        let unescapedParticipant = participantName;
                        
                        // バックスラッシュエスケープを処理
                        if (unescapedParticipant.includes('\\"')) {
                            unescapedParticipant = unescapedParticipant.replace(/\\"/g, '"');
                            debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Unescaped participant (legacy): "${unescapedParticipant.substring(0, 100)}..."`);
                        }
                        
                        const jsonData = JSON.parse(unescapedParticipant);
                        debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: JSON parsing completed successfully (legacy format)`);
                        return {
                            success: true,
                            data: jsonData
                        };
                    } catch (parseError) {
                        console.error(`[JsonScoreboardDatabase][${timestamp}] ERROR: JSON parse error (legacy format):`, parseError);
                        console.error(`[JsonScoreboardDatabase][${timestamp}] ERROR: Failed to parse: "${participantName.substring(0, 100)}..."`);
                        return {
                            success: false,
                            error: "Failed to parse JSON from participant name"
                        };
                    }
                }
            }
        }

        debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: ID ${targetId} not found in processed lines`);
        return {
            success: false,
            error: "ID not found"
        };
    }

    // JSONデータを直接participant名に格納
    public async setJsonDirect(tableName: string, id: number, jsonData: any): Promise<JsonDatabaseResponse> {
        const timestamp = new Date().toISOString();
        debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: setJsonDirect called - table: ${tableName}, id: ${id}`);

        try {
            debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Calling getOrCreateObjective for setJsonDirect`);
            if (!(await this.getOrCreateObjective(tableName))) {
                console.error(`[JsonScoreboardDatabase][${timestamp}] ERROR: getOrCreateObjective failed in setJsonDirect`);
                return {
                    success: false,
                    error: `Failed to create/access table: ${tableName}`
                };
            }
            debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: getOrCreateObjective completed in setJsonDirect`);

            const worldData = this.getWorldWithScoreboard();
            if (!worldData) {
                return {
                    success: false,
                    error: "No world available"
                };
            }

            const { world, scoreboard } = worldData;

            // JSONを最小化
            const minifiedJson = JSON.stringify(jsonData);
            debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: JSON length: ${minifiedJson.length} chars`);

            // 文字数制限の簡単なチェック（Minecraftの制限を考慮）
            if (minifiedJson.length > 32767) { // 大まかな制限値
                return {
                    success: false,
                    error: `JSON too long: ${minifiedJson.length} chars. Estimated limit: 32767`
                };
            }

            // エスケープ処理（コマンドで使用するため）

            // 従来のコマンドベース方式（フォールバック）
            debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Using command-based approach for score setting`);

            // participant名をJSONにしてスコア値をIDに設定
            const command = `scriptevent command:jsondb set ${tableName} ${id} ${minifiedJson}`;
            debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Executing command: ${command.substring(0, 100)}...`);
            const result = await world.runCommand(command);
            debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Command result - success: ${result.successCount}, message: ${result.statusMessage}`);

            // successCountがundefinedの場合は、statusMessageでエラーかどうかを判定
            const isSuccess = result.successCount !== 0 ||
                (result.statusMessage && !result.statusMessage.includes('エラー') && !result.statusMessage.includes('error'));

            if (!isSuccess && result.successCount === 0) {
                return {
                    success: false,
                    error: `Command failed: ${result.statusMessage || 'Unknown error'}`
                };
            }

            debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: setJsonDirect completed successfully`);
            return {
                success: true,
                data: jsonData
            };
        } catch (error) {
            console.error(`[JsonScoreboardDatabase][${timestamp}] ERROR: setJsonDirect error:`, error);
            return {
                success: false,
                error: String(error)
            };
        }
    }

    // 直接格納されたJSONデータを取得
    public async getJsonDirect(tableName: string, id: number): Promise<JsonDatabaseResponse> {
        const timestamp = new Date().toISOString();
        debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: getJsonDirect called - table: ${tableName}, id: ${id}`);

        try {
            debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Calling getOrCreateObjective for getJsonDirect`);
            if (!(await this.getOrCreateObjective(tableName))) {
                console.error(`[JsonScoreboardDatabase][${timestamp}] ERROR: getOrCreateObjective failed in getJsonDirect`);
                return {
                    success: false,
                    error: `Failed to access table: ${tableName}`
                };
            }
            debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: getOrCreateObjective completed in getJsonDirect`);

            const worldData = this.getWorldWithScoreboard();
            if (!worldData) {
                return {
                    success: false,
                    error: "No world available"
                };
            }

            const { world, scoreboard } = worldData;

            // Socket-BEのスコアボードAPIは現在限定的なため、コマンドベースアプローチを優先
            if (scoreboard && false) { // 現在は無効化
                debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Using scoreboard API for data retrieval`);
                // APIコードは将来の実装のために保持
            }

            // 従来のコマンドベース方式（フォールバック）
            debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Using command-based approach for data retrieval`);

            // スコアボード情報を取得
            debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Listing scoreboard players for table: ${tableName}`);
            const listResult = await world.runCommand(`scoreboard players list * ${tableName}`);
            debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: List result - success: ${listResult.successCount}, message length: ${listResult.statusMessage?.length || 0}`);
            debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Full list result message: ${listResult.statusMessage}`);

            // もし * で結果が得られない場合は、別のアプローチを試す
            if (!listResult.statusMessage || listResult.statusMessage.includes('構文エラー') || listResult.statusMessage.includes('エラー')) {
                debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Trying alternative list command...`);
                const altListResult = await world.runCommand(`scoreboard players list *`);
                debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Alternative list result: ${altListResult.statusMessage}`);

                if (altListResult.statusMessage && !altListResult.statusMessage.includes('エラー')) {
                    // 全体のリストを処理（フィルタリングしない）
                    const output = altListResult.statusMessage;
                    const lines = output.split('\n');

                    if (lines.length === 0) {
                        debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: No entries found in scoreboard output`);
                        return {
                            success: false,
                            error: "No data found in table"
                        };
                    }

                    // 全ての行を処理して、processScoreboardLinesに参加者行とスコア行のペア関係を維持
                    return this.processScoreboardLines(lines, id, timestamp, tableName);
                }

                debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Both list commands failed`);
                return {
                    success: false,
                    error: "Failed to list scoreboard data or no data found"
                };
            }

            // successCountがundefinedでもstatusMessageがあれば成功とみなす
            const hasData = listResult.statusMessage && listResult.statusMessage.length > 0 &&
                !listResult.statusMessage.includes('エラー') && !listResult.statusMessage.includes('error') &&
                !listResult.statusMessage.includes('構文エラー');

            if (!hasData) {
                debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: No data found or command failed`);
                return {
                    success: false,
                    error: "Failed to list scoreboard data or no data found"
                };
            }

      // 結果を解析してIDに一致するparticipantを検索
      const output = listResult.statusMessage || "";
      const lines = output.split('\n');
      debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Processing ${lines.length} lines from scoreboard output`);
      
      // ヘルパーメソッドを使用して行を処理
      return this.processScoreboardLines(lines, id, timestamp, tableName);
    } catch (error) {
      console.error(`[JsonScoreboardDatabase][${timestamp}] ERROR: getJsonDirect error:`, error);
      return {
        success: false,
        error: String(error)
      };
    }
  }    // データを削除
    public async deleteJsonDirect(tableName: string, id: number): Promise<JsonDatabaseResponse> {
        const timestamp = new Date().toISOString();
        debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: deleteJsonDirect called - table: ${tableName}, id: ${id}`);

        try {
            if (!(await this.getOrCreateObjective(tableName))) {
                return {
                    success: false,
                    error: `Failed to access table: ${tableName}`
                };
            }

            const worldData = this.getWorldWithScoreboard();
            if (!worldData) {
                return {
                    success: false,
                    error: "No world available"
                };
            }

            const { world, scoreboard } = worldData;

            // まず対象テーブルからデータを取得して存在確認
            debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Getting data from target table ${tableName} before deletion`);
            const getResult = await this.getJsonDirect(tableName, id);
            if (!getResult.success) {
                debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: ID ${id} not found in target table ${tableName}`);
                return {
                    success: false,
                    error: `ID ${id} not found in table ${tableName}`
                };
            }

            // participant名（JSON文字列）を取得
            const jsonString = JSON.stringify(getResult.data);
            debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Found JSON data to delete: ${jsonString.substring(0, 100)}...`);

            // Socket-BEのスコアボードAPIは現在限定的なため、コマンドベースアプローチを優先
            if (scoreboard && false) { // 現在は無効化
                // APIコードは将来の実装のために保持
            }

            // 従来のコマンドベース方式（フォールバック）
            
            // 複数の削除アプローチを試す
            let deleteSuccess = false;
            let lastError = "";
            
            // アプローチ1: エスケープありの削除
            try {
                const escapedJson = jsonString;
                const command1 = `scoreboard players reset "${escapedJson}" ${tableName}`;
                debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Executing delete command (approach 1): ${command1.substring(0, 100)}...`);
                const result1 = await world.runCommand(command1);
                debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Delete command result (approach 1) - success: ${result1.successCount}, message: ${result1.statusMessage}`);
                
                if (result1.successCount > 0 || (result1.statusMessage && !result1.statusMessage.includes('エラー'))) {
                    deleteSuccess = true;
                }
            } catch (error1) {
                lastError = String(error1);
                debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Delete approach 1 failed: ${error1}`);
            }
            
            // アプローチ2: エスケープなしの削除（失敗した場合のみ）
            if (!deleteSuccess) {
                try {
                    const command2 = `scoreboard players reset "${jsonString}" ${tableName}`;
                    debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Executing delete command (approach 2): ${command2.substring(0, 100)}...`);
                    const result2 = await world.runCommand(command2);
                    debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Delete command result (approach 2) - success: ${result2.successCount}, message: ${result2.statusMessage}`);
                    
                    if (result2.successCount > 0 || (result2.statusMessage && !result2.statusMessage.includes('エラー'))) {
                        deleteSuccess = true;
                    }
                } catch (error2) {
                    lastError = String(error2);
                    debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Delete approach 2 failed: ${error2}`);
                }
            }

            // 初期削除試行の結果確認
            if (!deleteSuccess) {
                debugError(`[JsonScoreboardDatabase][${timestamp}] ERROR: All initial delete attempts failed for ID ${id}. Last error: ${lastError}`);
            }
            
            // 削除後にデータが実際に削除されたかを確認
            debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Verifying deletion of ID ${id} from table ${tableName}`);
            
            // 短時間待機してからデータの存在確認
            await new Promise(resolve => setTimeout(resolve, 150));
            
            const verifyResult = await this.getJsonDirect(tableName, id);
            const isActuallyDeleted = !verifyResult.success;
            
            if (isActuallyDeleted) {
                debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Deletion verified - ID ${id} successfully removed from table ${tableName}`);
                return {
                    success: true,
                    data: { deletedId: id, deletedFromTable: tableName, verified: true }
                };
            } else {
                debugLog(`[JsonScoreboardDatabase][${timestamp}] WARNING: Deletion not verified - ID ${id} still exists in table ${tableName} after delete command`);
                
                // 追加の削除試行 - より強力な方法
                debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Attempting forceful delete approach for ID ${id}`);
                
                try {
                    // アプローチ3: 単純化されたコマンド
                    const simpleCommand = `scoreboard players reset * ${tableName}`;
                    debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Executing forceful delete command: ${simpleCommand.substring(0, 100)}...`);
                    await world.runCommand(simpleCommand);
                    
                    // 最終確認
                    await new Promise(resolve => setTimeout(resolve, 200));
                    const finalVerifyResult = await this.getJsonDirect(tableName, id);
                    const isFinalDeleted = !finalVerifyResult.success;
                    
                    if (isFinalDeleted) {
                        debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Forceful deletion successful for ID ${id} from table ${tableName}`);
                        return {
                            success: true,
                            data: { deletedId: id, deletedFromTable: tableName, verified: true, forcefulMethod: true }
                        };
                    } else {
                        debugError(`[JsonScoreboardDatabase][${timestamp}] ERROR: All deletion methods failed for ID ${id} in table ${tableName}`);
                        return {
                            success: false,
                            error: `Failed to delete ID ${id} from table ${tableName} - data persists after all deletion attempts`,
                            data: { 
                                stillExists: finalVerifyResult.data,
                                originalData: getResult.data,
                                attemptedMethods: ['escaped', 'unescaped', 'partial']
                            }
                        };
                    }
                } catch (finalError) {
                    debugError(`[JsonScoreboardDatabase][${timestamp}] ERROR: Final deletion method failed:`, finalError);
                    return {
                        success: false,
                        error: `Delete verification failed and final method errored: ${String(finalError)}`,
                        data: { 
                            stillExists: verifyResult.data,
                            originalData: getResult.data,
                            lastError: String(finalError)
                        }
                    };
                }
            }
        } catch (error) {
            debugError(`[JsonScoreboardDatabase][${timestamp}] ERROR: deleteJsonDirect error:`, error);
            return {
                success: false,
                error: String(error)
            };
        }
    }

    // データの存在確認
    public async existsJsonDirect(tableName: string, id: number): Promise<JsonDatabaseResponse> {
        const timestamp = new Date().toISOString();
        debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: existsJsonDirect called - table: ${tableName}, id: ${id}`);

        try {
            debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: Calling getJsonDirect for existence check`);
            const getResult = await this.getJsonDirect(tableName, id);
            debugLog(`[JsonScoreboardDatabase][${timestamp}] DEBUG: getJsonDirect result for exists check - success: ${getResult.success}`);

            return {
                success: true,
                data: { exists: getResult.success }
            };
        } catch (error) {
            console.error(`[JsonScoreboardDatabase][${timestamp}] ERROR: existsJsonDirect error:`, error);
            return {
                success: false,
                error: String(error)
            };
        }
    }

    // テーブル内の全データを取得
    public async listJsonDirect(tableName: string): Promise<JsonDatabaseResponse> {
        try {
            if (!(await this.getOrCreateObjective(tableName))) {
                return {
                    success: false,
                    error: `Failed to access table: ${tableName}`
                };
            }

            const worldData = this.getWorldWithScoreboard();
            if (!worldData) {
                return {
                    success: false,
                    error: "No world available"
                };
            }

            const { world, scoreboard } = worldData;
            let items: any[] = [];

            // Socket-BEのスコアボードAPIは現在限定的なため、コマンドベースアプローチを優先
            if (scoreboard && false) { // 現在は無効化
                // APIコードは将来の実装のために保持
            }

            // 従来のコマンドベース方式（フォールバック）
            debugLog(`[JsonScoreboardDatabase] DEBUG: Using command-based approach for listing`);

      // スコアボード情報を取得
      const listResult = await world.runCommand(`scoreboard players list * ${tableName}`);
      
      // もし * で結果が得られない場合は、別のアプローチを試す
      let finalOutput = "";
      if (!listResult.statusMessage || listResult.statusMessage.includes('構文エラー') || listResult.statusMessage.includes('エラー')) {
        debugLog(`[JsonScoreboardDatabase] DEBUG: Trying alternative list command for listJsonDirect...`);
        const altListResult = await world.runCommand(`scoreboard players list *`);
        
        if (altListResult.statusMessage && !altListResult.statusMessage.includes('エラー')) {
          finalOutput = altListResult.statusMessage;
        }
      } else {
        finalOutput = listResult.statusMessage || "";
      }
      
      // successCountがundefinedでもstatusMessageがあれば処理を続行
      const hasData = finalOutput.length > 0 && 
                     !finalOutput.includes('エラー') && !finalOutput.includes('error') &&
                     !finalOutput.includes('構文エラー');

      if (!hasData) {
        return {
          success: true,
          data: { items: [], count: 0 }
        };
      }

      const lines = finalOutput.split('\n');
      let currentParticipant = "";
      
      for (const line of lines) {
        // スコアボードの新しい出力形式を解析
        // 形式1: "§a選択された X 個のオブジェクトを PARTICIPANT に表示:"
        const participantMatch = line.match(/§a選択された\s+\d+\s+個のオブジェクトを\s+(.+?)\s+に表示:/);
        if (participantMatch) {
          currentParticipant = participantMatch[1].trim();
          debugLog(`[JsonScoreboardDatabase] DEBUG: Found participant for listing: "${currentParticipant.substring(0, 50)}..."`);
          continue;
        }

        // 形式2: "- JSON Table: tableName: score (tableName)"
        const scoreMatch = line.match(/^-\s+JSON Table:\s+(.+?):\s+(\d+)\s+\((.+?)\)$/);
        if (scoreMatch && currentParticipant) {
          const tableNameInLine = scoreMatch[1].trim();
          const score = parseInt(scoreMatch[2]);
          const actualTableName = scoreMatch[3].trim();

          // テーブル名の厳格なチェック: 要求されたテーブル名と実際のテーブル名が一致する場合のみ処理
          if (actualTableName === tableName) {
            // JSONで始まる participant名のみ処理
            if (currentParticipant.startsWith('{')) {
              try {
                // エスケープされた文字列をアンエスケープ
                let unescapedParticipant = currentParticipant;
                
                // バックスラッシュエスケープを処理
                if (unescapedParticipant.includes('\\"')) {
                  unescapedParticipant = unescapedParticipant.replace(/\\"/g, '"');
                }
                
                const jsonData = JSON.parse(unescapedParticipant);
                items.push({
                  id: score,
                  data: jsonData
                });
                debugLog(`[JsonScoreboardDatabase] DEBUG: Added item with ID ${score} from new format (table: ${actualTableName})`);
              } catch (parseError) {
                console.warn(`[JsonScoreboardDatabase] Failed to parse JSON for ID ${score} (new format, table: ${actualTableName}): ${parseError}`);
                continue;
              }
            }
          } else {
            debugLog(`[JsonScoreboardDatabase] DEBUG: Skipping entry from different table: ${actualTableName} (looking for ${tableName})`);
          }
          continue;
        }

        // 従来の形式も残しておく (フォールバック)
        let match = line.match(/^(.+):\s*(\d+)$/);
        if (!match) {
          match = line.match(/^(.+?)\s*の\s*.+?\s*を\s*(\d+)\s*に設定しました/);
        }
        
        if (match) {
          const participantName = match[1].trim();
          const score = parseInt(match[2]);
          
          // JSONで始まる participant名のみ処理
          if (participantName.startsWith('{')) {
            try {
              // エスケープされた文字列をアンエスケープ
              let unescapedParticipant = participantName;
              
              // バックスラッシュエスケープを処理
              if (unescapedParticipant.includes('\\"')) {
                unescapedParticipant = unescapedParticipant.replace(/\\"/g, '"');
              }
              
              const jsonData = JSON.parse(unescapedParticipant);
              items.push({
                id: score,
                data: jsonData
              });
              debugLog(`[JsonScoreboardDatabase] DEBUG: Added item with ID ${score} from legacy format`);
            } catch (parseError) {
              console.warn(`[JsonScoreboardDatabase] Failed to parse JSON for ID ${score} (legacy format): ${parseError}`);
              continue;
            }
          }
        }
      }            return {
                success: true,
                data: { items: items, count: items.length }
            };
        } catch (error) {
            return {
                success: false,
                error: String(error)
            };
        }
    }

    // テーブルをクリア
    public async clearJsonDirect(tableName: string): Promise<JsonDatabaseResponse> {
        try {
            if (!(await this.getOrCreateObjective(tableName))) {
                return {
                    success: false,
                    error: `Failed to access table: ${tableName}`
                };
            }

            const worldData = this.getWorldWithScoreboard();
            if (!worldData) {
                return {
                    success: false,
                    error: "No world available"
                };
            }

            const { world, scoreboard } = worldData;

            // Socket-BEのスコアボードAPIは現在限定的なため、コマンドベースアプローチを優先
            if (scoreboard && false) { // 現在は無効化
                // APIコードは将来の実装のために保持
            }

            // 従来のコマンドベース方式（フォールバック）
            // スコアボードオブジェクトを削除して再作成
            const removeResult = await world.runCommand(`scoreboard objectives remove ${tableName}`);

            // successCountがundefinedでもエラーメッセージがなければ成功とみなす
            const removeSuccess = removeResult.successCount !== 0 ||
                !removeResult.statusMessage?.includes('エラー');

            if (!removeSuccess && removeResult.successCount === 0) {
                return {
                    success: false,
                    error: `Failed to remove objective: ${removeResult.statusMessage || 'Unknown error'}`
                };
            }

            // 再作成
            const createResult = await world.runCommand(`scoreboard objectives add ${tableName} dummy "JSON Table: ${tableName}"`);

            const createSuccess = createResult.successCount !== 0 ||
                !createResult.statusMessage?.includes('エラー');

            if (!createSuccess && createResult.successCount === 0) {
                return {
                    success: false,
                    error: `Failed to recreate objective: ${createResult.statusMessage || 'Unknown error'}`
                };
            }

            return {
                success: true,
                data: { clearedCount: -1 } // 正確な数は取得困難なので-1で表示
            };
        } catch (error) {
            return {
                success: false,
                error: String(error)
            };
        }
    }
}

// Direct Database API - 簡単で直感的なAPI
class DirectDatabaseAPI {
    constructor(private db: JsonScoreboardDatabase) { }

    // データを追加/更新
    async add(tableName: string, id: number, data: any): Promise<JsonDatabaseResponse> {
        return await this.db.setJsonDirect(tableName, id, data);
    }

    // データを設定/更新
    async set(tableName: string, id: number, data: any): Promise<JsonDatabaseResponse> {
        return await this.db.setJsonDirect(tableName, id, data);
    }

    // データを取得
    async get(tableName: string, id: number): Promise<JsonDatabaseResponse> {
        return await this.db.getJsonDirect(tableName, id);
    }

    // データを削除
    async delete(tableName: string, id: number): Promise<JsonDatabaseResponse> {
        return await this.db.deleteJsonDirect(tableName, id);
    }

    // データの存在確認
    async exists(tableName: string, id: number): Promise<JsonDatabaseResponse> {
        return await this.db.existsJsonDirect(tableName, id);
    }

    // テーブル内の全データを取得
    async list(tableName: string): Promise<JsonDatabaseResponse> {
        return await this.db.listJsonDirect(tableName);
    }

    // テーブルをクリア
    async clear(tableName: string): Promise<JsonDatabaseResponse> {
        return await this.db.clearJsonDirect(tableName);
    }
}

// グローバルインスタンス
const jsonScoreboardDB = JsonScoreboardDatabase.getInstance();

// 簡易APIインスタンス
const jsonDB = {
    // 基本操作
    add: async (tableName: string, id: number, data: any) => await jsonScoreboardDB.setJsonDirect(tableName, id, data),
    set: async (tableName: string, id: number, data: any) => await jsonScoreboardDB.setJsonDirect(tableName, id, data),
    get: async (tableName: string, id: number) => await jsonScoreboardDB.getJsonDirect(tableName, id),
    delete: async (tableName: string, id: number) => await jsonScoreboardDB.deleteJsonDirect(tableName, id),
    exists: async (tableName: string, id: number) => await jsonScoreboardDB.existsJsonDirect(tableName, id),
    list: async (tableName: string) => await jsonScoreboardDB.listJsonDirect(tableName),
    clear: async (tableName: string) => await jsonScoreboardDB.clearJsonDirect(tableName),

    // Direct APIプロパティ
    direct: new DirectDatabaseAPI(jsonScoreboardDB)
};

// 使用例とテスト（非同期対応）
debugLog("[JsonScoreboardDatabase] Backend JSON Database initialized");
debugLog("[JsonScoreboardDatabase] Current mode: Command-based approach (Socket-BE API compatibility mode)");




// エクスポート
export { jsonScoreboardDB, jsonDB };
export type { JsonDatabaseResponse };