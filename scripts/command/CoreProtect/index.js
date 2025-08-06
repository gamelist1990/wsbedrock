import { Player, CustomCommandStatus, system, CommandPermissionLevel, PlayerPermissionLevel, } from "@minecraft/server";
import { BaseCommand } from "../../Modules/CommandAPI/BaseCommand";
import { GlobalCommandRegistry } from "../../Modules/CommandAPI/CommandRegistry";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { saveData, chestLockAddonData } from "../../Modules/DataBase";
import { Event } from "../../Modules/Event/Event";
const SETTINGS_KEY = "coreprotect_settings";
let coreProtectSettings = {
    logEnabled: false,
    allowNonOp: false,
};
try {
    const saved = chestLockAddonData[SETTINGS_KEY];
    if (saved && typeof saved === "object") {
        coreProtectSettings = { ...coreProtectSettings, ...saved };
    }
}
catch { }
class ItemLog {
    time;
    player;
    action;
    itemType;
    count;
    blockKey;
    constructor(time, player, action, itemType, count, blockKey) {
        this.time = time;
        this.player = player;
        this.action = action;
        this.itemType = itemType;
        this.count = count;
        this.blockKey = blockKey;
    }
}
const ITEMLOGS_KEY = "coreprotect_itemlogs";
const itemLogs = new Map();
try {
    const saved = chestLockAddonData[ITEMLOGS_KEY];
    if (saved && typeof saved === "string") {
        const obj = JSON.parse(saved);
        for (const [key, arr] of Object.entries(obj)) {
            if (Array.isArray(arr)) {
                itemLogs.set(key, arr.map((l) => new ItemLog(l.time, l.player, l.action, l.itemType, l.count, l.blockKey)));
            }
        }
    }
}
catch (e) { }
function saveItemLogs() {
    const obj = {};
    for (const [key, arr] of itemLogs.entries())
        obj[key] = arr;
    try {
        saveData(ITEMLOGS_KEY, JSON.stringify(obj));
    }
    catch (e) { }
}
const monitoringPlayers = new Map();
const NeverBlock = [
    "minecraft:clay",
    "minecraft:crimson_nylium",
    "minecraft:dirt",
    "minecraft:coarse_dirt",
    "minecraft:rooted_dirt",
    "minecraft:grass_block",
    "minecraft:gravel",
    "minecraft:mud",
    "minecraft:mycelium",
    "minecraft:podzol",
    "minecraft:sand",
    "minecraft:red_sand",
    "minecraft:soul_sand",
    "minecraft:soul_soil",
    "minecraft:warped_nylium",
    "minecraft:andesite",
    "minecraft:basalt",
    "minecraft:bedrock",
    "minecraft:blackstone",
    "minecraft:calcite",
    "minecraft:cobblestone",
    "minecraft:mossy_cobblestone",
    "minecraft:deepslate",
    "minecraft:diorite",
    "minecraft:pointed_dripstone",
    "minecraft:dripstone_block",
    "minecraft:end_stone",
    "minecraft:glowstone",
    "minecraft:granite",
    "minecraft:infested_stone",
    "minecraft:magma_block",
    "minecraft:netherrack",
    "minecraft:obsidian",
    "minecraft:sandstone",
    "minecraft:red_sandstone",
    "minecraft:stone",
    "minecraft:terracotta",
    "minecraft:tuff",
    "minecraft:amethyst_cluster",
    "minecraft:ancient_debris",
    "minecraft:budding_amethyst",
    "minecraft:coal_ore",
    "minecraft:deepslate_coal_ore",
    "minecraft:copper_ore",
    "minecraft:deepslate_copper_ore",
    "minecraft:diamond_ore",
    "minecraft:deepslate_diamond_ore",
    "minecraft:emerald_ore",
    "minecraft:deepslate_emerald_ore",
    "minecraft:gold_ore",
    "minecraft:deepslate_gold_ore",
    "minecraft:nether_gold_ore",
    "minecraft:iron_ore",
    "minecraft:deepslate_iron_ore",
    "minecraft:lapis_ore",
    "minecraft:deepslate_lapis_ore",
    "minecraft:nether_quartz_ore",
    "minecraft:redstone_ore",
    "minecraft:deepslate_redstone_ore",
    "minecraft:medium_amethyst_bud",
    "minecraft:oak_log",
    "minecraft:spruce_log",
    "minecraft:birch_log",
    "minecraft:jungle_log",
    "minecraft:acacia_log",
    "minecraft:dark_oak_log",
    "minecraft:mangrove_log",
    "minecraft:cherry_log",
    "minecraft:pale_oak_log",
    "minecraft:crimson_stem",
    "minecraft:warped_stem",
    "minecraft:stripped_oak_log",
    "minecraft:stripped_spruce_log",
    "minecraft:stripped_birch_log",
    "minecraft:stripped_jungle_log",
    "minecraft:stripped_acacia_log",
    "minecraft:stripped_dark_oak_log",
    "minecraft:stripped_mangrove_log",
    "minecraft:stripped_cherry_log",
    "minecraft:stripped_pale_oak_log",
    "minecraft:stripped_crimson_stem",
    "minecraft:stripped_warped_stem",
];
const CHEST_TYPES = [
    "minecraft:chest",
    "minecraft:barrel",
    "minecraft:hopper",
    "minecraft:undyed_shulker_box",
    "minecraft:white_shulker_box",
    "minecraft:orange_shulker_box",
    "minecraft:magenta_shulker_box",
    "minecraft:light_blue_shulker_box",
    "minecraft:yellow_shulker_box",
    "minecraft:lime_shulker_box",
    "minecraft:pink_shulker_box",
    "minecraft:gray_shulker_box",
    "minecraft:light_gray_shulker_box",
    "minecraft:cyan_shulker_box",
    "minecraft:purple_shulker_box",
    "minecraft:blue_shulker_box",
    "minecraft:brown_shulker_box",
    "minecraft:green_shulker_box",
    "minecraft:red_shulker_box",
    "minecraft:black_shulker_box",
    "minecraft:trapped_chest",
    "minecraft:copper_chest",
    "minecraft:weathered_copper_chest",
    "minecraft:exposed_copper_chest",
    "minecraft:oxidized_copper_chest",
    "minecraft:waxed_copper_chest",
    "minecraft:waxed_exposed_copper_chest",
    "minecraft:waxed_weathered_copper_chest",
    "minecraft:waxed_oxidized_copper_chest",
    "minecraft:anvil",
    "minecraft:ender_chest",
];
Event.PlayerInteractWithBlock.add((ev) => {
    if (!coreProtectConfig.logEnabled)
        return;
    const player = ev.player;
    const pid = player.id ?? player.name;
    if (searchModePlayers.has(pid)) {
        return;
    }
    const block = ev.block;
    if (!CHEST_TYPES.includes(block.typeId))
        return;
    const blockKey = getBlockKey(block.location);
    let slotSnapshot = {};
    try {
        const inv = block.getComponent?.("inventory");
        if (inv &&
            typeof inv.container === "object" &&
            typeof inv.container.getItem === "function") {
            for (let i = 0; i < inv.container.size; i++) {
                const item = inv.container.getItem(i);
                if (item) {
                    slotSnapshot[item.typeId] =
                        (slotSnapshot[item.typeId] ?? 0) + item.amount;
                }
            }
        }
    }
    catch { }
    monitoringPlayers.set(player.name, {
        block,
        blockKey,
        location: {
            x: player.location.x,
            y: player.location.y,
            z: player.location.z,
        },
        time: Date.now(),
        slotSnapshot,
    });
});
Event.PlayerInventoryItemChange.add((ev) => {
    const player = ev.player;
    const pid = player.id ?? player.name;
    if (searchModePlayers.has(pid)) {
        return;
    }
    let blockRay;
    let blockObj = undefined;
    try {
        blockRay = player.getBlockFromViewDirection();
        blockObj = blockRay?.block;
    }
    catch (e) {
        blockObj = undefined;
    }
    if (!blockObj || !CHEST_TYPES.includes(blockObj.typeId)) {
        return;
    }
    const info = monitoringPlayers.get(player.name);
    if (!info) {
        return;
    }
    let currentSlot = {};
    try {
        const inv = blockObj.getComponent?.("inventory");
        if (inv &&
            typeof inv.container === "object" &&
            typeof inv.container.getItem === "function") {
            for (let i = 0; i < inv.container.size; i++) {
                const item = inv.container.getItem(i);
                if (item) {
                    currentSlot[item.typeId] =
                        (currentSlot[item.typeId] ?? 0) + item.amount;
                }
            }
        }
    }
    catch (e) { }
    for (const typeId of Object.keys(currentSlot)) {
        const beforeCount = info.slotSnapshot[typeId] ?? 0;
        const afterCount = currentSlot[typeId];
        if (afterCount > beforeCount) {
            const log = new ItemLog(getJSTString(), player.name, "add", typeId, afterCount - beforeCount, info.blockKey);
            if (!itemLogs.has(info.blockKey))
                itemLogs.set(info.blockKey, []);
            itemLogs.get(info.blockKey).push(log);
            saveItemLogs();
        }
    }
    for (const typeId of Object.keys(info.slotSnapshot)) {
        const beforeCount = info.slotSnapshot[typeId];
        const afterCount = currentSlot[typeId] ?? 0;
        if (afterCount < beforeCount) {
            const log = new ItemLog(getJSTString(), player.name, "remove", typeId, beforeCount - afterCount, info.blockKey);
            if (!itemLogs.has(info.blockKey))
                itemLogs.set(info.blockKey, []);
            itemLogs.get(info.blockKey).push(log);
            saveItemLogs();
        }
    }
    info.slotSnapshot = { ...currentSlot };
});
function showItemLogDetailForm(player, log) {
    const form = new ModalFormData();
    form.title("アイテム操作ログ詳細");
    form.textField("操作種別", log.action);
    form.textField("アイテム", log.itemType);
    form.textField("個数", String(log.count));
    form.textField("プレイヤー", log.player);
    form.textField("座標", log.blockKey);
    form.textField("時刻", log.time);
    form.show(player);
}
class BlockLog {
    time;
    player;
    action;
    blockType;
    constructor(time, player, action, blockType) {
        this.time = time;
        this.player = player;
        this.action = action;
        this.blockType = blockType;
    }
}
const blockLogs = new Map();
const CONFIG_KEY = "coreprotect_config";
let coreProtectConfig = {
    logEnabled: false,
    allowNonOp: false,
};
function loadCoreProtectConfig() {
    try {
        const saved = chestLockAddonData[CONFIG_KEY];
        if (saved && typeof saved === "object") {
            coreProtectConfig = { ...coreProtectConfig, ...saved };
        }
        else if (typeof saved === "string") {
            try {
                const parsed = JSON.parse(saved);
                if (typeof parsed === "object") {
                    coreProtectConfig = { ...coreProtectConfig, ...parsed };
                }
            }
            catch (e) { }
        }
    }
    catch (e) { }
}
function saveCoreProtectConfig() {
    try {
        const json = JSON.stringify(coreProtectConfig, null, 2);
        saveData(CONFIG_KEY, json);
    }
    catch (e) { }
}
function getBlockKey(loc) {
    return `${loc.x},${loc.y},${loc.z}`;
}
function getJSTString() {
    const date = new Date();
    date.setHours(date.getHours() + 9);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const h = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    const s = String(date.getSeconds()).padStart(2, "0");
    return `${y}/${m}/${d} ${h}:${min}:${s}`;
}
const searchModePlayers = new Set();
class CoreProtectCommand extends BaseCommand {
    name = "chest:co";
    description = "CoreProtect ログ管理コマンド";
    permissionLevel = CommandPermissionLevel.GameDirectors;
    parameters = [];
    execute(origin, _action) {
        let player = undefined;
        if (origin?.sourceEntity instanceof Player) {
            player = origin.sourceEntity;
        }
        if (!player) {
            return {
                status: CustomCommandStatus.Failure,
                message: "プレイヤーが見つかりません。",
            };
        }
        const form = new ModalFormData();
        form.title("CoreProtect 設定");
        form.toggle("ログ記録を有効にする", {
            defaultValue: coreProtectConfig.logEnabled,
        });
        form.toggle("OP以外も #co を使える", {
            defaultValue: coreProtectConfig.allowNonOp,
        });
        form.dropdown("復元UIを開く", ["開かない", "開く"]);
        form.show(player).then((res) => {
            if (res.canceled || !res.formValues)
                return;
            coreProtectConfig.logEnabled = !!res.formValues[0];
            coreProtectConfig.allowNonOp = !!res.formValues[1];
            saveCoreProtectConfig();
            player.sendMessage(`§b[CoreProtect] ログ記録: ${coreProtectConfig.logEnabled ? "有効" : "無効"}`);
            player.sendMessage(`§b[CoreProtect] #coコマンド: ${coreProtectConfig.allowNonOp ? "全員可" : "OPのみ"}`);
            if (res.formValues[2] === 1) {
                showRestoreForm(player);
            }
        });
        return {
            status: CustomCommandStatus.Success,
            message: "CoreProtect設定フォーム表示完了",
        };
    }
}
function showRestoreForm(player) {
    const form = new ModalFormData();
    form.title("CoreProtect 復元UI");
    form.slider("範囲（自分中心、半径）", 10, 50);
    form.slider("何分前までロールバック", 5, 60);
    form.show(player).then((res) => {
        if (res.canceled || !res.formValues)
            return;
        const radius = Number(res.formValues[0]);
        const minutes = Number(res.formValues[1]);
        restoreBlocks(player, radius, minutes);
    });
}
function restoreBlocks(player, radius, minutes) {
    const loc = player.location;
    const now = new Date();
    const threshold = new Date(now.getTime() - minutes * 60 * 1000);
    let restored = 0;
    blockLogs.forEach((logs, key) => {
        const [x, y, z] = key.split(",").map(Number);
        const dist = Math.sqrt(Math.pow(loc.x - x, 2) + Math.pow(loc.y - y, 2) + Math.pow(loc.z - z, 2));
        if (dist > radius)
            return;
        logs.forEach((log) => {
            const logDate = new Date(log.time);
            if ((log.action === "break" || log.action === "explosion") &&
                logDate >= threshold) {
                try {
                    const block = player.dimension.getBlock({ x, y, z });
                    if (block) {
                        block.setType(log.blockType);
                        restored++;
                    }
                }
                catch (e) {
                }
            }
        });
    });
    player.sendMessage(`§a[CoreProtect] 復元完了: ${restored} 箇所`);
}
GlobalCommandRegistry.registerCommand(new CoreProtectCommand());
function showBlockLogsForm(player, key, logs, page = 0) {
    const itemLogArr = itemLogs.get(key) ?? [];
    const allLogs = [
        ...logs.map((l) => ({ type: "block", log: l, time: l.time })),
        ...itemLogArr.map((l) => ({ type: "item", log: l, time: l.time })),
    ].sort((a, b) => b.time.localeCompare(a.time));
    const PAGE_SIZE = 10;
    const totalPages = Math.ceil(allLogs.length / PAGE_SIZE);
    const start = page * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, allLogs.length);
    const form = new ActionFormData();
    form.title(`CoreProtect ログ表示 (ページ ${page + 1}/${totalPages})`);
    let btns = [];
    for (let i = start; i < end; i++) {
        const entry = allLogs[i];
        if (entry.type === "block") {
            const l = entry.log;
            let color = "";
            let icon = "textures/ui/icon_import";
            if (l.action === "place") {
                color = "§a";
                icon = "textures/ui/plus";
            }
            else if (l.action === "break") {
                color = "§c";
                icon = "textures/ui/minus";
            }
            else if (l.action === "interact") {
                color = "§e";
                icon = "textures/ui/icon_import";
            }
            else if (l.action === "explosion") {
                color = "§d";
                icon = "textures/ui/icon_redstone";
            }
            form.button(`${color}${l.action}§r ${l.blockType} (${l.player})`, icon);
            btns.push(`block${i}`);
        }
        else if (entry.type === "item") {
            const l = entry.log;
            let color = l.action === "add" ? "§a" : "§c";
            let icon = l.action === "add" ? "textures/ui/plus" : "textures/ui/minus";
            form.button(`${color}${l.action}§r ${l.itemType} x${l.count} (${l.player})`, icon);
            btns.push(`item${i}`);
        }
    }
    if (page > 0) {
        form.button("前へ", "textures/ui/arrow_left");
        btns.push("prev");
    }
    if (page < totalPages - 1) {
        form.button("次へ", "textures/ui/arrow_right");
        btns.push("next");
    }
    form.button("閉じる", "textures/ui/icon_import");
    btns.push("close");
    form.show(player).then((res) => {
        if (res.canceled || typeof res.selection !== "number")
            return;
        const btnIndex = res.selection;
        const btnType = btns[btnIndex];
        if (btnType?.startsWith("block")) {
            const logIdx = start + btnIndex;
            const entry = allLogs[logIdx];
            if (entry && entry.type === "block")
                showBlockLogDetailForm(player, entry.log);
        }
        else if (btnType?.startsWith("item")) {
            const logIdx = start + btnIndex;
            const entry = allLogs[logIdx];
            if (entry && entry.type === "item")
                showItemLogDetailForm(player, entry.log);
        }
        else if (btnType === "prev") {
            showBlockLogsForm(player, key, logs, page - 1);
        }
        else if (btnType === "next") {
            showBlockLogsForm(player, key, logs, page + 1);
        }
    });
}
function showBlockLogDetailForm(player, log) {
    const form = new ModalFormData();
    form.title("ブロック操作ログ詳細");
    form.textField("操作種別", log.action);
    form.textField("ブロック種", log.blockType);
    form.textField("プレイヤー", log.player);
    form.textField("時刻", log.time);
    form.show(player);
}
Event.PlayerPlaceBlockAfter.add((ev) => {
    const player = ev.player;
    if (!coreProtectConfig.logEnabled)
        return;
    const log = new BlockLog(getJSTString(), player.name, "place", ev.block.typeId);
    const loc = ev.block.location;
    const key = getBlockKey(loc);
    if (!blockLogs.has(key))
        blockLogs.set(key, []);
    blockLogs.get(key).push(log);
});
Event.PlayerPlaceBlock.add((ev) => {
    const player = ev.player;
    const pid = player.id ?? player.name;
    const loc = ev.block.location;
    const key = getBlockKey(loc);
    if (searchModePlayers.has(pid)) {
        ev.cancel = true;
        const logs = blockLogs.get(key);
        if (!logs || logs.length === 0) {
            player.sendMessage("§7[CoreProtect] ログはありません");
            return;
        }
        system.run(() => {
            showBlockLogsForm(player, key, logs);
        });
        return;
    }
});
const interactCooldown = new Map();
Event.PlayerInteractWithBlock.add((ev) => {
    if (!coreProtectConfig.logEnabled)
        return;
    const player = ev.player;
    const pid = player.id ?? player.name;
    if (searchModePlayers.has(pid))
        return;
    const blockType = ev.block.typeId;
    if (NeverBlock.includes(blockType))
        return;
    const now = Date.now();
    const last = interactCooldown.get(pid) ?? 0;
    if (now - last < 2000)
        return;
    interactCooldown.set(pid, now);
    const loc = ev.block.location;
    const key = getBlockKey(loc);
    const log = new BlockLog(getJSTString(), player.name, "interact", blockType);
    if (!blockLogs.has(key))
        blockLogs.set(key, []);
    blockLogs.get(key).push(log);
});
Event.PlayerBreakBlock.add((ev) => {
    const player = ev.player;
    const pid = player.id ?? player.name;
    const loc = ev.block.location;
    const key = getBlockKey(loc);
    if (searchModePlayers.has(pid)) {
        const logs = blockLogs.get(key);
        if (!logs || logs.length === 0) {
            player.sendMessage("§7[CoreProtect] ログはありません");
            ev.cancel = true;
            return;
        }
        ev.cancel = true;
        system.run(() => {
            showBlockLogsForm(player, key, logs);
        });
        return;
    }
    if (!coreProtectConfig.logEnabled)
        return;
    if (searchModePlayers.has(pid))
        return;
    const log = new BlockLog(getJSTString(), player.name, "break", ev.block.typeId);
    if (!blockLogs.has(key))
        blockLogs.set(key, []);
    blockLogs.get(key).push(log);
});
Event.ExplosionBeforeEvent.add((ev) => {
    if (!coreProtectConfig.logEnabled)
        return;
    const impactedBlocks = ev.getImpactedBlocks();
    if (!impactedBlocks || impactedBlocks.length === 0)
        return;
    impactedBlocks.forEach((block) => {
        const key = getBlockKey(block.location);
        const log = new BlockLog(getJSTString(), ev.source?.nameTag || "Server", "explosion", block.typeId);
        if (!blockLogs.has(key))
            blockLogs.set(key, []);
        blockLogs.get(key).push(log);
    });
});
Event.ChatSend.add((ev) => {
    const player = ev.sender;
    if (!player)
        return;
    if (typeof ev.message === "string" && ev.message.trim() === "#co") {
        if (!coreProtectConfig.allowNonOp &&
            player.playerPermissionLevel !== PlayerPermissionLevel.Operator) {
            player.sendMessage("§c[CoreProtect] このコマンドはOPのみ使用可能です");
            return;
        }
        ev.cancel = true;
        const pid = player.id ?? player.name;
        if (searchModePlayers.has(pid)) {
            searchModePlayers.delete(pid);
            player.sendMessage("§b[CoreProtect] 捜索モード解除");
        }
        else {
            searchModePlayers.add(pid);
            player.sendMessage("§a[CoreProtect] 捜索モードON: ブロックを壊すとログ表示");
        }
    }
});
system.runTimeout(() => {
    loadCoreProtectConfig();
}, 20);
