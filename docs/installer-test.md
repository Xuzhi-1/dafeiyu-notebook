# Windows 安装包测试清单

## 构建

```bash
npm ci
npm run build
npm run dist
```

产物在 `release/`。

## 测试环境

```text
Windows 10 / 11 x64
普通用户权限
干净安装目录
```

## 安装检查

- [ ] 安装向导可正常打开
- [ ] 可修改安装目录
- [ ] 桌面和开始菜单快捷方式名称正确
- [ ] 安装后能启动
- [ ] 卸载后用户文档和用户插件仍保留

## 功能检查

- [ ] 新建、打开、保存、另存为
- [ ] 双击 `.dfy` 文件可打开
- [ ] 导入 Word / Markdown / 文本
- [ ] 导出 Word / PDF
- [ ] 最近文件与窗口状态恢复
- [ ] 中英文切换
- [ ] 字体库、插件管理、DSH 接入
- [ ] 关于窗口
- [ ] 未保存关闭提示

## 注意事项

```text
安装包未做代码签名时，
Windows SmartScreen 可能提示“未知发布者”。
```

正式发布时应附带：

- `LICENSE`
- `THIRD-PARTY-NOTICES.md`
- 对应版本的 SHA256
