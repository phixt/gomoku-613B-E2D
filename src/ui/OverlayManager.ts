import { eventBus, Events } from "../core/EventBus";
import { SAVE_SLOT_COUNT } from "../core/Config";
import type { SaveData, SlotEntry } from "../core/SaveManager";

class OverlayManager {
  private backdropEl: HTMLDivElement | null = null;
  private activeMenu: HTMLElement | null = null;
  private cachedSlots: ReadonlyArray<SlotEntry> = [];

  serializeGameState: (() => SaveData) | null = null;
  loadGameData: ((data: SaveData) => void) | null = null;
  onSlotsChanged: ((slots: ReadonlyArray<SlotEntry>) => void) | null = null;
  saveSlot: ((index: number, data: SaveData) => void) | null = null;
  loadSlot: ((index: number) => SaveData | null) | null = null;
  deleteSlot: ((index: number) => void) | null = null;

  constructor() {
    this.createBackdrop();
    eventBus.on(Events.SAVE_UPDATED, (slots: ReadonlyArray<SlotEntry>) => {
      this.cachedSlots = slots;
      if (this.onSlotsChanged) this.onSlotsChanged(slots);
    });
  }

  private createBackdrop(): void {
    if (document.getElementById("modal-backdrop")) return;
    const el = document.createElement("div");
    el.id = "modal-backdrop";
    el.className = "hidden";
    el.addEventListener("click", () => this.closeAll());
    document.body.appendChild(el);
    this.backdropEl = el;
  }

  showBackdrop(): void { this.backdropEl?.classList.remove("hidden"); }
  hideBackdrop(): void { this.backdropEl?.classList.add("hidden"); }

  closeAll(): void {
    this.hideBackdrop();
    if (this.activeMenu) {
      this.activeMenu.classList.add("hidden");
      this.activeMenu = null;
    }
    const confirmEl = document.getElementById("confirm-dialog");
    if (confirmEl) confirmEl.classList.add("hidden");
    const promptEl = document.getElementById("prompt-modal");
    if (promptEl) promptEl.classList.add("hidden");
  }

  showToast(message: string, isError: boolean = false): void {
    const container = document.getElementById("toast-container");
    if (!container) return;
    container.classList.remove("hidden");
    const toast = document.createElement("div");
    toast.className = isError ? "toast error" : "toast";
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      if (container.contains(toast)) {
        container.removeChild(toast);
      }
      if (container.children.length === 0) {
        container.classList.add("hidden");
      }
    }, 1000);
  }

  showConfirmDialog(message: string, onConfirm: () => void): void {
    this.closeAll();
    let el = document.getElementById("confirm-dialog");
    if (!el) {
      el = document.createElement("div");
      el.id = "confirm-dialog";
      el.className = "confirm-dialog hidden";
      el.innerHTML = '<p class="confirm-msg"></p><div class="confirm-actions"><button class="confirm-yes primary-btn">确认</button><button class="confirm-no secondary-btn">取消</button></div>';
      document.body.appendChild(el);
    }
    el.querySelector(".confirm-msg")!.textContent = message;
    el.classList.remove("hidden");
    this.showBackdrop();

    const yesBtn = el.querySelector(".confirm-yes")!;
    const noBtn = el.querySelector(".confirm-no")!;

    const handleYes = () => { this.closeAll(); onConfirm(); };
    const handleNo = () => { this.closeAll(); };
    yesBtn.addEventListener("click", handleYes, { once: true });
    noBtn.addEventListener("click", handleNo, { once: true });
  }

  showSlotMenu(index: number, event: MouseEvent): void;
  showSlotMenu(index: number, anchorX: number, anchorY: number, slots: ReadonlyArray<SlotEntry>): void;
  showSlotMenu(index: number, anchorXOrEvent: number | MouseEvent, anchorY?: number, slots?: ReadonlyArray<SlotEntry>): void {
    this.closeAll();
    const menu = document.getElementById("slot-action-menu");
    if (!menu) return;

    // Handle both signatures: (index, MouseEvent) or (index, x, y, slots)
    let ax: number, ay: number;
    let slotList: ReadonlyArray<SlotEntry>;
    if (anchorXOrEvent instanceof MouseEvent) {
      const target = anchorXOrEvent.currentTarget as HTMLElement;
      if (target) {
        const rect = target.getBoundingClientRect();
        ax = rect.right; ay = rect.top;
      } else {
        ax = anchorXOrEvent.clientX; ay = anchorXOrEvent.clientY;
      }
      slotList = this.cachedSlots;
    } else {
      ax = anchorXOrEvent;
      ay = anchorY ?? 0;
      slotList = slots ?? this.cachedSlots;
    }
    menu.style.left = ax + "px";
    menu.style.top = ay + "px";

    const entry = slotList[index];
    const isOccupied = entry?.data !== null;
    const isQuick = entry?.type === "quick";

    menu.innerHTML = "";

    const addBtn = (label: string, fn: () => void, cls = "slot-action-btn"): void => {
      const btn = document.createElement("button");
      btn.className = cls;
      btn.textContent = label;
      btn.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
      menu.appendChild(btn);
    };

    if (isOccupied) {
      addBtn("读取", () => this.doLoad(index));
      addBtn("覆盖", () => this.showConfirmDialog("确认覆盖此存档？", () => this.doSave(index)));
      if (!isQuick) {
        addBtn("存为快速档", () => { this.doSave(SAVE_SLOT_COUNT - 1); });
      }
      addBtn("删除", () => this.showConfirmDialog("确认删除此存档？", () => this.doDelete(index)));
    } else {
      addBtn("填写", () => this.showPromptModal(index));
    }
    addBtn("取消", () => this.closeAll());

    menu.classList.remove("hidden");
    this.showBackdrop();
    this.activeMenu = menu;
  }

  showPromptModal(_index: number): void {
    this.closeAll();
    let el = document.getElementById("prompt-modal");
    if (!el) {
      el = document.createElement("div");
      el.id = "prompt-modal";
      el.className = "prompt-modal hidden";
      el.innerHTML = '<p class="prompt-msg">粘贴 Base64 存档数据：</p><textarea class="prompt-input" rows="3"></textarea><div class="prompt-actions"><button class="prompt-ok primary-btn">确认</button><button class="prompt-cancel secondary-btn">取消</button></div>';
      document.body.appendChild(el);
    }
    el.classList.remove("hidden");
    this.showBackdrop();
    const input = el.querySelector(".prompt-input") as HTMLTextAreaElement;
    input.value = "";

    const okBtn = el.querySelector(".prompt-ok")!;
    const cancelBtn = el.querySelector(".prompt-cancel")!;

    const handleOk = () => {
      this.closeAll();
      const val = input.value.trim();
      if (!val || !this.loadGameData) return;
      try {
        const decoded = JSON.parse(decodeURIComponent(escape(atob(val))));
        this.loadGameData(decoded);
        this.showToast("已加载粘贴数据");
      } catch {
        this.showToast("无效的存档数据", true);
      }
    };
    const handleCancel = () => this.closeAll();

    okBtn.addEventListener("click", handleOk, { once: true });
    cancelBtn.addEventListener("click", handleCancel, { once: true });
  }

  private doSave(index: number): void {
    if (!this.serializeGameState || !this.saveSlot) return;
    const data = this.serializeGameState();
    this.saveSlot(index, data);
    this.showToast("已保存到存档 " + (index + 1));
    this.closeAll();
  }

  private doLoad(index: number): void {
    if (!this.loadSlot || !this.loadGameData) return;
    const data = this.loadSlot(index);
    if (data) {
      this.loadGameData(data);
      this.showToast("已读取存档 " + (index + 1));
    } else {
      this.showToast("没有可读取的存档", true);
    }
    this.closeAll();
  }

  private doDelete(index: number): void {
    if (!this.deleteSlot) return;
    this.deleteSlot(index);
    this.showToast("已删除存档 " + (index + 1));
    this.closeAll();
  }
}

export const overlayManager = new OverlayManager();
