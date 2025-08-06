import { system, StartupEvent, CustomCommandParamType } from "@minecraft/server";
import type { BaseCommand } from "./BaseCommand";

class CommandRegistryService {
    private static instance: CommandRegistryService;
    private commandsToRegister: BaseCommand[] = [];
    private registeredEnums: Set<string> = new Set();
    private commandInstances: BaseCommand[] = [];

    private constructor() {
        system.beforeEvents.startup.subscribe((event: StartupEvent) => {
            this.initializeCommands(event);
        });
        console.log("[CommandAPI] CommandRegistryService initialized and subscribed to startup.");
    }

    public static getInstance(): CommandRegistryService {
        if (!CommandRegistryService.instance) {
            CommandRegistryService.instance = new CommandRegistryService();
        }
        return CommandRegistryService.instance;
    }

    public registerCommand(commandInstance: BaseCommand): void {
        if (this.commandInstances.some(cmd => cmd.name === commandInstance.name)) {
            console.warn(
                `[CommandAPI] Command with name "${commandInstance.name}" is already queued (or registered) for registration. ` +
                `Duplicate command names can cause issues. Ensure command names are unique.`
            );
        } else {
            this.commandsToRegister.push(commandInstance);
            this.commandInstances.push(commandInstance);
            console.log(`[CommandAPI] Command "${commandInstance.name}" queued for registration.`);
        }
    }

    public getRegisteredCommands(): ReadonlyArray<BaseCommand> {
        return [...this.commandInstances];
    }

    private initializeCommands(startupEvent: StartupEvent): void {
        const registry = startupEvent.customCommandRegistry;
        if (!registry) {
            console.error("[CommandAPI] CustomCommandRegistry not found in startupEvent. Commands will not be registered.");
            return;
        }
        console.log(`[CommandAPI] Initializing ${this.commandsToRegister.length} commands from queue...`);

        const commandsBeingProcessed = [...this.commandsToRegister];
        this.commandsToRegister = [];

        for (const command of commandsBeingProcessed) {
            try {
                for (const param of command.parameters) {
                    if (param.type === CustomCommandParamType.Enum && param.enumName && param.enumValues) {
                        if (!this.registeredEnums.has(param.enumName)) {
                            registry.registerEnum(param.enumName, param.enumValues);
                            this.registeredEnums.add(param.enumName);
                            console.log(`[CommandAPI] Enum "${param.enumName}" registered for command "${command.name}".`);
                        }
                    }
                }

                const commandDefinition = command.getCustomCommandDefinition();
                const callback = command.getCallbackFunction();
                registry.registerCommand(commandDefinition, callback);
                console.log(`[CommandAPI] Command "${command.name}" registered successfully.`);

            } catch (error: any) {
                console.error(`[CommandAPI] Failed to register command "${command.name}": ${error.stack || error}`);
            }
        }
    }
}

export const GlobalCommandRegistry = CommandRegistryService.getInstance();