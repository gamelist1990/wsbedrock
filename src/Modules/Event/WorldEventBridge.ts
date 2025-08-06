import { PlayerJoinAfterEvent, world } from "@minecraft/server";
import { Event } from "./Event";

// world.afterEventsのイベントを一元管理し、独自イベントに橋渡しする例
world.afterEvents.playerJoin.subscribe((e: PlayerJoinAfterEvent) => {
    Event.PlayerJoin.emit(e);
});

world.beforeEvents.playerInteractWithBlock.subscribe((e) => {
    Event.PlayerInteractWithBlock.emit(e);
});

world.beforeEvents.playerBreakBlock.subscribe((e) => {
    Event.PlayerBreakBlock.emit(e);
});

world.beforeEvents.playerPlaceBlock.subscribe((e) => {
    Event.PlayerPlaceBlock.emit(e);
});

world.afterEvents.playerPlaceBlock.subscribe((e) => {
    Event.PlayerPlaceBlockAfter.emit(e);
});

world.beforeEvents.explosion.subscribe((e) => {
    Event.ExplosionBeforeEvent.emit(e);
});


world.beforeEvents.chatSend.subscribe((e) => {
    Event.ChatSend.emit(e);
});

world.afterEvents.entityHitEntity.subscribe((e) => {
    Event.EntityHitEntity.emit(e);
});

world.afterEvents.playerInventoryItemChange.subscribe((e) => {
    Event.PlayerInventoryItemChange.emit(e);
});

world.afterEvents.entityDie.subscribe((e) => {
    Event.entityDie.emit(e);
});