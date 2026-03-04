import * as vscode from 'vscode';
import type { CodeIndexer } from '@codebase-indexer/core';
import type { SearchCommand } from '../commands/search-command';
import type { IndexCommand } from '../commands/index-command';
import { log, logError } from '../logger';

export class SearchViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'codebaseIndexer.searchView';

  private view?: vscode.WebviewView;
  private indexer: CodeIndexer;
  private searchCommand: SearchCommand;
  private indexCommand: IndexCommand;

  constructor(
    private readonly extensionUri: vscode.Uri,
    indexer: CodeIndexer,
    searchCommand: SearchCommand,
    indexCommand: IndexCommand,
  ) {
    this.indexer = indexer;
    this.searchCommand = searchCommand;
    this.indexCommand = indexCommand;
  }

  setIndexer(indexer: CodeIndexer): void {
    this.indexer = indexer;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtmlContent(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      log(`Webview message: ${message.command}`);
      switch (message.command) {
        case 'search': {
          try {
            const results = await this.searchCommand.executeForWebview(
              message.query,
              message.limit || 20,
            );
            webviewView.webview.postMessage({
              command: 'showResults',
              results,
              query: message.query,
            });
          } catch (err) {
            logError('Webview search error', err);
          }
          break;
        }
        case 'index': {
          try {
            await this.indexCommand.execute();
            webviewView.webview.postMessage({ command: 'indexComplete' });
          } catch (err) {
            logError('Webview index error', err);
          }
          break;
        }
        case 'checkIndex': {
          const folders = vscode.workspace.workspaceFolders;
          if (folders && folders.length > 0) {
            try {
              const hasIdx = await this.indexer.hasIndex(folders[0]!.uri.fsPath);
              log(`Index status: hasIndex=${hasIdx}, isConfigured=${this.indexer.isEnabled()}`);
              webviewView.webview.postMessage({
                command: 'updateIndexStatus',
                hasIndex: hasIdx,
                isConfigured: this.indexer.isEnabled(),
              });
            } catch (err) {
              logError('checkIndex failed', err);
            }
          } else {
            log('checkIndex: no workspace folders');
          }
          break;
        }
        case 'openFile': {
          const folders = vscode.workspace.workspaceFolders;
          if (!folders || folders.length === 0) break;
          log(`Opening file: ${message.filePath}:${message.startLine}`);
          const uri = vscode.Uri.joinPath(folders[0]!.uri, message.filePath);
          const doc = await vscode.workspace.openTextDocument(uri);
          const editor = await vscode.window.showTextDocument(doc);
          const line = Math.max(0, (message.startLine || 1) - 1);
          const range = new vscode.Range(line, 0, line, 0);
          editor.selection = new vscode.Selection(range.start, range.start);
          editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
          break;
        }
      }
    });
  }

  private getHtmlContent(webview: vscode.Webview): string {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Codebase Indexer</title>
  <style>
    body {
      padding: 8px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
    }
    .search-container { margin-bottom: 12px; }
    input[type="text"] {
      width: 100%;
      box-sizing: border-box;
      padding: 6px 8px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 2px;
      outline: none;
    }
    input[type="text"]:focus {
      border-color: var(--vscode-focusBorder);
    }
    button {
      width: 100%;
      padding: 6px;
      margin-top: 8px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 2px;
      cursor: pointer;
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .status {
      padding: 8px 0;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
    .result-item {
      padding: 8px;
      margin: 4px 0;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      cursor: pointer;
    }
    .result-item:hover {
      border-color: var(--vscode-focusBorder);
    }
    .result-file {
      font-weight: bold;
      font-size: 12px;
      color: var(--vscode-textLink-foreground);
    }
    .result-lines {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
    .result-preview {
      font-size: 11px;
      font-family: var(--vscode-editor-font-family);
      margin-top: 4px;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 60px;
      overflow: hidden;
      opacity: 0.8;
    }
    .result-score {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      float: right;
    }
    .empty {
      text-align: center;
      padding: 20px;
      color: var(--vscode-descriptionForeground);
    }
    #results { margin-top: 8px; }
  </style>
</head>
<body>
  <div class="search-container">
    <input type="text" id="searchInput" placeholder="Semantic code search..." />
    <button id="searchBtn">Search</button>
    <button id="indexBtn" class="secondary">Index Workspace</button>
  </div>
  <div id="status" class="status">Checking index status...</div>
  <div id="results"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const indexBtn = document.getElementById('indexBtn');
    const statusEl = document.getElementById('status');
    const resultsEl = document.getElementById('results');

    // Check index status on load
    vscode.postMessage({ command: 'checkIndex' });

    searchBtn.addEventListener('click', () => {
      const query = searchInput.value.trim();
      if (!query) return;
      statusEl.textContent = 'Searching...';
      resultsEl.innerHTML = '';
      vscode.postMessage({ command: 'search', query, limit: 20 });
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') searchBtn.click();
    });

    indexBtn.addEventListener('click', () => {
      statusEl.textContent = 'Indexing...';
      vscode.postMessage({ command: 'index' });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      switch (msg.command) {
        case 'showResults':
          showResults(msg.results, msg.query);
          break;
        case 'updateIndexStatus':
          if (!msg.isConfigured) {
            statusEl.textContent = 'Please configure embedding API key in settings.';
          } else if (msg.hasIndex) {
            statusEl.textContent = 'Index ready. Search your codebase.';
          } else {
            statusEl.textContent = 'No index found. Click "Index Workspace" to start.';
          }
          break;
        case 'indexComplete':
          statusEl.textContent = 'Indexing complete!';
          vscode.postMessage({ command: 'checkIndex' });
          break;
      }
    });

    function showResults(results, query) {
      if (!results || results.length === 0) {
        statusEl.textContent = 'No results found.';
        resultsEl.innerHTML = '<div class="empty">No matching code found.</div>';
        return;
      }
      statusEl.textContent = results.length + ' results for "' + query + '"';
      resultsEl.innerHTML = results.map((r) => {
        const preview = (r.code_chunk || '').trim().slice(0, 150);
        return '<div class="result-item" data-file="' + escapeHtml(r.file_path) + '" data-line="' + r.start_line + '">' +
          '<span class="result-score">' + r.score.toFixed(3) + '</span>' +
          '<div class="result-file">' + escapeHtml(r.file_path) + '</div>' +
          '<div class="result-lines">Lines ' + r.start_line + '-' + r.end_line + '</div>' +
          '<div class="result-preview">' + escapeHtml(preview) + '</div>' +
          '</div>';
      }).join('');

      resultsEl.querySelectorAll('.result-item').forEach((el) => {
        el.addEventListener('click', () => {
          const folders = [];
          vscode.postMessage({
            command: 'openFile',
            filePath: el.dataset.file,
            startLine: parseInt(el.dataset.line, 10),
          });
        });
      });
    }

    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
