# Gomoku 613B-E2D 测试方案与 CI/CD 讲解

> 任务来源:Codex 窗口转交,由 reasonix 完成讲解。
> 适用版本:v0.6.4(branch `main`)。

---

## 1. 现状盘点

| 项目 | 现状 |
| :--- | :--- |
| 前端框架 | TypeScript (strict) + Three.js + Vite |
| 桌面壳 | Tauri v2 (Rust, `src-tauri/`) |
| 单元测试 | ❌ 无(`package.json` 无 test script,仓库无 `*.test.ts`) |
| E2E 测试 | ❌ 无 |
| CI/CD | ❌ 无(`.github/` 不存在) |
| 已有质量手段 | `npm run build` = `tsc && vite build`(仅类型检查 + 打包) |

结论:**唯一的质量门禁是 TypeScript 编译**。规则引擎、AI、存档这些核心逻辑没有任何自动化回归保护,后续改动(尤其 v0.6.4 引入的可变棋盘尺寸 + 4–9 连珠 + SWAP2)风险集中在 `src/core/` 与 `src/ai/`。

---

## 2. 测试策略:按风险分层的金字塔

游戏代码分三层,测试投入也应分层。原则:**底层规则逻辑是最高价值测试对象**(规则错了,整个游戏就错了),UI/Three.js 渲染是低价值对象(视觉问题靠人眼)。

### L0 — 单元测试(Vitest + node 环境,最快、最优先)

覆盖纯逻辑模块,不碰 DOM、不碰 Tauri:

| 模块 | 文件 | 为什么值得测 |
| :--- | :--- | :--- |
| 棋盘数据模型 | `src/core/Board.ts` | `Uint8Array` 索引映射、越界语义、`forEach/reset` |
| 胜负判定 | `src/core/Rules.ts` | 全项目最核心、最易错:13 方向、跨层斜线、开放端计数 |
| 规则引擎 | `src/core/rules/StandardEngine.ts`、`SwapEngine.ts` | 回合流转、SWAP2 开局状态机、非法落子拒绝 |
| 存档 | `src/core/SaveManager.ts` | 迁移逻辑(`migrateData`)、数据校验(`validateSaveData`)、base64 往返、损坏存档容错 |
| AI | `src/ai/AIEngine.ts` | 落子合法性(不越界、不占已有子)、不同难度行为差异 |
| 配置/工具 | `src/core/Config.ts`、`src/utils/MathUtils.ts` | `DIRECTIONS_3D` 方向完整性、`setWinLength` 生效 |
| 国际化 | `src/core/I18n.ts` | 四个语言包 key 一致、缺 key 时 fallback 行为 |

> `Rules.ts` 与 `Board.ts` 均不 import 浏览器 API(`Board` 纯数据、`Rules` 只读棋盘),可直接在 node 环境跑,不需要 jsdom,速度快。`SaveManager` 需注入 mock `IStorageAdapter`。

### L1 — 集成/行为测试(Vitest + jsdom,次优先)

把模块拼起来验证行为契约:

- `GameStore` + `StandardEngine` + `Board`:完整对局流程(交替落子 → 五连 → 终局状态)。
- `SaveManager` + `LocalStorageAdapter`(jsdom 提供 `localStorage`):存档→清内存→读档,状态一致。
- `EventBus`:事件发布/订阅/退订、重复订阅去重。
- `AIEngine` + `Board` 多盘面对局:AI 对 AI 跑 N 局,断言始终合法、无异常、有限步内结束(防死循环)。

### L2 — E2E(Playwright,浏览器模式)

项目是「网页 + Tauri 双端」,浏览器模式(`npm run dev` 起的 Vite 服务)可直接被 Playwright 驱动,测**用户可见流程**:

1. 开始界面 → 进入对局(含「先按 S 拉远视角」的提示场景)。
2. 2D 面板落子 → 五连后弹出胜负 UI。
3. `A/D` 换层、`Q/E` 旋转、`Z/C` 层间距、`T` 主题、`V` 色弱模式、`H` 辅助线开关。
4. 存档(槽位 1)→ 刷新页面 → 读档 → 棋局恢复。
5. SWAP2 模式完整走一遍(执黑 → 摆两子 → 交换/不交换两条路径)。
6. 自定义棋盘(如 9×9×4、7 连珠)下完整对局。
7. 四种语言切换后关键文案存在。

### L3 — 桌面端冒烟(手动 + 可选 Rust 单测)

- **手动清单**(每次发版前跑):`npm run tauri dev` 起桌面端 → 上述 E2E 核心路径过一遍 → 检查控制台零警告(项目历史标准)。
- **Rust 侧**(`src-tauri/src/lib.rs` 目前只是壳,无业务逻辑):暂不需要单测;等出现业务 command 时补 `#[cfg(test)]`。

---

## 3. 工具选型与落地配置

| 用途 | 工具 | 理由 |
| :--- | :--- | :--- |
| 单元/集成 | **Vitest** | 与 Vite 同生态零配置、原生 ESM/TS 支持、快;`node` 环境跑 L0,`jsdom` 环境跑 L1 |
| E2E | **Playwright** | 跨浏览器、截图/视频失败证据、CI 内置 action、可测 WebKit(对应 Tauri 的 WebView2 内核) |
| 覆盖率 | Vitest `--coverage`(v8 provider) | 零额外编译依赖,可直接接 CI 门槛 |
| CI | **GitHub Actions** | 仓库在 GitHub,免自建;Windows runner 可直接跑 `tauri build` 出 NSIS 安装包 |

### package.json 增量(示意)

```jsonc
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "test:e2e": "playwright test",
  "typecheck": "tsc --noEmit"
},
"devDependencies": {
  "vitest": "^3.x",
  "jsdom": "^26.x",
  "@vitest/coverage-v8": "^3.x",
  "@playwright/test": "^1.x"
}
```

`vite.config.ts` 增加 `test` 字段(`environment` 按目录划分:默认 `node`,`src/core` 用 `node`,`src/**/*.test.ts` 里需要 DOM 的用例文件顶部 `// @vitest-environment jsdom`)。

---

## 4. 高价值测试用例清单(可直接照抄实现)

### 4.1 `Board`(`src/core/Board.test.ts`)

- 默认构造 `13×13×6`,`data` 全 0。
- `set/get` 往返:坐标 `(12,12,5)` 边界内可写读。
- **越界返回 0 / 写入被忽略**:`(-1,0,0)`、`(13,0,0)`、`(0,13,0)`、`(0,0,6)`。
- `index` 映射:同 x/y 不同 z 互不串扰(在 `(0,0,0)` 和 `(0,0,5)` 分别写不同值)。
- `reset()` 后全 0;`forEach` 遍历次数 = `size*layers`。
- 自定义尺寸 `Board(9, 4)`:越界边界变为 9/4。

### 4.2 `Rules`(`src/core/Rules.test.ts`)— 重中之重

- **平面五连**:横向 `(0..4, 7, 2)` 同色 → `checkWinner` 返回该色。
- **纵向五连**:`(7, 0..4, 2)`。
- **对角五连**:`(0,0)→(4,4)` 与 `(4,0)→(0,4)` 两条。
- **跨层斜线五连**:`(0,0,0)→(1,1,1)→...→(4,4,4)`,以及 z 方向直连 `(3,3,0..4)` —— 这是 3D 五子棋区别于 2D 的独特路径,必须覆盖。
- **未满五连不判胜**:恰好 4 连返回 0。
- **被对方棋子隔断**:`X X X 2 X` 不判胜。
- **六连以上**仍判胜(`count >= WIN_LENGTH` 语义)。
- **连珠数可配**:`setWinLength(7)` 后 5 连不赢、7 连赢(注意测试后复位)。
- 空位调用 `checkWinner` 返回 0。
- 边界五连:贴边 `(0,0,0..4)`(方向循环时一端正巧出界,验证 `openEnds` 计算不崩)。
- `checkPatterns3D` 的 `openEnds`/`alive` 语义:两端都空 → `alive=true`;一端贴边 → 不 alive。

### 4.3 `SaveManager`(`src/core/SaveManager.test.ts`)

- 注入内存版 `IStorageAdapter`(mock):save → load 往返字段一致。
- 越界槽位 `save/load/delete(-1)`、`(6)` 静默忽略。
- `quickSave` 落到 `QUICK_SAVE_INDEX`;`getLatestIndex` 按 `timestamp` 取最新。
- `validateSaveData`:合法数据返回 `null`;缺 `version`、`boardState` 尺寸与 `boardSize/layers` 不符、`boardSize<=0` 等 → 返回错误码。
- `migrateData`:**v1 旧存档**(无 `version`/`boardState`,只有 `moves`)迁移出正确 `boardState` 与 `version:"2.0.0"`。
- `serializeToBase64` / `tryParseSaveData` 往返;非法 base64、非 JSON、缺字段 → 返回 `null`。
- 损坏存档跳过:`loadFromStorage` 遇到 JSON.parse 失败不抛异常、槽位保持 `null`。

### 4.4 `SwapEngine`(`src/core/rules/SwapEngine.test.ts`)

- 开局状态机:黑 1 手 → 白 2 手 → 黑 3 手(摆子)→ 交换/不交换两条分支 → 换方后 `currentPlayer` 正确。
- 交换后颜色对调,棋盘已落子不变。
- 非法输入(摆子阶段落子超出规则)被拒绝。

### 4.5 `AIEngine`(`src/core/ai/AIEngine.test.ts`)

- 空盘落子:返回合法坐标(在界内、位置为空)。
- 占满位置不重落:预置棋子后,AI 落子坐标对应格子为空。
- 三种难度都返回合法着法;`Hard` 在有四连威胁时优先堵/成(可断言「AI 落在能赢或能堵的点」的行为级用例,避免断言具体算法细节)。
- AI 对 AI 有限步对局:给定空盘,连续对弈 100 手内无异常、无非法着法。

---

## 5. CI/CD 设计

### 5.1 分支与触发策略

- `main` 为唯一长期分支,功能走短分支 + PR 合入。
- **PR 触发**:类型检查 + 单测 + 构建(快速反馈,<3min)。
- **push 到 main**:同上 + 覆盖率上传。
- **打 tag `v*`**:触发 Tauri 打包 + GitHub Release(NSIS 安装包)。

### 5.2 Workflow 1:`ci.yml`(质量门禁)

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run typecheck          # tsc --noEmit,原 build 已含但显式跑更快反馈
      - run: npm test                    # vitest run(含 L0+L1)
      - run: npm run test:coverage
        env: { VITEST_MIN_COVERAGE: "60" }   # 可选门槛,核心模块可用 per-file 阈值
      - run: npm run build               # 产物校验

  rust:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: src-tauri } }
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
        with: { workspaces: src-tauri }
      - run: cargo check
      - run: cargo clippy -- -D warnings

  e2e:
    runs-on: ubuntu-latest
    needs: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run dev & npx wait-on http://localhost:5173
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: playwright-report, path: playwright-report/ }
```

要点讲解:

- **前端在 ubuntu 跑**(快、便宜),**打包在 windows 跑**(产物是 Windows 安装包)——两个 job 分离,避免每次 CI 都等 Tauri 编译。
- `typecheck` 单独成步:比 `npm run build` 快,PR 阶段错误定位更直接;`build` 保留用于验证产物完整。
- 覆盖率先不设硬门槛,先出报告,等测试补到位再逐步收紧(推荐 per-file:`src/core/*.ts` ≥ 80%,UI 层不设)。

### 5.3 Workflow 2:`release.yml`(发版)

```yaml
name: Release

on:
  push:
    tags: ["v*"]

permissions:
  contents: write

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
        with: { workspaces: src-tauri }
      - run: npm ci
      - run: npm test                    # 发版前再跑一遍门禁
      - run: npm run tauri build
      - name: Upload NSIS installer
        uses: softprops/action-gh-release@v2
        with:
          files: src-tauri/target/release/bundle/nsis/*.exe
```

要点讲解:

- `tauri build` 依赖:Windows runner 自带 WebView2,无需额外装;NSIS 由 `@tauri-apps/cli` 自动下载。
- 产物路径与 README 一致:`src-tauri/target/release/bundle/nsis/`。
- 可选的后续增强:签名(`tauri.conf.json` 配 `signtool` + GitHub Secrets 存证书)、`--bundles nsis,msi` 双格式、UPX 压缩(减小安装包体积)。
- 若希望「推 tag 前先跑完整门禁」,可给 `release.yml` 加 `needs` 复用 CI,或直接在 CI 的 main push 上同时触发打包(保守起见分开)。

---

## 6. 落地步骤(建议顺序)

1. **Phase 0(1 天内)**:装 Vitest,配 `npm test` + `typecheck`,搭 `ci.yml` 的 frontend job —— 先把门禁立起来。
2. **Phase 1(核心逻辑)**:按第 4 节写 `Board`、`Rules`、`SaveManager`、`SwapEngine`、`AIEngine` 单测。这部分是项目唯一值得优先重仓的。
3. **Phase 2(E2E)**:装 Playwright,覆盖第 2 节 L2 的 7 条主流程,接 `e2e` job。
4. **Phase 3(发版自动化)**:打 tag 流程验证 `release.yml`,产出第一个 CI 构建的 NSIS 包。
5. **Phase 4(可选)**:覆盖率门槛、Rust clippy 纳入、MSI 双格式、签名。

---

## 7. 讲解总结(为什么这么设计)

1. **测试的价值密度集中在规则层**:`Rules.ts` 的 13 方向连珠判定是这个游戏正确性的根基,且未来任何「棋盘尺寸/连珠数」改动都会先撞上它——单测是防回归的第一道闸。
2. **UI/Three.js 层不值得写大量单测**:渲染正确性最终靠人眼,E2E 只锁用户可见流程,避免测试成本失控。
3. **CI 用「ubuntu 快检 + windows 打包」拆分**:Tauri 编译慢,不能让它阻塞每次 PR 的类型检查与单测。
4. **CI 从「有」到「严」渐进**:先立门禁出报告,再按 per-file 阈值收紧覆盖率,避免一上来要求 100% 拖垮开发节奏。
5. **发版链路上 tauri build 是唯一真正平台相关的环节**,单独放 release workflow,平时不触发,发版成本集中在打 tag 一步。
