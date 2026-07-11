import type { SaveData } from "../core/SaveManager";
import { SaveManager } from "../core/SaveManager";
import { i18n } from "../core/I18n";

export class OverlayManager {
  private onSave: (index: number, data: SaveData) => void;

  private backdrop: HTMLElement;
  private confirmDialog: HTMLElement;
  private confirmTitle: HTMLElement;
  private confirmMsg: HTMLElement;
  private confirmYes: HTMLElement;
  private confirmNo: HTMLElement;

  private inputDialog: HTMLElement;
  private inputTitle: HTMLElement;
  private inputMsg: HTMLElement;
  private inputField: HTMLInputElement;
  private inputYes: HTMLElement;
  private inputNo: HTMLElement;

  private _pendingConfirm: (() => void) | null = null;
  private _pendingInput: ((value: string) => void) | null = null;

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

    // Confirm dialog
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

    // Input dialog
    const inputDialog = document.getElementById("input-dialog");
    if (!inputDialog) throw new Error("Missing #input-dialog");
    this.inputDialog = inputDialog;

    const inputTitle = document.getElementById("input-dialog-title");
    const inputMsg   = document.getElementById("input-dialog-message");
    const inputField = document.getElementById("input-dialog-field") as HTMLInputElement;
    const inputYes   = document.getElementById("input-dialog-yes");
    const inputNo    = document.getElementById("input-dialog-no");
    if (!inputTitle || !inputMsg || !inputField || !inputYes || !inputNo) {
      throw new Error("Missing input-dialog child elements");
    }
    this.inputTitle = inputTitle;
    this.inputMsg   = inputMsg;
    this.inputField = inputField;
    this.inputYes   = inputYes;
    this.inputNo    = inputNo;

    this.backdrop.onclick = () => this.closeAll();
    this.confirmYes.onclick = () => {
      const fn = this._pendingConfirm;
      this._pendingConfirm = null;
      this.closeAll();
      if (fn) fn();
    };
    this.confirmNo.onclick = () => this.closeAll();
  }

  // ===========================================================
  //  IMPORT PIPELINE  (custom modal, no prompt/alert)
  // ===========================================================

  public tryFillSlot(index: number): void {
    this.showInputDialog(
      i18n.t("SLOT_FILL"),
      i18n.t("PASTE_PLACEHOLDER"),
      (inputValue: string) => {
        if (!inputValue || !inputValue.trim()) {
          this.showToast(i18n.t("SAVE_INVALID_STRUCTURE"), true);
          return;
        }
        console.log("[Fill] Raw input (JSON-escaped):", JSON.stringify(inputValue));
        const parsedData = SaveManager.tryParseSaveData(inputValue.trim());
        if (!parsedData) {
          console.error("[Import] Blocked: Invalid structure");
          this.showToast(i18n.t("SAVE_INVALID_STRUCTURE"), true);
          return;
        }
        const validationError = SaveManager.validateSaveData(parsedData);
        if (validationError) {
          console.error("[Import] Blocked: Validation failed -", validationError);
          this.showToast(
            validationError === "SAVE_INVALID_DIMENSIONS"
              ? i18n.t("SAVE_INVALID_DIMENSIONS")
              : i18n.t("SAVE_INVALID_STRUCTURE"),
            true
          );
          return;
        }
        this.onSave(index, parsedData);
        this.showToast(i18n.t("SAVE_SUCCESS", index + 1));
      }
    );
  }

  // ---- Input dialog ----

  public showInputDialog(
    title: string,
    message: string,
    onSubmit: (value: string) => void
  ): void {
    this.inputTitle.textContent = title;
    this.inputMsg.textContent = message;
    this.inputField.value = "";
    this.inputField.focus();
    this._pendingInput = onSubmit;

    // Re-bind buttons (cloneNode to prevent duplicate listeners)
    const newYes = this.inputYes.cloneNode(true) as HTMLElement;
    const newNo  = this.inputNo.cloneNode(true) as HTMLElement;
    this.inputYes.parentNode?.replaceChild(newYes, this.inputYes);
    this.inputNo.parentNode?.replaceChild(newNo, this.inputNo);
    this.inputYes = newYes;
    this.inputNo  = newNo;

    this.inputYes.onclick = () => {
      this.inputDialog.classList.add("hidden");
      this.backdrop.classList.add("hidden");
      const fn = this._pendingInput;
      this._pendingInput = null;
      if (fn) fn(this.inputField.value);
    };
    this.inputNo.onclick = () => {
      this.inputDialog.classList.add("hidden");
      this.backdrop.classList.add("hidden");
      this._pendingInput = null;
    };

    this.backdrop.classList.remove("hidden");
    this.inputDialog.classList.remove("hidden");
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
    this.inputDialog.classList.add("hidden");
    this._pendingConfirm = null;
    this._pendingInput = null;
  }
}