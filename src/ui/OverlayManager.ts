import type { SaveData } from '../core/SaveManager';

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
      this.showConfirm('覆盖确认', '确定要覆盖存档 ' + (this.currentSlotIndex + 1) + ' 吗？', () => {
        this.onSave(this.currentSlotIndex, this.serializeState());
      });
    };

    this.btnQuick.onclick = () => {
      this.onSave(5, this.serializeState());
      this.closeAll();
    };

    this.btnFill.onclick = () => {
      const input = prompt("粘贴 Base64 存档数据：");
      if (input) {
        try {
          const json = decodeURIComponent(atob(input));
          const decoded = JSON.parse(json);
          if (!this.validateSaveData(decoded)) {
            alert("无效的存档数据：数据结构不符合要求");
          } else {
            this.onSave(this.currentSlotIndex, decoded as SaveData);
          }
        } catch {
          alert("无效的存档数据：无法解析");
        }
      }
      this.closeAll();
    };

    this.btnDelete.onclick = () => {
      this.closeSlotMenu();
      this.showConfirm('删除确认', '确定要删除存档 ' + (this.currentSlotIndex + 1) + ' 吗？此操作不可恢复。', () => {
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

  private validateSaveData(data: any): data is SaveData {
    if (!data || typeof data !== "object") return false;
    if (!data.id || !data.version) return false;
    if (!Array.isArray(data.moves)) return false;
    if (!Array.isArray(data.boardState)) return false;
    if (data.boardState.length !== 6) return false;
    for (const layer of data.boardState) {
      if (!Array.isArray(layer) || layer.length !== 13) return false;
      for (const row of layer) {
        if (!Array.isArray(row) || row.length !== 13) return false;
      }
    }
    for (const move of data.moves) {
      if (typeof move.x !== "number" || typeof move.y !== "number" || typeof move.z !== "number") return false;
      if (move.player !== 1 && move.player !== 2) return false;
      if (move.x < 0 || move.x >= 13 || move.y < 0 || move.y >= 13 || move.z < 0 || move.z >= 6) return false;
    }
    // Validate boardState consistency with moves
    let pieceCount = 0;
    for (const layer of data.boardState) {
      for (const row of layer) {
        for (const cell of row) {
          if (cell === 1 || cell === 2) pieceCount++;
        }
      }
    }
    if (pieceCount !== data.moves.length) {
      console.warn("[Validate] Board pieces (" + pieceCount + ") mismatch moves (" + data.moves.length + ")");
      return false;
    }
    return true;
  }


}