import * as vscode from 'vscode';
import { logError } from './logger';

/**
 * Returns the first workspace folder, or undefined if none is open.
 * Shows an error message and logs when no folder is available.
 */
export function getWorkspaceFolder(context?: string): vscode.WorkspaceFolder | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showErrorMessage('No workspace folder open.');
    logError(`${context ?? 'Command'}: no workspace folder open`);
    return undefined;
  }
  return folders[0]!;
}
