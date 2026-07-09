import { eventBus, Events } from "./EventBus";
import { LAYER_COUNT, DEFAULT_LAYER_SPACING } from "./Config";

export interface GameState {
  focusZ: number;
  currentPlayer: 1 | 2;
  isDarkTheme: boolean;
  layerSpacing: number;
  appState: string;
}

const initialState: GameState = {
  focusZ: 0,
  currentPlayer: 1,
  isDarkTheme: false,
  layerSpacing: DEFAULT_LAYER_SPACING,
  appState: "TITLE",
};

class GameStore {
  private state: GameState = { ...initialState };

  getState(): GameState {
    return { ...this.state };
  }

  setState(partial: Partial<GameState>): void {
    const prev = { ...this.state };
    Object.assign(this.state, partial);

    if (this.state.focusZ !== prev.focusZ) {
      eventBus.emit(Events.LAYER_CHANGED, this.state.focusZ);
    }
    if (this.state.isDarkTheme !== prev.isDarkTheme) {
      eventBus.emit(Events.THEME_TOGGLED, this.state.isDarkTheme);
    }
    if (this.state.appState !== prev.appState) {
      if (this.state.appState === "TITLE" || prev.appState === "TITLE") {
        eventBus.emit(Events.BOARD_UPDATED);
      }
    }
  }

  setFocusZ(z: number): void {
    const clamped = Math.max(0, Math.min(LAYER_COUNT - 1, z));
    if (clamped !== this.state.focusZ) {
      this.state.focusZ = clamped;
      eventBus.emit(Events.LAYER_CHANGED, clamped);
    }
  }

  toggleTheme(): void {
    this.state.isDarkTheme = !this.state.isDarkTheme;
    eventBus.emit(Events.THEME_TOGGLED, this.state.isDarkTheme);
  }

  reset(): void {
    this.state = { ...initialState };
    eventBus.emit(Events.GAME_RESET);
  }

  get focusZ(): number { return this.state.focusZ; }
  get currentPlayer(): 1 | 2 { return this.state.currentPlayer; }
  get isDarkTheme(): boolean { return this.state.isDarkTheme; }
  get layerSpacing(): number { return this.state.layerSpacing; }
  get appState(): string { return this.state.appState; }
  set appState(val: string) { this.setState({ appState: val }); }
}

export const gameStore = new GameStore();
