type EventCallback = (...args: any[]) => void;

class EventBus {
    private listeners: Record<string, EventCallback[]> = {};

    on(event: string, callback: EventCallback): void {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    off(event: string, callback: EventCallback): void {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }

    emit(event: string, ...args: any[]): void {
        if (!this.listeners[event]) return;
        this.listeners[event].forEach(cb => cb(...args));
    }
}

export const eventBus = new EventBus();

// Define Event Names as constants
export const Events = {
    BOARD_CHANGED: "BOARD_CHANGED",
    LAYER_CHANGED: "LAYER_CHANGED",
    THEME_CHANGED: "THEME_CHANGED",
    GAME_RESET: "GAME_RESET",
    HOVER_CHANGED: "HOVER_CHANGED",
};
