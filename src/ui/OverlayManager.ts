import type { SaveData } from "../core/SaveManager";
import { SaveManager } from "../core/SaveManager";
import { UI_TEXT } from "../core/TextConstants";

export class OverlayManager {
  private onSave: (index: number, data: SaveData) => void;
  private onLoad: (data: SaveData) => void;
  private onDelete: (index: number) => void;
  private serializeState: () => SaveData;
  private onGetSlots: () => ReadonlyArray<SaveData | null>;
  private onLoadByIndex: (index: number) => SaveData | null;

  private backdrop: HTMLElement;
  private slotMenu: HTMLElement;
  private confirmDialog: HTMLElement;

  private btnRead: HTMLElement;
  private btnOverwrite: HTMLElement;
  private btnQuick: HTMLElement;
  private btnFill: HTMLElement;
  private btnDelete: HTMLElement;
  private btnCancel: HTMLElement;

  private confirmTitle: HTMLElement;
  private confirmMsg: HTMLElement;
  private confirmYes: HTMLElement;
  private confirmNo: HTMLElement;

  private currentSlotIndex: number = -1;
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
    this.onLoad = callbacks.onLoad;
    this.onDelete = callbacks.onDelete;
    this.serializeState = callbacks.serializeState;
    this.onGetSlots = callbacks.onGetSlots;
    this.onLoadByIndex = callbacks.onLoadByIndex;

    this.backdrop = document.getElementById('global-backdrop')!;

    const menus = document.querySelectorAll('#slot-action-menu');
    this.slotMenu = (document.querySelector('#slot-action-menu.context-menu') || menus[menus.length - 1]) as HTMLElement;

    this.confirmDialog = document.getElementById('confirm-dialog')!;

    this.btnRead = document.getElementById('btn-slot-read')!;
    this.btnOverwrite = document.getElementById('btn-slot-overwrite')!;
    this.btnQuick = document.getElementById('btn-slot-quick')!;
    this.btnFill = document.getElementById('btn-slot-fill')!;
    this.btnDelete = document.getElementById('btn-slot-delete')!;
    this.btnCancel = document.getElementById('btn-slot-cancel')!;

    this.confirmTitle = document.getElementById('confirm-title')!;
    this.confirmMsg = document.getElementById('confirm-message')!;
    this.confirmYes = document.getElementById('confirm-yes')!;
    this.confirmNo = document.getElementById('confirm-no')!;

    this.initGlobalListeners();
  }

  private initGlobalListeners(): void {
    this.backdrop.onclick = () => this.closeAll();

    this.btnRead.onclick = () => {
      const data = this.onLoadByIndex(this.currentSlotIndex);
      if (data) this.onLoad(data);
      this.closeAll();
    };

    this.btnOverwrite.onclick = () => {
      this.closeSlotMenu();
      this.showConfirm(UI_TEXT.CONFIRM_TITLE, UI_TEXT.CONFIRM_OVERWRITE(this.currentSlotIndex + 1), () => {
        this.onSave(this.currentSlotIndex, this.serializeState());
      });
    };

    this.btnQuick.onclick = () => {
      this.onSave(5, this.serializeState());
      this.closeAll();
    };

    this.btnFill.onclick = () => {
      const input = prompt(UI_TEXT.PASTE_PLACEHOLDER);
      if (!input || !input.trim()) { this.closeAll(); return; }
      try {
        const json = decodeURIComponent(atob(input.trim()));
        const decoded = JSON.parse(json);
        const saveError = SaveManager.validateSaveData(decoded);
        if (saveError) {
          const errorMsgs: Record<string, string> = {
            "SAVE_INVALID_STRUCTURE": UI_TEXT.SAVE_INVALID_STRUCTURE,
            "SAVE_INVALID_DIMENSIONS": UI_TEXT.SAVE_INVALID_DIMENSIONS,
          };
          this.showToast(errorMsgs[saveError] || saveError, true);
        } else {
          this.onSave(this.currentSlotIndex, decoded as SaveData);
        }
      } catch {
        this.showToast(UI_TEXT.SAVE_INVALID_STRUCTURE, true);
      }
      this.closeAll();
    };

    this.btnDelete.onclick = () => {
      this.closeSlotMenu();
      this.showConfirm(UI_TEXT.CONFIRM_TITLE, UI_TEXT.CONFIRM_DELETE(this.currentSlotIndex + 1), () => {
        this.onDelete(this.currentSlotIndex);
      });
    };

    this.btnCancel.onclick = () => this.closeAll();

    this.confirmYes.onclick = () => {
      const yesFn = this._pendingConfirm;
      this._pendingConfirm = null;
      this.closeAll();
      if (yesFn) yesFn();
    };

    this.confirmNo.onclick = () => this.closeAll();
  }

  public showSlotMenu(index: number, event: MouseEvent): void {
    this.currentSlotIndex = index;
    const slots = this.onGetSlots();
    const isEmpty = slots[index] === null;
    const isQuick = index === 5;

    this.btnRead.style.display = isEmpty ? 'none' : 'block';
    this.btnOverwrite.style.display = isEmpty ? 'none' : 'block';
    this.btnQuick.style.display = isQuick ? 'none' : 'block';
    this.btnFill.style.display = isEmpty ? 'block' : 'none';
    this.btnDelete.style.display = isEmpty ? 'none' : 'block';

    this.slotMenu.style.left = event.clientX + 10 + 'px';
    this.slotMenu.style.top = event.clientY + 10 + 'px';

    this.backdrop.classList.remove('hidden');
    this.slotMenu.classList.remove('hidden');
  }

  public showConfirm(title: string, message: string, onYes: () => void): void {
    this.confirmTitle.textContent = title;
    this.confirmMsg.textContent = message;
    this._pendingConfirm = onYes;

    this.backdrop.classList.remove('hidden');
    this.confirmDialog.classList.remove('hidden');
  }

  public showToast(message: string, isError: boolean = false): void {
    const container = document.getElementById('toast-container');
    if (!container) return;
    container.classList.remove('hidden');

    const toast = document.createElement('div');
    toast.className = isError ? 'toast error' : 'toast';
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      if (container.contains(toast)) container.removeChild(toast);
      if (container.children.length === 0) container.classList.add('hidden');
    }, 1500);
  }

  private closeSlotMenu(): void {
    this.slotMenu.classList.add('hidden');
  }

  public closeAll(): void {
    this.backdrop.classList.add('hidden');
    this.slotMenu.classList.add('hidden');
    this.confirmDialog.classList.add('hidden');
    this._pendingConfirm = null;
  }

}
