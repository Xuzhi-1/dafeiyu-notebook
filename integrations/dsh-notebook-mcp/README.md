# 大肥鱼笔记本 DSH MCP 接入

1. 在日记中打开「更多 → DSH 接入」，点击「启用」。
2. 复制面板中的 MCP 地址。
3. 把 `cordis.patch.yml` 里的 `REPLACE_WITH_NOTEBOOK_TOKEN` 替换成地址中的 token。
4. 在 DSH 中安装这个配置型 bundle，然后重新连接 MCP。

配置完成后，DSH 会获得：

- `notebook_get_context`
- `notebook_get_status`
- `notebook_insert_text`
- `notebook_replace_selection`
- `notebook_save`

MCP server 只监听 `127.0.0.1:41337`，并且需要 token。日记关闭后连接会断开。
