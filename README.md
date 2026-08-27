# PulseView 频率分析器

基于 Web 的逻辑分析仪信号频率分析工具。导入逻辑分析仪导出的 `.vcd` / `.txt` / `.sr` / `.bin` / `.csv` 文件，从信号跳变中重建频率-时间曲线，并提供光标测量、加减速区间自动识别、频率分布统计等分析能力。

纯前端实现，所有解析与计算均在浏览器本地完成（Web Worker 后台解析，不阻塞 UI），无需任何后端服务。

## 功能特性

- **快速解析**：Web Worker 后台解析超大文件，实时显示解析进度，主线程零阻塞
- **波形解释与频率-时间曲线**：可独立选择待分析的**高电平脉冲 / 低电平脉冲**和采集静止时的**默认低电平 / 默认高电平**；默认状态按首条电平自动预选。默认**按下降沿**计频（`freq = 1 / 下降沿间隔`），也可选择**脉冲宽度**或**按上升沿**；与默认状态相连、无法观测完整周期的首尾脉冲固定按 50% 占空比计算
- **低电平间隔测试标注**：在原始频率-时间图上直接标出低电平间隔区域，不切换到独立曲线；默认标注 `≥1 ms` 的间隔，最小支持阈值为 `900 μs`，并支持可选 50% 占空比容差过滤
- **百万级数据渲染**：按像素列做 min/max 抽稀，包络形状与原始数据一致，缩放平移流畅
- **光标测量（A/B）**：单击放置光标 A、Ctrl+单击放置光标 B，实时显示 Δt、Δf、区间脉冲数、频率变化率与加速/减速判定
- **加减速检测**：一键自动识别加速 / 减速 / 匀速区间（多尺度滑动窗口 + 平台定位分段算法），并以表格与图表色块呈现
- **频率分布直方图**：自动分箱统计频率分布
- **AB 相分析**：可从首页选择「分析 AB 相数据文件」，读取 VCD 中的全部单比特 `$var` 通道并手动指定 A/B 相；显示两相阶梯波形，统计正反向周期、平均周期/频率、相位差、相位抖动与非法四相状态跳变
- **AB 相带符号频率**：按四相状态机输出正向正频率、反向负频率的频率-时间曲线，并显示 A/B 两路脉冲数
- **脉冲 + 方向 VCD**：自动建议脉冲源与方向源，也可手动切换；支持四种常见方向电平映射和自定义正向电平，输出正向正频率、反向负频率
- **统计信息**：采样频率、总脉冲数（每个高电平脉冲计一个）、上升/下降沿数、数据时长、频率点数、最小值 / 最大值 / 均值 / 标准差 / 变异系数
- **框选与导出**：图表框选任意时间范围，导出选区 CSV 或全量 CSV（`time_s, frequency_hz`）
- **缩放平移**：滚轮 / 双指缩放、拖拽平移、一键重置视图

## 支持的文件格式

| 格式 | 说明 |
| --- | --- |
| `.vcd` | Value Change Dump，解析 `$timescale` 时间刻度、`$var` 信号定义，并兼容包含 `Acquisition with N/M channels at X Hz` 注释的导出 |
| `.txt` | 两种子格式自动识别：①逻辑分析仪文本导出，逐行解析 `D0:` 行内电平字符（`1`/`"` 高电平，`0`/`.` 低电平，`/` `\` 边沿），从文件头读取采样频率；②sigrok PulseView「PWM 测量」导出（`<start>-<end> PWM: Duty cycles/Periods/Frequencies: ...`），频率/占空比/周期为仪器直接测量值（精度最高），采样率由区间跨度与周期值反推，时间点取区间中点 |
| `.sr` | sigrok / PulseView 导出格式（zip 容器），解析 `metadata`（采样率、通道数、unitsize）与 `logic-*` 数据块（含多分块 `capturefile-N`），提取 D0（probe1）信号跳变；内置 zip 目录解析与 deflate 解压，无需第三方库 |
| `.bin` | Saleae Logic 2 数字通道二进制导出（`<SALEAE>` 魔数，logic2-digital 布局）：解析头部初始电平、起止时刻与跳变时间数组，电平按初始值逐次翻转重建完整跳变序列；采样率按最短跳变间隔估计 |
| `.csv` | Saleae 跳变 CSV 导出：跳过 `Time [s],Channel 0` 表头后逐行解析 `时间,电平` 跳变对 |

## 快速开始

### 环境要求

- Node.js 22 LTS（推荐）；Vite 7 至少需要 Node.js 20.19 或 22.12
- npm 10 或更高版本
- 普通开发、构建和部署不需要安装 Rust。仓库已包含生成好的 WASM 文件

### 本地开发

```bash
# 克隆项目
git clone https://github.com/luoy-oss/PulseView.git
cd PulseView

# 按 package-lock.json 安装依赖
npm ci

# 启动开发服务器
npm run dev
```

打开终端显示的地址，默认通常是 <http://localhost:5173>。

如果需要让同一局域网内的其他设备访问：

```bash
npm run dev -- --host
```

Vite 会同时显示本机地址和局域网地址。Windows 防火墙首次弹窗时，需要允许 Node.js 访问专用网络。

首页的「是否启用测试性功能【可加速解析】」默认关闭，且不会记住上次选择。主动勾选后才会加载 Rust/WASM，目前用于加速 AB 相与脉冲方向分析；加载或执行失败时会自动回退 TypeScript。普通频率分析不需要开启该选项。

### 测试与生产构建

```bash
# 运行原有功能测试和 TS/WASM 等价测试
npm test

# 构建生产版本
npm run build

# 本地预览构建产物
npm run preview
```

打开预览服务器显示的地址，默认通常是 <http://localhost:4173>。生产文件输出到 `dist/`，其中包含 JavaScript、CSS 和 `.wasm` 资源。

`npm run build` 使用仓库内已生成的 `src/wasm/pkg`，因此普通开发机和部署平台只需 Node.js。如果修改了 `wasm-core/`，请先按「Rust/WASM 开发」一节重新生成 WASM。

## 部署

这是纯静态前端项目，没有数据库和服务端 API。部署目标只需要托管 `dist/` 目录，并允许浏览器加载 `.wasm` 文件。

### Vercel

项目已内置 [`vercel.json`](vercel.json)。最简单的方式是在 Vercel 控制台导入 `luoy-oss/PulseView`，配置保持为：

| 配置 | 值 |
| --- | --- |
| Framework Preset | Vite |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

也可以使用 Vercel CLI：

```bash
npm install --global vercel
vercel login
vercel

# 确认预览环境正常后发布到生产
vercel --prod
```

Vercel 部署使用仓库中的已生成 WASM，不需要在 Vercel 安装 Rust。

### GitHub Pages

仓库包含 [Pages workflow](.github/workflows/pages.yml)，推送到 `main` 后可自动部署：

1. 打开 GitHub 仓库的 **Settings → Pages**。
2. 在 **Build and deployment → Source** 中选择 **GitHub Actions**。
3. 推送到 `main`，或在 **Actions → Deploy GitHub Pages** 中点击 **Run workflow**。
4. 部署完成后访问 <https://luoy-oss.github.io/PulseView/>。

Pages workflow 会根据 GitHub 仓库名自动生成基础路径，例如本仓库为 `VITE_BASE_PATH=/PulseView/`，确保 JavaScript 和 WASM 在仓库子路径下正确加载。

### Cloudflare Pages、Netlify 或其他静态托管

使用下面的通用配置：

| 配置 | 值 |
| --- | --- |
| Node.js | 22 |
| 安装命令 | `npm ci` |
| 构建命令 | `npm run build` |
| 发布目录 | `dist` |

部署到域名根路径时无需额外环境变量。部署到 `/some-path/` 等子路径时，构建前设置：

```bash
VITE_BASE_PATH=/some-path/ npm run build
```

Windows PowerShell 对应命令：

```powershell
$env:VITE_BASE_PATH = '/some-path/'
npm run build
```

自建 Nginx/Apache 时应确保 `.wasm` 响应的 `Content-Type` 为 `application/wasm`。即使服务器 MIME 配置不正确，浏览器通常也会回退到普通实例化，但启动速度会变慢。

### GitHub Actions

仓库包含三个工作流：

| 工作流 | 触发条件 | 作用 |
| --- | --- | --- |
| [CI](.github/workflows/ci.yml) | PR、推送到 `main` | 检查 Rust 格式与测试、WASM 生成包加载验证、TS/WASM 等价测试和生产构建 |
| [Deploy GitHub Pages](.github/workflows/pages.yml) | 推送到 `main`、手动运行 | 使用仓库名基础路径构建并发布 `dist/` |
| [Release](.github/workflows/release.yml) | `v*.*.*` 标签、手动运行 | 完整测试后打包 `dist/` 并创建 GitHub Release |

Release 标签必须与 `package.json` 的版本一致。例如准备正式版 `3.4.0`：

```bash
git tag v3.4.0
git push origin v3.4.0
```

不要在未更新 `package.json` 版本时创建不同版本号的标签，否则 Release workflow 会主动失败。

#### 发布 Alpha、Beta 或 RC 测试版

Release workflow 支持标准 SemVer 预发布版本。只要 `package.json` 的版本包含 `-` 后缀，GitHub Release 就会自动标记为 **Pre-release**，不会作为最新正式版发布。

例如：

```bash
npm version 3.4.0-beta.1 --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore: prepare v3.4.0-beta.1"
git tag v3.4.0-beta.1
git push origin main v3.4.0-beta.1
```

版本识别规则：

| `package.json` 版本 | Git 标签 | GitHub Release 类型 |
| --- | --- | --- |
| `3.4.0-alpha.1` | `v3.4.0-alpha.1` | Pre-release |
| `3.4.0-beta.1` | `v3.4.0-beta.1` | Pre-release |
| `3.4.0-rc.1` | `v3.4.0-rc.1` | Pre-release |
| `3.4.0` | `v3.4.0` | 正式 Release |

### 常见问题

- 页面可以打开，但 AB/方向分析没有加速：检查浏览器控制台和 Network 面板中的 `.wasm` 请求。WASM 加载失败时应用会自动回退 TypeScript，功能仍可使用。
- 部署后 JS 或 WASM 返回 404：通常是子路径配置不正确。将 `VITE_BASE_PATH` 设置为以 `/` 开头和结尾的部署路径后重新构建。
- `npm run wasm:rebuild` 提示找不到 Cargo 或 `wasm-bindgen`：只有修改 Rust 源码时才需要这些工具，请按下方 Rust/WASM 开发说明安装。
- Vite 报 Node.js 版本不支持：升级到 Node.js 22 LTS，删除 `node_modules` 后重新运行 `npm ci`。

## 使用方法

1. 在首页拖放 `.vcd` / `.txt` / `.sr` / `.bin` / `.csv` 文件进行普通频率分析；对于编码器双路 VCD，点击「分析 AB 相数据文件」；对于脉冲加方向 VCD，点击「分析脉冲 + 方向 VCD」
2. 解析完成后自动生成频率-时间曲线
3. 在曲线图上：
   - **单击** 放置光标 A，**Ctrl+单击** 放置光标 B，底部面板查看测量结果
   - **滚轮 / 双指** 缩放，**拖拽** 平移
   - 「框选范围」按钮进入框选模式，拖拽选择区间后可导出选区 CSV
4. 切换分析面板标签页：光标分析 / 加减速检测 / 频率分布
5. 顶部工具栏支持「导出 CSV」「重置视图」「打开文件」

### AB 相分析

AB 相模式会读取 VCD 头中的全部单比特信号定义，例如 `$var wire 1 ! D0 $end` 与 `$var wire 1 " D2 $end`。进入分析页面后必须在下拉框中按实际接线手动选择 A 相和 B 相，工具将按四相状态序列分析方向：A 相超前 B 相 90° 时，`00 → 10 → 11 → 01 → 00` 为正向，反序为反向。页面输出正向正频率、反向负频率的频率-时间曲线，并提供与单相页面相同的缩放、平移、框选、导出与左键/ Ctrl+左键光标分析；同时给出 A/B 脉冲数、边沿数、正反向周期数、平均周期、相位差及非法跳变数。解析兼容一个时间戳行中包含多路变化的 PulseView VCD 写法，例如 `#0 0! 0"`。

### 脉冲 + 方向分析

该模式自动建议跳变密集的脉冲源和跳变稀疏的方向源，也可以手动选择。每个周期使用周期起点之前最近的方向电平，因此方向端先变化、随后才开始输出脉冲的采集可以直接分析，不测量方向延迟时间。方向映射提供四种常见预设和自定义正向电平；正向频率绘制在零线上方，反向频率绘制在零线下方。

## 项目结构

```
PulseView/
├── .github/workflows/       # CI、GitHub Pages 与 Release 自动化
├── index.html              # 入口页面
├── package.json            # 本地、测试、构建与 WASM 命令
├── vite.config.ts          # Vite 配置
├── vercel.json             # Vercel 部署配置
├── scripts/
│   └── build-wasm.mjs      # Cargo + wasm-bindgen 生成脚本
├── wasm-core/              # Rust 数值内核及 Rust 测试
├── tests/                  # TypeScript 功能与 TS/WASM 等价测试
└── src/
    ├── main.tsx            # 应用入口
    ├── App.tsx             # 状态管理与文件解析调度
    ├── types.ts            # 公共类型定义
    ├── utils.ts            # 频率/时间/变化率格式化、格式检测
    ├── srFormat.ts         # sigrok .sr（zip 容器）格式解析：zip 目录、metadata、deflate 解压、跳变扫描
    ├── saleaeFormat.ts     # Saleae Logic 2 导出格式解析：.bin 二进制头部与跳变时间、.csv 跳变行
    ├── compute.ts          # 频率计算、统计、加减速分段、直方图算法
    ├── decimate.ts         # 可见窗口数据定位与像素列 min/max 抽稀
    ├── wasm/               # WASM 加载、回退、对照与生成产物
    ├── workers/
    │   ├── vcdParser.ts    # VCD 文件解析 Worker
    │   ├── txtParser.ts    # TXT 文件解析 Worker
    │   ├── srParser.ts     # SR 文件解析 Worker（调用 srFormat）
    │   └── saleaeParser.ts # BIN/CSV 文件解析 Worker（调用 saleaeFormat）
    └── components/
        ├── UploadScreen.tsx    # 文件上传页
        ├── AppShell.tsx        # 主界面布局
        ├── Header.tsx          # 顶部工具栏
        ├── Sidebar.tsx         # 统计信息栏
        ├── FreqChart.tsx       # 频率-时间曲线图
        ├── AnalysisPanel.tsx   # 光标 / 加减速 / 直方图分析面板
        └── StatusBar.tsx       # 底部状态栏
```

## 核心算法

- **频率重建**：三种计算模式，工具栏一键切换——
  - **波形解释**：工具栏可独立指定「脉冲电平」（高电平脉冲 / 低电平脉冲）和「默认状态」（默认低电平 / 默认高电平）。默认状态由导入数据的首条电平自动选择；脉冲电平默认是高电平。选择低电平脉冲时，软件仅在分析时将电平翻转，原始时间戳不变。若首个或最后一个脉冲与记录外的默认电平连在一起，另一半周期不可观测，该边界脉冲统一按 `period = 2 × 脉宽`、50% 占空比计算；中间完整脉冲继续使用真实边沿间隔
  - **按下降沿**（默认）：以相邻两个下降沿为周期边界、`freq = 1 / (fall[n] - fall[n-1])`，时间点取相邻两下降沿的中点（代表该周期发生的时刻），实测占空比 = 周期内含脉冲宽度 / 周期。边界脉冲按 50% 占空比口径计算
  - **脉冲宽度**：逻辑分析仪导出的跳变严格 1/0 交替，每个高电平脉冲由上升沿+下降沿显式界定、脉宽直接可算——频率点横坐标取该脉冲的上升沿时刻、频率 `1/(2×脉宽)`（等价于假设占空比 50%，与逻辑分析仪测量口径一致），同时显示实测占空比；低电平区间不生成频率点，避免阶梯状曲线。勾选「占空比修正」后改用 `1/(2×脉宽) × (占空比/50%) = 1/周期`，适合窄脉冲/占空比变化信号；周期与占空比默认按相邻两脉冲**下降沿**间隔计算，可经「基准」按钮切换为上升沿。首脉冲因起始段不完整，固定按 50% 占空比口径计算
  - **按上升沿**：相邻两个上升沿的间隔 `dt` 为一个周期，频率 `1/dt`，适合占空比变化或窄脉冲信号；首尾边界脉冲同样固定按 50% 占空比口径计算
  - **低电平间隔（测试标注）**：对第 n 个完整脉冲计算 `G = (下降沿[n] - 下降沿[n-1]) - 2 × (下降沿[n] - 上升沿[n])`，并在原始频率图的对应低电平时间段绘制标注。默认只标注 `G >= 1 ms`，阈值最低可设为 `900 μs`；该标注不改变频率曲线，且不适用于双脉冲或不完整边沿数据
  - 所有格式的跳变均为严格 1/0 交替的方波，边沿时间即数据本身：三种频率模式及低电平间隔测试模式均直接按边沿对计算（脉宽 = 上升沿→下降沿，周期 = 相邻上升沿/下降沿间隔），不做任何间隙过滤，扫频末端低速脉冲不会被误删；低电平间隔只在严格 50% 占空比、单一高脉冲前提下解释为间隔。加减速分段按间隔分布 ≥30 倍"断层"识别真实停歇（如两段测试间的空闲）并切块
- **PWM 测量直通**（`.txt` 的 PulseView「PWM 测量」导出）：文件每区间直接给出 `Duty cycles`、`Periods`、`Frequencies` 测量值与采样区间 `<start>-<end>`——频率、占空比、周期均为仪器直接测量结果，不再做边沿推算（精度最高），直接生成频率点：时间为区间中点（采样率由区间跨度与周期值反推：`samplingRate ≈ (end - start) / period`，多区间取中位数），频率/占空比为文件原值；无边沿数据，模式切换按钮不生效
- **像素列抽稀**：可见点数超过渲染阈值时，每个像素列仅保留频率最小与最大两个点，完整保留波形包络
- **加减速检测**：多尺度滑动窗口取最大相对波动识别平台核心区，以平台均值 ±1% 容差向两侧精确扩展边界，平台之间即为加减速过渡段（方向由段首尾频率差判定），再合并噪声碎段
- **脉冲计数**：光标区间脉冲数通过二分查找上升沿时间数组获得，O(log n) 查询

## 技术栈

- [React](https://react.dev) 18 + [TypeScript](https://www.typescriptlang.org) 5
- [Vite](https://vitejs.dev) 7
- [Chart.js](https://www.chartjs.org) 4 + [react-chartjs-2](https://react-chartjs-2.js.org)，配合 [chartjs-plugin-zoom](https://github.com/chartjs/chartjs-plugin-zoom) 与 [chartjs-plugin-annotation](https://github.com/chartjs/chartjs-plugin-annotation)
- Web Worker（Vite `?worker` 导入）承载文件解析
- Rust/WebAssembly（`wasm-bindgen`）承载 AB 相和脉冲方向热点分析；加载或运行失败时自动回退 TypeScript

### Rust/WASM 开发

普通开发和部署使用仓库内已生成的 `src/wasm/pkg`，运行 `npm run build` 不要求安装 Rust。

修改 `wasm-core` 后需要 Rust 1.94.1、`wasm32-unknown-unknown` target，以及与 crate 固定版本一致的 `wasm-bindgen-cli 0.2.100`：

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.100 --locked
npm run wasm:rebuild
npm test
```

`npm run wasm:check` 用于 CI 或提交前重新生成并验证 WASM 包可以加载、关键导出存在。由于 `wasm-bindgen` 在不同操作系统上生成文件的顺序和二进制布局可能不同，检查不会进行跨平台字节级 diff；`npm test` 中的差分等价套件（`tests/wasmDifferential.test.mjs`）会用确定性随机种子把 Rust/WASM 与 TypeScript 逐模块、逐字段比对，覆盖 NaN/±Infinity、重复与乱序时间戳、非二进制电平、负数分箱参数及全部选项组合，任何不一致都会使测试失败。频率、加速度、抽稀和加减速分段也有 Rust 实验实现及等价/专项测试，但端到端基准显示其当前 WASM 适配成本高于现有 TypeScript 路径，因此未作为生产默认实现。

## 许可证

[GPL-3.0](LICENSE)
