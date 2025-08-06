import { EventType } from "./EventTypes";
import { ChatSendBeforeEvent, EntityDieAfterEvent, EntityHitEntityAfterEvent, ExplosionBeforeEvent, PlayerBreakBlockBeforeEvent, PlayerInteractWithBlockBeforeEvent, PlayerInventoryItemChangeAfterEvent, PlayerJoinAfterEvent, PlayerPlaceBlockAfterEvent, PlayerPlaceBlockBeforeEvent } from "@minecraft/server";

class GenericEvent<T> implements EventType<T> {
    private listeners: Array<(event: T) => void> = [];
    add(listener: (event: T) => void): void {
        this.listeners.push(listener);
    }
    remove(listener: (event: T) => void): void {
        this.listeners = this.listeners.filter(l => l !== listener);
    }
    emit(event: T): void {
        for (const listener of this.listeners) {
            listener(event);
        }
    }
}

export const Event = {
    PlayerJoin: new GenericEvent<PlayerJoinAfterEvent>(),
    PlayerInteractWithBlock: new GenericEvent<PlayerInteractWithBlockBeforeEvent>(),
    PlayerBreakBlock: new GenericEvent<PlayerBreakBlockBeforeEvent>(),
    PlayerPlaceBlock: new GenericEvent<PlayerPlaceBlockBeforeEvent>(), 
    PlayerPlaceBlockAfter: new GenericEvent<PlayerPlaceBlockAfterEvent>(), // 追加のイベント
    ExplosionBeforeEvent: new GenericEvent<ExplosionBeforeEvent>(),
    ChatSend: new GenericEvent<ChatSendBeforeEvent>(),
    EntityHitEntity: new GenericEvent<EntityHitEntityAfterEvent>(),
    PlayerInventoryItemChange: new GenericEvent<PlayerInventoryItemChangeAfterEvent>(),
    entityDie: new GenericEvent<EntityDieAfterEvent>(), // 型は適宜調整
};
