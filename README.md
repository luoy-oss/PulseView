# PulseView 频率分析器

基于 Web 的逻辑分析仪信号频率分析工具。导入逻辑分析仪导出的 `.vcd` / `.txt` / `.sr` 文件，从信号跳变中重建频率-时间曲线，并提供光标测量、加减速区间自动识别、频率分布统计等分析能力。

纯前端实现，所有解析与计算均在浏览器本地完成（Web Worker 后台解析，不阻塞 UI），无需任何后端服务。

## 功能特性

- **快速解析**：Web Worker 后台解析超大文件，实时显示解析进度，主线程零阻塞
- **频率-时间曲线**：每个高电平脉冲生成一个频率点（`freq = 1 / (2 × 脉宽)`），与逻辑分析仪测量口径一致
- **百万级数据渲染**：按像素列做 min/max 抽稀，包络形状与原始数据一致，缩放平移流畅
- **光标测量（A/B）**：单击放置光标 A、Ctrl+单击放置光标 B，实时显示 Δt、Δf、区间脉冲数、频率变化率与加速/减速判定
- **加减速检测**：一键自动识别加速 / 减速 / 匀速区间（多尺度滑动窗口 + 平台定位分段算法），并以表格与图表色块呈现
- **频率分布直方图**：自动分箱统计频率分布
- **统计信息**：采样频率、上升/下降沿数、数据时长、频率点数、最小值 / 最大值 / 均值 / 标准差 / 变异系数
- **框选与导出**：图表框选任意时间范围，导出选区 CSV 或全量 CSV（`time_s, frequency_hz`）
- **缩放平移**：滚轮 / 双指缩放、拖拽平移、一键重置视图

## 支持的文件格式

| 格式 | 说明 |
| --- | --- |
| `.vcd` | Value Change Dump，解析 `$timescale` 时间刻度、`$var` 信号定义，并兼容包含 `Acquisition with N/M channels at X Hz` 注释的导出 |
| `.txt` | 逻辑分析仪文本导出，逐行解析 `D0:` 行内电平字符（`1`/`"` 高电平，`0`/`.` 低电平，`/` `\` 边沿），从文件头读取采样频率 |
| `.sr` | sigrok / PulseView 导出格式（zip 容器），解析 `metadata`（采样率、通道数、unitsize）与 `logic-*` 数据块（含多分块 `capturefile-N`），提取 D0（probe1）信号跳变；内置 zip 目录解析与 deflate 解压，无需第三方库 |

## 快速开始

环境要求：Node.js ≥ 18

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 本地预览构建产物
npm run preview
```

构建产物输出到 `dist/`。

## 部署

项目已内置 [`vercel.json`](vercel.json)，可直接部署到 Vercel：

```bash
vercel
```

或导入仓库到 [Vercel](https://vercel.com)，框架自动识别为 Vite，构建命令 `vite build`，输出目录 `dist`。

## 使用方法

1. 在首页拖放 `.vcd` / `.txt` / `.sr` 文件，或点击「选择文件」
2. 解析完成后自动生成频率-时间曲线
3. 在曲线图上：
   - **单击** 放置光标 A，**Ctrl+单击** 放置光标 B，底部面板查看测量结果
   - **滚轮 / 双指** 缩放，**拖拽** 平移
   - 「框选范围」按钮进入框选模式，拖拽选择区间后可导出选区 CSV
4. 切换分析面板标签页：光标分析 / 加减速检测 / 频率分布
5. 顶部工具栏支持「导出 CSV」「重置视图」「打开文件」

## 项目结构

```
PulseView/
├── index.html              # 入口页面
├── vite.config.ts          # Vite 配置
├── vercel.json             # Vercel 部署配置
└── src/
    ├── main.tsx            # 应用入口
    ├── App.tsx             # 状态管理与文件解析调度
    ├── types.ts            # 公共类型定义
    ├── utils.ts            # 频率/时间/变化率格式化、格式检测
    ├── srFormat.ts         # sigrok .sr（zip 容器）格式解析：zip 目录、metadata、deflate 解压、跳变扫描
    ├── compute.ts          # 频率计算、统计、加减速分段、直方图算法
    ├── decimate.ts         # 可见窗口数据定位与像素列 min/max 抽稀
    ├── workers/
    │   ├── vcdParser.ts    # VCD 文件解析 Worker
    │   ├── txtParser.ts    # TXT 文件解析 Worker
    │   └── srParser.ts     # SR 文件解析 Worker（调用 srFormat）
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

- **频率重建**：从跳变序列提取每个高电平脉冲的宽度 `dt`，频率点取脉冲中点时刻、频率 `1/(2×dt)`；低电平区间不生成频率点，避免阶梯状曲线；中位数 50 倍的跳变间隔被识别为停歇间隙并跳过
- **像素列抽稀**：可见点数超过渲染阈值时，每个像素列仅保留频率最小与最大两个点，完整保留波形包络
- **加减速检测**：多尺度滑动窗口取最大相对波动识别平台核心区，以平台均值 ±1% 容差向两侧精确扩展边界，平台之间即为加减速过渡段（方向由段首尾频率差判定），再合并噪声碎段
- **脉冲计数**：光标区间脉冲数通过二分查找上升沿时间数组获得，O(log n) 查询

## 技术栈

- [React](https://react.dev) 18 + [TypeScript](https://www.typescriptlang.org) 5
- [Vite](https://vitejs.dev) 5
- [Chart.js](https://www.chartjs.org) 4 + [react-chartjs-2](https://react-chartjs-2.js.org)，配合 [chartjs-plugin-zoom](https://github.com/chartjs/chartjs-plugin-zoom) 与 [chartjs-plugin-annotation](https://github.com/chartjs/chartjs-plugin-annotation)
- Web Worker（Vite `?worker` 导入）承载文件解析

## 许可证

[GPL-3.0](LICENSE)
