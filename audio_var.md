# 新音频功能和预留接口说明

## 预留接口与可调参数说明

所有扩展功能均通过**配置数据**或**预定义事件**开放，无需修改核心逻辑。您只需调整以下位置即可定制音效与 BGM。

---

### 一、和弦库（`CHORDS`）

- **位置**：`CHORDS` 对象（约第 15–31 行）。
- **作用**：定义所有可用和弦的组成音（频率名称）。
- **可修改项**：
  - 增删和弦条目（如 `"Cmaj9": ["C4","E4","G4","B4","D5"]`）。
  - 调整现有和弦的八度或音符（改变音色明暗）。
- **注意**：和弦名称必须与 `BGM_PATTERNS` 中 `progression` 数组内的名称匹配。

---

### 二、BGM 曲目配置（`BGM_PATTERNS`）

- **位置**：`BGM_PATTERNS` 对象（约第 48–95 行）。
- **作用**：定义 `menu`、`game`、`guide`、`pause` 四种背景音乐的完整参数。
- **可调参数**（每轨独立）：

  | 字段 | 类型 | 说明 |
  | ------ | ------ | ------ |
  | `progression` | `string[]` | 和弦进行序列（名称取自 `CHORDS`） |
  | `chordDuration` | `number` | 每和弦持续秒数（可被 `intensity` 动态缩放） |
  | `layers.bass` / `chord` / `arpeggio` | `{ waveform, gain, octaveOffset }` | 各层波形（`sine`/`triangle`/`square`）、增益倍数、八度偏移（-1/0/+1） |
  | `noteStyle` | `"pad" \| "arpeggio" \| "staccato" \| "sustain"` | 触键风格，影响包络形状 |
  | `baseGain` | `number` | 主音量系数（0~1，会被 `intensity` 微调） |
  | `useReverb` / `reverbMix` | `boolean` / `number` | 是否启用混响及干湿比（0~1） |
  | `useDelay` / `delayMix` | `boolean` / `number` | 是否启用延迟及混合比（仅对 `arpeggio` 层生效） |
  | `vibratoDepth` | `number` | 颤音深度（Hz 偏移，仅 `pad` 风格生效；设为 `0` 关闭） |

- **建议**：调整 `gain` 和 `baseGain` 可平衡各层响度；修改 `progression` 可改变和声情绪。

---

### 三、音效预制参数（`preloadSFX` 与 `generateWavURI`）

- **位置**：`preloadSFX()` 方法内（约第 140–146 行）及 `generateWavURI` 函数（约第 95–138 行）。
- **可调项**：
  - 每种音效的**频率组合**（`frequencies` 数组）、**持续时间**、**音量**、**波形类型**。
  - **滑音**（`glide` 参数）：可设置 `from`/`to` 频率范围，用于 `win`/`lose`。
- **示例**：将 `click` 改为 `[880, 1760]` 获得更高音的点击；将 `lose` 的 `glide` 改为 `{ from: 330, to: 110 }` 加大下降幅度。

---

### 四、效果器参数（混响与延迟）

- **混响**：`createReverbIR(ctx, decay)` 中的 `decay`（单位秒），当前为 `1.2`。位置在 `ensureContext()` 内（约第 72 行）。修改可改变混响尾音长度。
- **延迟**：`this.delayNode.delayTime.value` 当前为 `0.35` 秒（约第 80 行），可调整回声间隔。
- 各曲目的 `reverbMix` / `delayMix` 已在 `BGM_PATTERNS` 中独立控制。

---

### 五、动态强度（`intensity`）

- **位置**：私有变量 `intensity`（约第 57 行），范围 `0~1`。
- **触发方式**：取消注释构造函数中的 `eventBus.on(Events.GAME_INTENSITY, ...)`（约第 70 行），并确保您的游戏逻辑在适当时机触发该事件，传入 `0~1` 数值。
- **效果**：自动调整 `chordDuration`（加速最多 15%）和 `baseGain`（增益最多 +20%），营造紧张感。
- **若不使用**：保持注释即可，默认 `intensity = 0`，不影响任何功能。

---

### 六、主音量与静音控制

- **外部接口**：`setVolume(sfx, bgm)` 和 `mute()` 保持不变。
- **内部默认值**：`sfxVolume = 0.6`，`bgmVolume = 0.3`（约第 52–53 行），可改为您想要的默认值。

---

### 七、音频上下文初始化时机

- `init()` 方法可被外部调用，也可在首次 `playSFX`/`playBGM` 时自动触发。
- 若您需要严格在用户手势后激活，可自行调用 `audioManager.init()`。

---
