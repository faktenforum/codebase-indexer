import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel | undefined;

export function initLogger(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Codebase Indexer');
  }
  return outputChannel;
}

export function getLogger(): vscode.OutputChannel {
  if (!outputChannel) {
    return initLogger();
  }
  return outputChannel;
}

export function log(message: string): void {
  const timestamp = new Date().toISOString();
  getLogger().appendLine(`[${timestamp}] ${message}`);
}

export function logError(message: string, error?: unknown): void {
  const errMsg = error instanceof Error ? error.message : String(error ?? '');
  const timestamp = new Date().toISOString();
  getLogger().appendLine(`[${timestamp}] ERROR: ${message}${errMsg ? ` — ${errMsg}` : ''}`);
}
