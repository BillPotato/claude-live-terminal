import * as vscode from 'vscode';
import { DirWatcher } from './dirWatcher';
import { TerminalManager } from './terminalManager';

let watcher: DirWatcher | undefined;
let manager: TerminalManager | undefined;

export function activate(context: vscode.ExtensionContext): void {
  manager = new TerminalManager();
  watcher = new DirWatcher((meta) => manager!.dispatch(meta));
  watcher.start();

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeLiveTerminal.showTerminals', () => {
      manager?.showAll();
    }),
    { dispose: () => watcher?.dispose() },
    { dispose: () => manager?.dispose() },
  );
}

export function deactivate(): void {
  watcher?.dispose();
  manager?.dispose();
}
