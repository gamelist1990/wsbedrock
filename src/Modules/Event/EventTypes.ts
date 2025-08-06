// イベント型のインターフェース定義
export interface EventType<T = any> {
    add(listener: (event: T) => void): void;
    remove(listener: (event: T) => void): void;
}
