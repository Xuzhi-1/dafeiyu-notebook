/** 本地 MCP server：只绑定 127.0.0.1，供 DSH 通过 mcp-client 调用。 */
const http = require('node:http');

const TOOLS = [
  {
    name: 'notebook_get_context',
    description: '读取当前日记的标题、选区、当前块和有限上下文。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'notebook_get_status',
    description: '读取日记的文件状态和块数量。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'notebook_insert_text',
    description: '把纯文本插入日记。target 为 current、after 或 end。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要插入的纯文本' },
        target: { type: 'string', enum: ['current', 'after', 'end'], description: '插入位置' },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'notebook_replace_selection',
    description: '用纯文本替换当前唯一选中的文本块。',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: '替换后的纯文本' } },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'notebook_save',
    description: '保存当前日记。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

function jsonRpc(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function toolResult(value, isError = false) {
  return {
    content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }],
    isError,
  };
}

function createMcpServer({ port, token, execute }) {
  let server = null;
  let running = false;

  const handler = async (req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    if (url.pathname !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    const supplied = req.headers.authorization?.replace(/^Bearer\s+/i, '')
      || req.headers['x-mcp-token']
      || url.searchParams.get('token')
      || '';
    if (!token || supplied !== token) {
      res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('unauthorized');
      return;
    }
    if (req.method === 'GET') {
      res.writeHead(405, { Allow: 'POST' });
      res.end();
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end();
      return;
    }
    let body = '';
    try {
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 2 * 1024 * 1024) throw new Error('request too large');
      }
      const message = JSON.parse(body);
      if (Array.isArray(message)) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(jsonRpcError(null, -32600, 'batch requests are not supported')));
        return;
      }
      const { id, method, params } = message;
      if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
        res.writeHead(202);
        res.end();
        return;
      }
      if (method === 'initialize') {
        const version = String(params?.protocolVersion || '2025-03-26');
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(jsonRpc(id, {
          protocolVersion: version,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'dafeiyu-notebook', version: '2.0.1' },
        })));
        return;
      }
      if (method === 'ping') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(jsonRpc(id, {})));
        return;
      }
      if (method === 'tools/list') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(jsonRpc(id, { tools: TOOLS })));
        return;
      }
      if (method === 'tools/call') {
        const name = String(params?.name || '');
        const tool = TOOLS.find((item) => item.name === name);
        if (!tool) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(jsonRpc(id, toolResult(`未知工具：${name}`, true))));
          return;
        }
        try {
          const value = await execute(name, params?.arguments || {});
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(jsonRpc(id, toolResult(value))));
        } catch (error) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(jsonRpc(id, toolResult(String(error?.message ?? error), true))));
        }
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(jsonRpcError(id, -32601, `未知方法：${method || ''}`)));
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(jsonRpcError(null, -32700, String(error?.message ?? error))));
    }
  };

  return {
    get running() { return running; },
    start() {
      if (running) return Promise.resolve();
      return new Promise((resolve, reject) => {
        server = http.createServer((req, res) => { void handler(req, res); });
        server.once('error', (error) => {
          running = false;
          server = null;
          reject(error);
        });
        server.listen(port, '127.0.0.1', () => {
          running = true;
          resolve();
        });
      });
    },
    stop() {
      if (!server) return Promise.resolve();
      const current = server;
      server = null;
      running = false;
      return new Promise((resolve) => current.close(() => resolve()));
    },
  };
}

module.exports = { createMcpServer, TOOLS };
