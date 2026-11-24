/**
 * 平台接口：对 preload 暴露的 window.moye 做类型化封装。
 * 渲染层不直接碰 Node/Electron。
 */

export interface DocFilePayload {
  path: string;
  data: unknown;
}

export interface SaveResult {
  path?: string;
  canceled?: boolean;
  error?: string;
}

export interface PluginManifestPayload {
  id: string;
  name: string;
  version: string;
  description?: string;
  main: string;
}

export interface RecentFile {
  path: string;
  title: string;
  at: number;
}

export interface ImportedText {
  path: string;
  name: string;
  kind?: 'text' | 'docx';
  content?: string;
  html?: string;
}

export interface PickedImage {
  path: string;
  name: string;
  dataUrl: string;
}

export interface ClipboardSnapshot {
  text: string;
  html: string;
  image: string;
}

export interface ClipboardImage {
  dataUrl: string;
  width: number;
  height: number;
}


export interface McpStatus {
  enabled: boolean;
  running: boolean;
  port: number;
  url: string;
  token: string;
  error?: string;
  ok?: boolean;
}

export interface McpCommand {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface MoyeApi {
  openFile(): Promise<DocFilePayload | null>;
  readPath(filePath: string): Promise<DocFilePayload>;
  save(filePath: string, data: unknown): Promise<SaveResult>;
  saveAs(data: unknown, defaultName: string): Promise<SaveResult>;
  exportDocx(html: string, defaultName: string, pageSize: string): Promise<SaveResult>;
  exportPdf(defaultName: string, pageSize: string): Promise<SaveResult>;
  onOpenPath(callback: (filePath: string) => void): () => void;
  takeStartupPath(): Promise<string | null>;
  rendererReady(): Promise<string | null>;
  openFileInNewWindow(filePath?: string): Promise<boolean>;
  registerFileAssociation(): Promise<{ ok: boolean; error?: string }>;
  mcpStatus(): Promise<McpStatus>;
  mcpEnable(): Promise<McpStatus>;
  mcpDisable(): Promise<McpStatus>;
  onMcpCommand(callback: (payload: McpCommand) => void): () => void;
  mcpResult(payload: { id: string; ok: boolean; result?: unknown; error?: string }): void;
  setDirty(dirty: boolean): void;
  setDocumentPath(filePath: string | null): void;
  setLocale(locale: string): void;
  recentList(): Promise<RecentFile[]>;
  recentAdd(payload: { path: string; title: string }): Promise<RecentFile[]>;
  importText(): Promise<ImportedText | null>;
  pickImage(): Promise<PickedImage | null>;
  readClipboardImage(): Promise<ClipboardImage | null>;
  writeBlockClipboard(text: string, html: string): Promise<boolean>;
  readClipboardHtml(): Promise<string>;
  readClipboardText(): Promise<string>;
  snapshotClipboard(): Promise<ClipboardSnapshot | null>;
  restoreClipboard(snapshot: ClipboardSnapshot | null): Promise<boolean>;
  saveText(name: string, content: string): Promise<{ path?: string; canceled?: boolean; error?: string }>;
  showItemInFolder(filePath: string): Promise<boolean>;
  openExternal(url: string): Promise<boolean>;
  print(): Promise<{ ok: boolean; reason?: string }>;
  windowControls: {
    minimize(): void;
    maximize(): void;
    close(): void;
    state(): Promise<{ maximized: boolean }>;
    onMaximized(callback: (value: boolean) => void): () => void;
  };
  getPathForFile(file: File): string;
  info(): Promise<{ version: string; isPackaged: boolean; userData: string; envUserData: string | null; argv: string[]; pluginRoots: string[]; bounds?: { width: number; height: number } | null; maximized?: boolean; dirty?: boolean }>;
  plugins: {
    list(): Promise<PluginManifestPayload[]>;
    openDir(): Promise<string>;
    remove(id: string): Promise<{ ok?: boolean; error?: string }>;
  };
}

declare global {
  interface Window {
    moye?: MoyeApi;
  }
}

export function platform(): MoyeApi | undefined {
  return window.moye;
}
