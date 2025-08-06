import {
    CustomCommandParamType,
    CommandPermissionLevel,
    CustomCommandOrigin,
    CustomCommandResult,
} from "@minecraft/server";


export interface CommandParameter {
    name: string;
    type: CustomCommandParamType;
    description?: string;
    isOptional?: boolean;
    enumName?: string;
    enumValues?: string[];
}

/**
 * BaseCommandクラスで実装されるべきインターフェース（参考用）
 */
export interface ICommand {
    name: string;
    description: string;
    permissionLevel: CommandPermissionLevel;
    parameters: CommandParameter[];
    execute(origin: CustomCommandOrigin, ...args: any[]): CustomCommandResult | void;
}