import * as vscode from 'vscode';
import { CodeIndexer } from '@codebase-indexer/core';
import { ConfigManager } from './config/config-manager';
import { IndexCommand } from './commands/index-command';
import { SearchCommand } from './commands/search-command';
import { ClearCommand } from './commands/clear-command';
import { SearchViewProvider } from './webview/search-view-provider';

let indexer: CodeIndexer;
let configManager: ConfigManager;
let indexCommand: IndexCommand;
let searchCommand: SearchCommand;
let clearCommand: ClearCommand;
let searchProvider: SearchViewProvider;

export function activate(context: vscode.ExtensionContext): void {
  configManager = new ConfigManager();
  indexer = new CodeIndexer(configManager.getConfig());

  // Commands
  indexCommand = new IndexCommand(indexer);
  searchCommand = new SearchCommand(indexer);
  clearCommand = new ClearCommand(indexer);

  context.subscriptions.push(
    vscode.commands.registerCommand('codebaseIndexer.indexWorkspace', () => indexCommand.execute()),
    vscode.commands.registerCommand('codebaseIndexer.search', () => searchCommand.execute()),
    vscode.commands.registerCommand('codebaseIndexer.clearIndex', () => clearCommand.execute()),
  );

  // Sidebar Webview
  searchProvider = new SearchViewProvider(
    context.extensionUri,
    indexer,
    searchCommand,
    indexCommand,
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SearchViewProvider.viewType, searchProvider),
  );

  // Status Bar
  const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusItem.text = '$(search) Indexer';
  statusItem.tooltip = 'Codebase Indexer';
  statusItem.command = 'codebaseIndexer.search';
  statusItem.show();
  context.subscriptions.push(statusItem);

  // Config Change Listener
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('codebaseIndexer')) {
        reloadConfig();
      }
    }),
  );

  // Auto-index on startup (if enabled and configured)
  const autoIndex = vscode.workspace.getConfiguration('codebaseIndexer').get<boolean>('autoIndex');
  if (autoIndex && configManager.isConfigured()) {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      indexer.indexWorkspace(folders[0]!.uri.fsPath).catch((err) => {
        console.warn('[Codebase Indexer] Auto-index failed:', (err as Error).message);
      });
    }
  }
}

function reloadConfig(): void {
  indexer = new CodeIndexer(configManager.getConfig());
  indexCommand.setIndexer(indexer);
  searchCommand.setIndexer(indexer);
  clearCommand.setIndexer(indexer);
  searchProvider.setIndexer(indexer);
}

export function deactivate(): void {
  // cleanup if needed
}
