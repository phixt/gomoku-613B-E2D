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

export const Events = {
    THEME_TOGGLED: "THEME_TOGGLED",
    LAYER_CHANGED: "LAYER_CHANGED",
    BOARD_UPDATED: "BOARD_UPDATED",
    GAME_RESET: "GAME_RESET",
    SAVE_REQUESTED: "SAVE_REQUESTED",
    SAVE_UPDATED: "SAVE_UPDATED",
    OVERLAY_REQUEST: "OVERLAY_REQUEST",
    COLORBLIND_MODE_TOGGLED: "COLORBLIND_MODE_TOGGLED",
};
