import * as vscode from 'vscode';
import { LanceDBStore } from '@codebase-indexer/core';
import type { CodeIndexer } from '@codebase-indexer/core';

export class ClearCommand {
  private indexer: CodeIndexer;

  constructor(indexer: CodeIndexer) {
    this.indexer = indexer;
  }

  setIndexer(indexer: CodeIndexer): void {
    this.indexer = indexer;
  }

  async execute(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      vscode.window.showErrorMessage('No workspace folder open.');
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      'Are you sure you want to clear the code index?',
      { modal: true },
      'Clear Index',
    );

    if (confirm !== 'Clear Index') return;

    const folder = folders[0]!;
    const config = vscode.workspace.getConfiguration('codebaseIndexer');
    const indexDir = config.get<string>('indexDir') || '.codebase-indexer';
    const dimensions = config.get<number>('embedding.dimensions') || 1536;
    const dbPath = vscode.Uri.joinPath(folder.uri, indexDir).fsPath;

    const store = new LanceDBStore({ dbPath, vectorSize: dimensions });
    try {
      await store.deleteAll();
      vscode.window.showInformationMessage('Code index cleared.');
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to clear index: ${(err as Error).message}`);
    }
  }
}
