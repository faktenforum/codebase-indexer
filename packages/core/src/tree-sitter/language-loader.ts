// This loader is inspired by Kilo Code's tree-sitter language loader
// (kilocode/src/services/tree-sitter/languageParser.ts),
// licensed under the Apache License, Version 2.0.
// See the upstream LICENSE for full terms.
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Parser as ParserT, Language as LanguageT, Query as QueryT } from 'web-tree-sitter';
import javascriptQuery from './queries/javascript.js';
import typescriptQuery from './queries/typescript.js';
import tsxQuery from './queries/tsx.js';
import markdownQuery from './queries/markdown.js';
import htmlQuery from './queries/html.js';
import cssQuery from './queries/css.js';
import pythonQuery from './queries/python.js';
import javaQuery from './queries/java.js';
import rustQuery from './queries/rust.js';
import cQuery from './queries/c.js';
import cppQuery from './queries/cpp.js';
import goQuery from './queries/go.js';
import kotlinQuery from './queries/kotlin.js';
import rubyQuery from './queries/ruby.js';
import phpQuery from './queries/php.js';
import swiftQuery from './queries/swift.js';
import csharpQuery from './queries/csharp.js';
import vueQuery from './queries/vue.js';
import valaQuery from './queries/vala.js';
import svelteQuery from './queries/svelte.js';

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

// Directory containing custom-built WASM files (e.g. for Vala)
const customWasmDir = path.resolve(import.meta.dirname, '../../wasm');

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

/**
 * Load tree-sitter parsers for the given files.
 * Returns a map keyed by file extension (without dot).
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
    const normalizedExt = (() => {
      switch (ext) {
        case 'mjs':
        case 'cjs':
          return 'js';
        case 'mts':
        case 'cts':
          return 'ts';
        default:
          return ext;
      }
    })();

    const parserKey = normalizedExt;

    // Return cached parser if already loaded
    const cached = parserCache.get(parserKey);
    if (cached) {
      parsers[parserKey] = cached;
      continue;
    }

    let language: LanguageT | null = null;
    let query: QueryT | null = null;

    switch (normalizedExt) {
      case 'js':
      case 'jsx':
      case 'json': {
        language = await loadLanguage('javascript');
        query = new Query(language, javascriptQuery);
        break;
      }
      case 'ts': {
        language = await loadLanguage('typescript');
        query = new Query(language, typescriptQuery);
        break;
      }
      case 'tsx': {
        language = await loadLanguage('tsx');
        query = new Query(language, tsxQuery);
        break;
      }
      case 'md':
      case 'markdown': {
        language = await loadLanguage('markdown');
        query = new Query(language, markdownQuery);
        break;
      }
      case 'html':
      case 'htm': {
        language = await loadLanguage('html');
        query = new Query(language, htmlQuery);
        break;
      }
      case 'css': {
        language = await loadLanguage('css');
        query = new Query(language, cssQuery);
        break;
      }
      case 'py': {
        language = await loadLanguage('python');
        query = new Query(language, pythonQuery);
        break;
      }
      case 'java': {
        language = await loadLanguage('java');
        query = new Query(language, javaQuery);
        break;
      }
      case 'rs': {
        language = await loadLanguage('rust');
        query = new Query(language, rustQuery);
        break;
      }
      case 'c':
      case 'h': {
        language = await loadLanguage('c');
        query = new Query(language, cQuery);
        break;
      }
      case 'cpp':
      case 'hpp': {
        language = await loadLanguage('cpp');
        query = new Query(language, cppQuery);
        break;
      }
      case 'go': {
        language = await loadLanguage('go');
        query = new Query(language, goQuery);
        break;
      }
      case 'kt': {
        language = await loadLanguage('kotlin');
        query = new Query(language, kotlinQuery);
        break;
      }
      case 'rb': {
        language = await loadLanguage('ruby');
        query = new Query(language, rubyQuery);
        break;
      }
      case 'php': {
        language = await loadLanguage('php');
        query = new Query(language, phpQuery);
        break;
      }
      case 'swift': {
        language = await loadLanguage('swift');
        query = new Query(language, swiftQuery);
        break;
      }
      case 'cs': {
        language = await loadLanguage('c_sharp');
        query = new Query(language, csharpQuery);
        break;
      }
      case 'vue': {
        language = await loadLanguage('vue');
        query = new Query(language, vueQuery);
        break;
      }
      case 'vala':
      case 'vapi': {
        language = await loadLanguage('vala', path.join(customWasmDir, 'tree-sitter-vala.wasm'));
        query = new Query(language, valaQuery);
        break;
      }
      case 'svelte': {
        const svelteWasmPath = path.join(
          path.dirname(require.resolve('tree-sitter-svelte/package.json')),
          'tree-sitter-svelte.wasm',
        );
        language = await loadLanguage('svelte', svelteWasmPath);
        query = new Query(language, svelteQuery);
        break;
      }
      default:
        break;
    }

    if (!language || !query) continue;

    const parser = new Parser();
    parser.setLanguage(language);
    const entry = { parser, query };
    parserCache.set(parserKey, entry);
    parsers[parserKey] = entry;
  }

  return parsers;
}
