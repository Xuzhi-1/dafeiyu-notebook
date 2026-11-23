# 测试覆盖矩阵与迁移规则

## 目标

测试数量不是目标。目标是覆盖关键用户路径，并且失败时能直接定位到行为。

当前保留三层：

```text
core 单测        纯函数、数据结构、操作
DOM 场景测试     选择、编辑、格式、剪贴板、表格
专项冒烟         安全、颜色、系统行为
```

## 关键路径

| 路径 | 当前覆盖 | 事件真实度 | 备注 |
|---|---|---|---|
| 文本输入 / 退出编辑 | `smoke.mjs`、`smoke-format.mjs` | 部分真实 | 保留 |
| 区块单击 / 多选 | `smoke.mjs` | 部分真实 | 继续迁移 |
| 空白点击退出 | `smoke-format.mjs` | 合成 pointer | 继续迁移到真实 mouse |
| 左右空白拖入框选 | `smoke-format.mjs` | 合成 pointer | 继续迁移到真实 drag |
| 右键空白平移 | `smoke-format.mjs` | 合成 pointer | 继续迁移到真实 drag |
| 文本选区与区块选区互斥 | `smoke-format.mjs` | 合成 pointer | 已覆盖 |
| 字体 / 字号混合值 | `smoke-format.mjs` | 合成事件 + DOM 断言 | 已覆盖 |
| 区块复制 / 粘贴 / 空块替换 | `smoke-format.mjs` | actions + 系统剪贴板 | 已合并为一个场景 |
| 粘贴后撤销 | `smoke-format.mjs` | actions | 已覆盖 |
| 注释粘贴 | `smoke-format.mjs` | ClipboardEvent | 已覆盖 |
| 表格编辑 / 搜索 | `smoke-table.mjs` | DOM + 真实按键 | 已覆盖 |
| 导入 / 导出 | `smoke.mjs` | actions | 保留，属于核心链路 |

## 迁移规则

1. 新场景必须映射到要替代的旧测试。
2. 新场景连续通过两次后，才删除旧测试。
3. 删除前确认三类断言仍存在：
   - 模型结果；
   - DOM / focus / selection；
   - 撤销或持久化结果。
4. 同一路径的变体不新增独立测试，加入已有场景的断言。
5. 剪贴板测试串行执行；系统剪贴板是全局状态，不能并行。
6. 固定 sleep 只允许出现在无法观察的时序点；优先 `waitFor`。

## 旧测试删除条件

```text
新场景覆盖同样的用户路径
+ 同样的模型断言
+ 同样的 DOM/焦点/选区断言
+ 连续两次通过
```

四条同时满足才删除。

## 当前批次

已完成：

```text
smoke-format 26 → 22 项
剪贴板 5 个重复场景 → 1 个完整流程
点击辅助自动滚动，移除未使用的 waitFor / press 辅助
```

尚未完成：

```text
smoke.mjs 按领域拆分
其余合成 pointer 迁移到真实 mouse
新旧并存期结束后清理 legacy 测试
```
