# 大肥鱼笔记本

<sub>Dafeiyu Notebook</sub>

一个本地优先的块式笔记与文档编辑器，使用 TypeScript、Electron 和原生 tsc 构建。

<sub>A local-first block-based note and document editor built with TypeScript, Electron, and plain tsc.</sub>

## 功能

<sub>Features</sub>

- 块式编辑，支持段落、引用、列表、分割线
- 富文本：加粗、斜体、下划线、删除线、颜色、高亮、对齐、缩进
- 表格、图片、图表
- 目录、注释、标记、分组
- 全文搜索
- 主题、背景色、纸张色、文字色
- 字体库，支持 TTF / OTF / WOFF
- Word / Markdown / 文本导入，Word / PDF 导出
- 插件系统与 DSH MCP 接入
- 简体中文与英文界面
- `.dfy` 本地文档格式

<sub>Block editing, rich text, tables, images, charts, outline, comments, marks, groups, full-text search, themes, custom fonts, Word/Markdown import, Word/PDF export, plugins, DSH MCP integration, Chinese/English UI, and a local `.dfy` document format.</sub>

## 系统要求

<sub>Requirements</sub>

```text
Windows 10 / 11 x64
```

开发环境需要 Node.js 20 或更高版本。

<sub>Windows 10/11 x64. Node.js 20+ is required for development.</sub>

## 下载

<sub>Download</sub>

正式安装包发布在 GitHub Releases 页面。

<sub>Official installers are published on the GitHub Releases page.</sub>

## 开发

<sub>Development</sub>

```bash
npm ci
npm run dev
```

常用命令：

<sub>Common commands:</sub>

```bash
npm run typecheck   # TypeScript 类型检查
npm test -- --run   # 单元测试
npm run build       # 编译到 dist/
npm run dist        # 构建 Windows 安装包
```

## 测试

<sub>Testing</sub>

```bash
npm run typecheck
npm test -- --run
npm run build
npm run smoke
```

主冒烟测试需要先启动一个带远程调试端口的 Electron 实例。具体环境变量见 `scripts/prepare-profile.mjs` 和 `scripts/smoke.mjs`。

<sub>The main smoke suite requires a running Electron instance with remote debugging enabled. See `scripts/prepare-profile.mjs` and `scripts/smoke.mjs`.</sub>

## 性能建议

<sub>Performance</sub>

基于当前测试环境：

<sub>Based on the current test environment:</sub>

```text
纯文本：
  3,000 块以内：流畅
  5,000 块左右：可用，批量操作有轻微延迟
  8,000 块以上：明显变慢

包含图片、表格、批注、标记的复杂文档：
  1,000–1,500 块：推荐范围
  2,000 块以上：开始明显变慢
  3,000 块以上：不推荐
```

性能受图片大小、表格复杂度、批注数量、缩放比例和设备性能影响。

<sub>Performance depends on image size, table complexity, annotation count, zoom level, and device performance.</sub>

## 目录

<sub>Project layout</sub>

```text
src/core/       文档模型、操作、diff、store
src/editor/     编辑器、渲染、粘贴、清理
src/app/        应用装配、文件、工具栏、菜单
src/renderer/   静态页面、样式、资源
electron/       主进程、MCP、插件协议
plugins/        示例插件
test/           单元测试
scripts/        构建、冒烟、基准脚本
```

## 插件与 DSH

<sub>Plugins and DSH</sub>

插件目录位于用户数据目录下的 `plugins/<id>/`。

<sub>User plugins live in `plugins/<id>/` under the user data directory.</sub>

DSH 接入通过右上角“更多”菜单中的“DSH 接入”启用，默认不启动。

<sub>DSH integration is disabled by default and can be enabled from the “More” menu.</sub>

## 许可证与资产

<sub>License and assets</sub>

- 源代码：MIT，完整文本见 [LICENSE](LICENSE)
- 应用图标：CC BY-NC-SA 4.0
- 字体：各自许可证，见 `src/renderer/fonts/`
- 第三方声明：[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)

<sub>Source code: MIT, see [LICENSE](LICENSE). App icon: CC BY-NC-SA 4.0. Fonts: their respective licenses. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).</sub>

本仓库不包含作者的个人 Logo 或个人收款二维码。

<sub>This repository does not include the author's personal logo or payment QR code.</sub>

官方安装包可能包含源码仓库中不提供的作者专属素材；这些素材不属于 MIT 许可证范围。

<sub>Official installers may include author-only assets not present in the source repository. Those assets are not covered by the MIT License.</sub>

## 贡献

<sub>Contributing</sub>

提交问题或修改前，请先运行：

<sub>Before submitting an issue or change, please run:</sub>

```bash
npm run typecheck
npm test -- --run
npm run build
```

请保持模块边界，避免把文档核心逻辑写入渲染层或主进程。

<sub>Please keep module boundaries clear and avoid putting core document logic into the renderer or main process.</sub>
