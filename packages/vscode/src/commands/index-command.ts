import * as vscode from 'vscode';
import type { CodeIndexer } from '@codebase-indexer/core';
import { log, logError } from '../logger';
import { getWorkspaceFolder } from '../utils';

export class IndexCommand {
  private indexer: CodeIndexer;
  private isIndexing = false;

  constructor(indexer: CodeIndexer) {
    this.indexer = indexer;
  }

  setIndexer(indexer: CodeIndexer): void {
    this.indexer = indexer;
  }

  async execute(): Promise<void> {
    if (this.isIndexing) {
      vscode.window.showWarningMessage('Indexing is already in progress.');
      log('Index requested but already in progress.');
      return;
    }

    const firstFolder = getWorkspaceFolder('Index');
    if (!firstFolder) return;

    const folders = vscode.workspace.workspaceFolders!;
    const folder = folders.length === 1
      ? firstFolder
      : await vscode.window.showWorkspaceFolderPick({ placeHolder: 'Select workspace to index' });

    if (!folder) return;

    if (!this.indexer.isEnabled()) {
      vscode.window.showErrorMessage('Codebase Indexer: Please configure an embedding API key in settings.');
      logError('Indexer not enabled — missing API key');
      return;
    }

    log(`Starting indexing: ${folder.uri.fsPath}`);
    this.isIndexing = true;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Codebase Indexer',
        cancellable: false,
      },
      async (progress) => {
        const progressCallback = (state: { message: string; files_processed: number; files_total: number }) => {
          const pct = state.files_total > 0 ? (state.files_processed / state.files_total) * 100 : 0;
          progress.report({
            message: state.message,
            increment: pct,
          });
          log(`Progress: ${state.files_processed}/${state.files_total} — ${state.message}`);
        };

        this.indexer.onProgress(progressCallback);
        try {
          progress.report({ message: 'Starting indexing...' });
          const result = await this.indexer.indexWorkspace(folder.uri.fsPath, { force: true });

          if (result.status === 'indexed') {
            log(`Indexing complete: ${result.files_total} files`);
            vscode.window.showInformationMessage(
              `Codebase indexed: ${result.files_total} files processed.`,
            );
          } else if (result.status === 'error') {
            logError(`Indexing failed: ${result.message}`);
            vscode.window.showErrorMessage(`Indexing failed: ${result.message}`);
          }
        } catch (err) {
          logError('Indexing threw an exception', err);
        } finally {
          this.indexer.offProgress(progressCallback);
          this.isIndexing = false;
        }
      },
    );
  }
}
