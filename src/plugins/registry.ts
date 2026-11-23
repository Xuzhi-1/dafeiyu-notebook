/** 插件注册表：只保存插件命令。 */

export interface PluginCommand {
  readonly id: string;
  readonly title: string;
  readonly run: () => unknown;
  readonly pluginId: string;
  readonly pluginName: string;
}

export class PluginRegistry {
  private readonly commands = new Map<string, PluginCommand>();

  registerCommand(command: PluginCommand): () => void {
    this.commands.set(command.id, command);
    return () => {
      if (this.commands.get(command.id) === command) this.commands.delete(command.id);
    };
  }

  listCommands(): PluginCommand[] {
    return [...this.commands.values()];
  }

  clear(): void {
    this.commands.clear();
  }
}
