import type { SaveData } from "../core/SaveManager";
import { SaveManager } from "../core/SaveManager";
import { UI_TEXT } from "../core/TextConstants";

export class OverlayManager {
  private onSave: (index: number, data: SaveData) => void;

  private backdrop: HTMLElement;
  private confirmDialog: HTMLElement;
  private confirmTitle: HTMLElement;
  private confirmMsg: HTMLElement;
  private confirmYes: HTMLElement;
  private confirmNo: HTMLElement;

  private _pendingConfirm: (() => void) | null = null;

  constructor(callbacks: {
    onSave: (index: number, data: SaveData) => void;
    onLoad: (data: SaveData) => void;
    onDelete: (index: number) => void;
    serializeState: () => SaveData;
    onGetSlots: () => ReadonlyArray<SaveData | null>;
    onLoadByIndex: (index: number) => SaveData | null;
  }) {
    this.onSave = callbacks.onSave;
        const backdrop = document.getElementById("global-backdrop");
    if (!backdrop) throw new Error("Missing #global-backdrop");
    this.backdrop = backdrop;

    const dialog = document.getElementById("confirm-dialog");
    if (!dialog) throw new Error("Missing #confirm-dialog");
    this.confirmDialog = dialog;

    const title = document.getElementById("confirm-title");
    const msg   = document.getElementById("confirm-message");
    const yes   = document.getElementById("confirm-yes");
    const no    = document.getElementById("confirm-no");
    if (!title || !msg || !yes || !no) {
      throw new Error("Missing confirm-dialog child elements");
    }
    this.confirmTitle = title;
    this.confirmMsg   = msg;
    this.confirmYes   = yes;
    this.confirmNo    = no;

    this.backdrop.onclick = () => this.closeAll();
    this.confirmYes.onclick = () => {
      const fn = this._pendingConfirm;
      this._pendingConfirm = null;
      this.closeAll();
      if (fn) fn();
    };
    this.confirmNo.onclick = () => this.closeAll();
  }

  // ---- Public: fill a slot from clipboard (prompt -> parse -> validate -> save) ----

  public tryFillSlot(index: number): void {
    const input = prompt(UI_TEXT.PASTE_PLACEHOLDER);
    if (!input || !input.trim()) return;
    const saveData = SaveManager.tryParseSaveData(input.trim());
    if (!saveData) {
      this.showToast(UI_TEXT.SAVE_INVALID_STRUCTURE, true);
      return;
    }
    const dimensionError = SaveManager.validateSaveData(saveData);
    if (dimensionError) {
      const msgs: Record<string, string> = {
        "SAVE_INVALID_STRUCTURE": UI_TEXT.SAVE_INVALID_STRUCTURE,
        "SAVE_INVALID_DIMENSIONS": UI_TEXT.SAVE_INVALID_DIMENSIONS,
      };
      this.showToast(msgs[dimensionError] || dimensionError, true);
      return;
    }
    this.onSave(index, saveData);
  }

  // ---- Confirm dialog ----

  public showConfirm(title: string, message: string, onYes: () => void): void {
    this.confirmTitle.textContent = title;
    this.confirmMsg.textContent = message;
    this._pendingConfirm = onYes;
    this.backdrop.classList.remove("hidden");
    this.confirmDialog.classList.remove("hidden");
  }

  // ---- Toast ----

  public showToast(message: string, isError: boolean = false): void {
    const container = document.getElementById("toast-container");
    if (!container) return;
    container.classList.remove("hidden");
    const toast = document.createElement("div");
    toast.className = isError ? "toast error" : "toast";
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      if (container.contains(toast)) container.removeChild(toast);
      if (container.children.length === 0) container.classList.add("hidden");
    }, 1500);
  }

  // ---- Close ----

  public closeAll(): void {
    this.backdrop.classList.add("hidden");
    this.confirmDialog.classList.add("hidden");
    this._pendingConfirm = null;
  }
}