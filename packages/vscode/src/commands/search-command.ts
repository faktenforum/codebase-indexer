import * as vscode from 'vscode';
import type { CodeIndexer, SearchResult } from '@codebase-indexer/core';

export class SearchCommand {
  private indexer: CodeIndexer;

  constructor(indexer: CodeIndexer) {
    this.indexer = indexer;
  }

  setIndexer(indexer: CodeIndexer): void {
    this.indexer = indexer;
  }

  async execute(preSelectedText?: string): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      vscode.window.showErrorMessage('No workspace folder open.');
      return;
    }

    if (!this.indexer.isEnabled()) {
      vscode.window.showErrorMessage('Codebase Indexer: Please configure an embedding API key in settings.');
      return;
    }

    const folder = folders[0]!;
    const hasIdx = await this.indexer.hasIndex(folder.uri.fsPath);
    if (!hasIdx) {
      vscode.window.showWarningMessage('No index found. Please index the workspace first.');
      return;
    }

    const query = await vscode.window.showInputBox({
      prompt: 'Semantic code search',
      placeHolder: 'Search for code...',
      value: preSelectedText || '',
    });

    if (!query) return;

    const results = await this.indexer.searchWorkspace(folder.uri.fsPath, query, {
      limit: 20,
    });

    if (results.length === 0) {
      vscode.window.showInformationMessage('No results found.');
      return;
    }

    const items = results.map((r) => this.toQuickPickItem(r, folder));
    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: `${results.length} results for "${query}"`,
      matchOnDetail: true,
      matchOnDescription: true,
    });

    if (selected?.result) {
      await this.openResult(selected.result, folder);
    }
  }

  async executeForWebview(
    term: string,
    limit: number,
  ): Promise<SearchResult[]> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return [];
    const folder = folders[0]!;
    return this.indexer.searchWorkspace(folder.uri.fsPath, term, { limit });
  }

  private toQuickPickItem(
    result: SearchResult,
    folder: vscode.WorkspaceFolder,
  ): vscode.QuickPickItem & { result: SearchResult } {
    return {
      label: `$(file) ${result.file_path}`,
      description: `Lines ${result.start_line}-${result.end_line} (score: ${result.score.toFixed(3)})`,
      detail: result.code_chunk.trim().slice(0, 200),
      result,
    };
  }

  private async openResult(result: SearchResult, folder: vscode.WorkspaceFolder): Promise<void> {
    const uri = vscode.Uri.joinPath(folder.uri, result.file_path);
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc);
    const line = Math.max(0, result.start_line - 1);
    const range = new vscode.Range(line, 0, line, 0);
    editor.selection = new vscode.Selection(range.start, range.start);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
  }
}
