// This loader is inspired by Kilo Code's tree-sitter language loader
// (kilocode/src/services/tree-sitter/languageParser.ts),
// licensed under the Apache License, Version 2.0.
// See the upstream LICENSE for full terms.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Parser as ParserT, Language as LanguageT, Query as QueryT } from 'web-tree-sitter';
import { LANGUAGE_REGISTRY, EXTENSION_ALIASES } from './language-registry.js';

const __dirname = import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

export interface LanguageParser {
  [key: string]: {
    parser: ParserT;
    query: QueryT;
  };
}

let isParserInitialized = false;
let parserInitFailed = false;
const languageCache = new Map<string, LanguageT>();
const failedLanguages = new Set<string>();
const parserCache = new Map<string, { parser: ParserT; query: QueryT }>();

// Directory containing custom-built WASM files (e.g. for Vala, SQL)
const customWasmDir = path.resolve(__dirname, '../../wasm');

async function loadLanguage(langName: string, customWasmPath?: string): Promise<LanguageT> {
  if (failedLanguages.has(langName)) {
    throw new Error(`Language ${langName} previously failed to load`);
  }
  const cached = languageCache.get(langName);
  if (cached) return cached;

  let wasmPath: string;
  if (customWasmPath) {
    wasmPath = customWasmPath;
  } else {
    const wasmPackagePath = require.resolve('tree-sitter-wasms/package.json');
    const wasmDir = path.join(path.dirname(wasmPackagePath), 'out');
    wasmPath = path.join(wasmDir, `tree-sitter-${langName}.wasm`);
  }

  try {
    const { Language } = require('web-tree-sitter') as typeof import('web-tree-sitter');
    const language = await (Language as unknown as typeof LanguageT).load(wasmPath);
    languageCache.set(langName, language);
    return language;
  } catch (error) {
    failedLanguages.add(langName);
    console.error(
      `Error loading language WASM at ${wasmPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    throw error;
  }
}

function resolveWasmPath(entry: { wasmName: string; wasmPath?: 'custom' | 'svelte' }): string | undefined {
  if (entry.wasmPath === 'custom') {
    return path.join(customWasmDir, `tree-sitter-${entry.wasmName}.wasm`);
  }
  if (entry.wasmPath === 'svelte') {
    return path.join(
      path.dirname(require.resolve('tree-sitter-svelte/package.json')),
      'tree-sitter-svelte.wasm',
    );
  }
  return undefined;
}

/**
 * Load tree-sitter parsers for the given files.
 * Returns a map keyed by normalized file extension (without dot).
 */
export async function loadRequiredLanguageParsers(filesToParse: string[]): Promise<LanguageParser> {
  const { Parser, Query } = require('web-tree-sitter') as typeof import('web-tree-sitter');

  if (parserInitFailed) {
    throw new Error('tree-sitter Parser.init() previously failed');
  }

  if (!isParserInitialized) {
    try {
      await Parser.init();
      isParserInitialized = true;
    } catch (error) {
      parserInitFailed = true;
      console.error(
        `Error initializing tree-sitter parser: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }

  const extensionsToLoad = new Set(
    filesToParse.map((file) => path.extname(file).toLowerCase().slice(1)),
  );

  const parsers: LanguageParser = {};

  for (const ext of extensionsToLoad) {
    const normalizedExt = EXTENSION_ALIASES[ext] ?? ext;
    const parserKey = normalizedExt;

    // Return cached parser if already loaded
    const cached = parserCache.get(parserKey);
    if (cached) {
      parsers[parserKey] = cached;
      continue;
    }

    const registryEntry = LANGUAGE_REGISTRY[normalizedExt];
    if (!registryEntry) continue;

    try {
      const wasmPath = resolveWasmPath(registryEntry);
      const language = await loadLanguage(registryEntry.wasmName, wasmPath);
      const query = new Query(language, registryEntry.query);
      const parser = new Parser();
      parser.setLanguage(language);
      const entry = { parser, query };
      parserCache.set(parserKey, entry);
      parsers[parserKey] = entry;
    } catch {
      // Language failed to load — skip silently (logged in loadLanguage)
    }
  }

  return parsers;
}
