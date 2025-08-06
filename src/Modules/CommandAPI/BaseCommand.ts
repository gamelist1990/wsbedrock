import {
    CustomCommandOrigin,
    CustomCommandResult,
    CustomCommandStatus,
    CommandPermissionLevel,
    CustomCommand,
    CustomCommandParamType,
    system,
    world,
} from "@minecraft/server";
import type { CommandParameter } from "./types";

/**
 * 全てのカスタムコマンドの基底クラス。
 * 新しいコマンドを作成する際は、このクラスを継承してください。
 */
export abstract class BaseCommand {
    /**
     * コマンドの一意な名前（`namespace:command_name` 形式を推奨）。
     * 例: "util:ping"
     */
    abstract readonly name: string;

    /**
     * コマンドの説明文。
     */
    abstract readonly description: string;

    /**
     * コマンドの実行に必要な権限レベル。
     * デフォルト: `CommandPermissionLevel.Admin`
     */
    readonly permissionLevel: CommandPermissionLevel = CommandPermissionLevel.Admin;

    /**
     * コマンドが受け取るパラメータの定義配列。
     */
    readonly parameters: CommandParameter[] = [];

    /**
     * コマンドの実行ロジック。
     * このメソッドは、コマンドが実行されたときに呼び出されます。
     * @param origin コマンドの実行元情報。
     * @param args コマンドに渡された引数。`parameters` で定義された順序で渡されます。
     * @returns コマンドの実行結果、または成功時はvoid。
     */
    abstract execute(origin: CustomCommandOrigin, ...args: any[]): CustomCommandResult | void;

    /**
     * @internal
     * MinecraftのCustomCommand APIが要求する形式にコマンド定義を変換します。
     */
    getCustomCommandDefinition(): CustomCommand {
        console.log(`[CommandAPI-Debug] getCustomCommandDefinition for ${this.name}. Parameters: ${JSON.stringify(this.parameters)}`);
        const mandatoryParams: { type: CustomCommandParamType; name: string }[] = [];
        const optionalParams: { type: CustomCommandParamType; name: string }[] = [];

        if (!this.parameters) {
            console.error(`[CommandAPI-Error] Command "${this.name}" has no parameters array defined!`);
            throw new Error(`Command "${this.name}" has no parameters array defined.`);
        }

        for (const param of this.parameters) {
            if (!param) {
                console.error(`[CommandAPI-Error] Found undefined parameter object in command "${this.name}" during getCustomCommandDefinition.`);
                throw new Error(`Undefined parameter object found in command "${this.name}". Check parameters definition.`);
            }

            if (typeof param.name !== 'string' || !param.name.trim()) {
                console.error(`[CommandAPI-Error] Parameter in command "${this.name}" is missing 'name' property, it's not a string, or it's empty. Parameter: ${JSON.stringify(param)}`);
                throw new Error(`Parameter in command "${this.name}" has invalid 'name'.`);
            }
            if (typeof param.type === 'undefined') {
                console.error(`[CommandAPI-Error] Parameter "${param.name}" in command "${this.name}" is missing 'type' property. Parameter: ${JSON.stringify(param)}`);
                throw new Error(`Parameter "${param.name}" in command "${this.name}" is missing 'type'.`);
            }

            let paramIdentifierForNative = param.name;

            if (param.type === CustomCommandParamType.Enum) {
                if (!param.enumName || typeof param.enumName !== 'string' || !param.enumName.trim() || !param.enumValues || !Array.isArray(param.enumValues) || param.enumValues.length === 0) {
                    console.error(`[CommandAPI-Error] Enum parameter "${param.name}" for command "${this.name}" is missing or has invalid 'enumName' or 'enumValues'. Param: ${JSON.stringify(param)}`);
                    throw new Error(
                        `Enum parameter "${param.name}" for command "${this.name}" must have a valid 'enumName' (non-empty string) and 'enumValues' (non-empty array).`,
                    );
                }
                paramIdentifierForNative = param.enumName;
            }

            const nativeParam = {
                type: param.type,
                name: paramIdentifierForNative,
            };

            if (param.isOptional) {
                optionalParams.push(nativeParam);
            } else {
                mandatoryParams.push(nativeParam);
            }
        }

        return {
            name: this.name,
            description: this.description,
            permissionLevel: this.permissionLevel,
            mandatoryParameters: mandatoryParams,
            optionalParameters: optionalParams,
        };
    }

    /**
     * @internal
     * MinecraftのCustomCommand APIに渡すコールバック関数を生成します。
     */
    getCallbackFunction(): (origin: CustomCommandOrigin, params: Record<string, any>) => CustomCommandResult {
        return (origin: CustomCommandOrigin, rawParams: Record<string, any>): CustomCommandResult => {
            if (!this.parameters) {
                console.error(`[CommandAPI-Error] Command "${this.name}" has no parameters array defined during callback!`);
                return { status: CustomCommandStatus.Failure, message: `Internal error: Command "${this.name}" has no parameters array defined.` };
            }

            console.log(`[CommandAPI-Debug] getCallbackFunction for ${this.name}. Parameters: ${JSON.stringify(rawParams)}`);


            let args: any[];
            try {
                // パラメータがプリミティブ値の場合はそのまま渡す（falseも考慮）
                if (rawParams === undefined || rawParams === null) {
                    args = [];
                } else if (typeof rawParams !== "object") {
                    args = [rawParams];
                } else {
                    args = this.parameters.map(param => {
                        const value = rawParams[param.name];
                        if (value && value.typeId === "minecraft:player") {
                            const player = this.getEntityById(value.id, value.typeId);
                            return player;
                        } else if (value && value.id) {
                            const entity = this.getEntityById(value.id);
                            return entity;
                        } else {
                            return value;
                        }
                    });
                }
            } catch (e) {
                if (typeof rawParams !== "object") {
                    args = [rawParams];
                } else {
                    args = this.parameters.map(param => rawParams[param.name]);
                }
            }


            try {
                let result: any;
                system.run(() => {
                    result = this.execute(origin, ...args);
                    if (result === undefined || result === null) {
                        return { status: CustomCommandStatus.Success, message: `${this.name} executed successfully.` };
                    }
                });
                return result;
            } catch (error: any) {
                console.error(`[CommandAPI] Error executing command ${this.name}: ${error.stack || error}`);
                return {
                    status: CustomCommandStatus.Failure,
                    message: `An error occurred while executing ${this.name}: ${error.message || String(error)}`,
                };
            }
        };
    }

    /**
     * idとtypeIdからEntityまたはPlayerを取得するユーティリティ
     */
    protected getEntityById(id: string, typeId?: string): any {
        if (typeId === "minecraft:player") {
            const players = world.getPlayers();
            for (const p of players) {
                if (p.id === id) return p;
            }
            return undefined;
        } else {
            return world.getEntity(id);
        }
    }
}
