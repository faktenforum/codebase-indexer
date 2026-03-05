/**
 * Ripgrep-based grep search with GNU grep fallback.
 */

import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
import { relative, join } from 'node:path';
import { readFile, access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import type { SearchResult } from './types.js';
import {
  SUPPORTED_EXTENSIONS,
  SUPPORTED_FILENAMES,
  DIRS_TO_IGNORE,
  FILES_TO_IGNORE,
  DEFAULT_SEARCH_LIMIT,
} from './constants.js';

// ---------- Types ----------

type SearchTool = { command: string; type: 'ripgrep' } | { command: string; type: 'grep' };

type ParsedLine =
  | { type: 'line'; filePath: string; lineNum: number; lineText: string }
  | { type: 'break' }
  | null;

// ---------- Tool resolution ----------

const execFileAsync = promisify(execFile);

async function resolveSearchTool(): Promise<SearchTool> {
  // 1. @vscode/ripgrep bundled binary
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { rgPath } = require('@vscode/ripgrep') as { rgPath: string };
    await access(rgPath, fsConstants.X_OK);
    return { command: rgPath, type: 'ripgrep' };
  } catch {
    // not available
  }

  // 2. System ripgrep
  try {
    await execFileAsync('rg', ['--version']);
    return { command: 'rg', type: 'ripgrep' };
  } catch {
    // not in PATH
  }

  // 3. GNU grep (available on virtually every Unix system)
  try {
    await execFileAsync('grep', ['--version']);
    return { command: 'grep', type: 'grep' };
  } catch {
    // not available
  }

  throw new Error('No search tool found: install ripgrep or ensure grep is in PATH');
}

let cachedToolPromise: Promise<SearchTool> | undefined;
function getSearchTool(): Promise<SearchTool> {
  if (!cachedToolPromise) cachedToolPromise = resolveSearchTool();
  return cachedToolPromise;
}

// ---------- Public API ----------

export interface GrepSearchOptions {
  workspacePath: string;
  query: string;
  pathPrefix?: string;
  limit?: number;
  contextLines?: number;
  isRegex?: boolean;
}

/**
 * Search workspace files using ripgrep or GNU grep. Works without any index.
 * Searches both file contents and file names/paths, merging results.
 */
export async function grepSearch(options: GrepSearchOptions): Promise<SearchResult[]> {
  const {
    workspacePath,
    query,
    pathPrefix,
    limit = DEFAULT_SEARCH_LIMIT,
    contextLines = 2,
    isRegex = false,
  } = options;

  if (!query.trim()) return [];

  let tool: SearchTool;
  try {
    tool = await getSearchTool();
  } catch {
    console.warn('[grepSearch] No search tool available (ripgrep or grep)');
    return [];
  }

  const searchPath = pathPrefix ? join(workspacePath, pathPrefix) : workspacePath;

  // Run content search and file name search in parallel
  const [contentResults, fileResults] = await Promise.all([
    contentGrepSearch(tool, workspacePath, searchPath, query, limit, contextLines, isRegex),
    fileNameSearch(tool, workspacePath, searchPath, query, limit),
  ]);

  // Merge: deduplicate by file_path (content matches take priority over file name matches)
  const seen = new Set(contentResults.map((r) => r.file_path));
  const merged = [...contentResults];
  for (const fr of fileResults) {
    if (!seen.has(fr.file_path)) {
      seen.add(fr.file_path);
      merged.push(fr);
    }
  }

  return merged.slice(0, limit);
}

function contentGrepSearch(
  tool: SearchTool,
  workspacePath: string,
  searchPath: string,
  query: string,
  limit: number,
  contextLines: number,
  isRegex: boolean,
): Promise<SearchResult[]> {
  if (tool.type === 'ripgrep') {
    const args = buildRgArgs(contextLines, isRegex);
    args.push('--', query, searchPath);
    return spawnGrepProcess({
      command: tool.command,
      args,
      workspacePath,
      limit,
      toolName: 'ripgrep',
      parseLine: parseRipgrepLine,
    });
  }

  const args = buildGnuGrepArgs(contextLines, isRegex);
  args.push('--', query, searchPath);
  return spawnGrepProcess({
    command: tool.command,
    args,
    workspacePath,
    limit,
    toolName: 'grep',
    parseLine: parseGnuGrepLine,
  });
}

const FILE_PREVIEW_LINES = 30;

/**
 * Search for files whose path matches the query. Returns results with
 * the first N lines of the file as code_chunk for context.
 */
async function fileNameSearch(
  tool: SearchTool,
  workspacePath: string,
  searchPath: string,
  query: string,
  limit: number,
): Promise<SearchResult[]> {
  // Phase 1: collect matching file paths from rg --files or find
  const matchedFiles = await new Promise<Array<{ absPath: string; relPath: string }>>((resolve) => {
    const args = tool.type === 'ripgrep'
      ? [...buildRgFileListArgs(), searchPath]
      : [...buildFindArgs(searchPath)];

    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(
        tool.type === 'ripgrep' ? tool.command : 'find',
        args,
        { stdio: ['ignore', 'pipe', 'ignore'] },
      );
    } catch {
      resolve([]);
      return;
    }

    const matches: Array<{ absPath: string; relPath: string }> = [];
    const queryLower = query.toLowerCase();
    const rl = createInterface({ input: proc.stdout! });

    rl.on('line', (filePath) => {
      if (matches.length >= limit) {
        rl.close();
        proc.kill();
        return;
      }

      const relPath = relative(workspacePath, filePath).replace(/\\/g, '/');
      if (!relPath.toLowerCase().includes(queryLower)) return;
      matches.push({ absPath: filePath, relPath });
    });

    rl.on('close', () => resolve(matches.slice(0, limit)));
    proc.on('error', () => resolve(matches.slice(0, limit)));
  });

  // Phase 2: read file previews asynchronously
  const results: SearchResult[] = [];
  for (const { absPath, relPath } of matchedFiles) {
    const preview = await readFilePreview(absPath, FILE_PREVIEW_LINES);
    if (preview === null) continue;
    results.push({
      file_path: relPath,
      score: 0.9,
      start_line: 1,
      end_line: Math.min(FILE_PREVIEW_LINES, preview.lineCount),
      code_chunk: preview.text,
    });
  }

  return results.slice(0, limit);
}

// ---------- Generic spawn + collect ----------

interface SpawnGrepOptions {
  command: string;
  args: string[];
  workspacePath: string;
  limit: number;
  toolName: string;
  parseLine: (line: string) => ParsedLine;
}

function spawnGrepProcess(opts: SpawnGrepOptions): Promise<SearchResult[]> {
  const { command, args, workspacePath, limit, toolName, parseLine } = opts;

  return new Promise<SearchResult[]>((resolve) => {
    const results: SearchResult[] = [];

    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      console.warn(`[grepSearch] Failed to spawn ${toolName}`);
      resolve([]);
      return;
    }

    let currentGroup: { filePath: string; lines: Map<number, string> } | null = null;

    const finalizeGroup = () => {
      if (!currentGroup || currentGroup.lines.size === 0) return;
      const lineNums = [...currentGroup.lines.keys()].sort((a, b) => a - b);
      const code = lineNums.map((n) => currentGroup!.lines.get(n)!).join('\n');
      const relPath = relative(workspacePath, currentGroup.filePath).replace(/\\/g, '/');
      results.push({
        file_path: relPath,
        score: 1.0,
        start_line: lineNums[0]!,
        end_line: lineNums[lineNums.length - 1]!,
        code_chunk: code,
      });
    };

    const rl = createInterface({ input: proc.stdout! });

    rl.on('line', (rawLine) => {
      const parsed = parseLine(rawLine);
      if (!parsed) return;

      if (parsed.type === 'break') {
        finalizeGroup();
        currentGroup = null;
        return;
      }

      const { filePath, lineNum, lineText } = parsed;
      if (
        !currentGroup ||
        currentGroup.filePath !== filePath ||
        lineNum - maxLine(currentGroup.lines) > 1
      ) {
        finalizeGroup();
        currentGroup = { filePath, lines: new Map() };
      }
      currentGroup.lines.set(lineNum, lineText);

      if (results.length >= limit) {
        rl.close();
        proc.kill();
      }
    });

    rl.on('close', () => {
      finalizeGroup();
      resolve(results.slice(0, limit));
    });

    proc.on('error', () => {
      resolve(results.slice(0, limit));
    });
  });
}

// ---------- Parse callbacks ----------

function parseRipgrepLine(line: string): ParsedLine {
  let msg: RgMessage;
  try {
    msg = JSON.parse(line);
  } catch {
    return null;
  }

  if (msg.type === 'begin' || msg.type === 'end') {
    return { type: 'break' };
  }

  if (msg.type === 'match' || msg.type === 'context') {
    return {
      type: 'line',
      filePath: msg.data.path.text,
      lineNum: msg.data.line_number,
      lineText: msg.data.lines.text.replace(/\n$/, ''),
    };
  }

  return null;
}

const GNU_GREP_LINE_RE = /^(.+?)[:\-](\d+)[:\-](.*)$/;

function parseGnuGrepLine(line: string): ParsedLine {
  if (line === '--') {
    return { type: 'break' };
  }

  const m = GNU_GREP_LINE_RE.exec(line);
  if (!m) return null;

  return {
    type: 'line',
    filePath: m[1]!,
    lineNum: parseInt(m[2]!, 10),
    lineText: m[3]!,
  };
}

// ---------- Arg builders ----------

function buildRgArgs(contextLines: number, isRegex: boolean): string[] {
  const args: string[] = [
    '--json',
    '--smart-case',
    '--context', String(contextLines),
    '--max-filesize', '1M',
  ];

  if (!isRegex) {
    args.push('--fixed-strings');
  }

  for (const ext of SUPPORTED_EXTENSIONS) {
    args.push('--glob', `*${ext}`);
  }
  for (const filename of SUPPORTED_FILENAMES) {
    args.push('--glob', filename);
  }
  for (const dir of DIRS_TO_IGNORE) {
    args.push('--glob', `!${dir}/`);
  }
  for (const file of FILES_TO_IGNORE) {
    args.push('--glob', `!${file}`);
  }

  return args;
}

function buildGnuGrepArgs(contextLines: number, isRegex: boolean): string[] {
  const args: string[] = [
    '-rn',
    '--context', String(contextLines),
  ];

  if (!isRegex) {
    args.push('--fixed-strings');
  }

  for (const ext of SUPPORTED_EXTENSIONS) {
    args.push('--include', `*${ext}`);
  }
  for (const filename of SUPPORTED_FILENAMES) {
    args.push('--include', filename);
  }
  for (const dir of DIRS_TO_IGNORE) {
    args.push('--exclude-dir', dir);
  }
  for (const file of FILES_TO_IGNORE) {
    args.push('--exclude', file);
  }

  return args;
}

// ---------- File list arg builders ----------

function buildRgFileListArgs(): string[] {
  const args: string[] = ['--files'];

  for (const ext of SUPPORTED_EXTENSIONS) {
    args.push('--glob', `*${ext}`);
  }
  for (const filename of SUPPORTED_FILENAMES) {
    args.push('--glob', filename);
  }
  for (const dir of DIRS_TO_IGNORE) {
    args.push('--glob', `!${dir}/`);
  }
  for (const file of FILES_TO_IGNORE) {
    args.push('--glob', `!${file}`);
  }

  return args;
}

function buildFindArgs(searchPath: string): string[] {
  const args: string[] = [searchPath, '-type', 'f'];

  // Exclude directories
  const dirExcludes = [...DIRS_TO_IGNORE].flatMap((dir) => ['-not', '-path', `*/${dir}/*`]);
  args.push(...dirExcludes);

  // Include only supported extensions/filenames
  const nameFilters: string[] = [];
  for (const ext of SUPPORTED_EXTENSIONS) {
    nameFilters.push('-name', `*${ext}`, '-o');
  }
  for (const filename of SUPPORTED_FILENAMES) {
    nameFilters.push('-name', filename, '-o');
  }
  // Remove trailing -o
  if (nameFilters.length > 0) {
    nameFilters.pop();
    args.push('(', ...nameFilters, ')');
  }

  return args;
}

// ---------- Helpers ----------

async function readFilePreview(filePath: string, maxLines: number): Promise<{ text: string; lineCount: number } | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const lineCount = Math.min(maxLines, lines.length);
    const text = lines.slice(0, lineCount).join('\n');
    return { text, lineCount };
  } catch {
    return null;
  }
}

function maxLine(lines: Map<number, string>): number {
  return Math.max(0, ...lines.keys());
}

interface RgMessage {
  type: 'begin' | 'match' | 'context' | 'end' | 'summary';
  data: {
    path: { text: string };
    line_number: number;
    lines: { text: string };
    submatches?: Array<{ match: { text: string }; start: number; end: number }>;
  };
}
