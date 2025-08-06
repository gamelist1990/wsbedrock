import { BaseCommand } from "../Modules/CommandAPI/BaseCommand";
import { CustomCommandResult, CustomCommandStatus, CommandPermissionLevel, Player, CustomCommandOrigin } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { ver } from "../Modules/version";
import { GlobalCommandRegistry } from "../Modules/CommandAPI/CommandRegistry";

/**
 * /about コマンド: プラグインやアドオンの情報を表示
 */
export class AboutCommand extends BaseCommand {
    readonly name = "chest:about";
    readonly description = "ChestlockAddon2の情報を表示します。";
    readonly permissionLevel = CommandPermissionLevel.Any;
    readonly parameters = [];

    execute(origin: CustomCommandOrigin): CustomCommandResult {
        let player: Player | undefined = undefined;
        if (origin?.sourceEntity instanceof Player) {
            player = origin.sourceEntity;
        }
        if (!player) {
            return {
                status: CustomCommandStatus.Failure,
                message: "プレイヤーが見つかりません。"
            };
        }
        const aboutMessage = [
            `ChestlockAddon2 ${ver}`,
            "Created by こう君",
            "詳細は Github の Readme を参照してください。",
        ].join("\n");

        const form = new ActionFormData()
            .title("ChestlockAddon2について")
            .body(aboutMessage)
            .button("OK");
        form.show(player as any);
        return {
            status: CustomCommandStatus.Success,
            message: "フォームで情報を表示しました。"
        };
    }
}

GlobalCommandRegistry.registerCommand(new AboutCommand());
