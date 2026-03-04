// Data-driven language configuration for tree-sitter parsers.
// Each entry maps a normalized file extension to its WASM name and query.
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
import bashQuery from './queries/bash.js';
import scalaQuery from './queries/scala.js';
import luaQuery from './queries/lua.js';
import zigQuery from './queries/zig.js';
import tomlQuery from './queries/toml.js';
import yamlQuery from './queries/yaml.js';
import elixirQuery from './queries/elixir.js';
import sqlQuery from './queries/sql.js';
import graphqlQuery from './queries/graphql.js';

/**
 * Maps extension aliases to their normalized form.
 */
export const EXTENSION_ALIASES: Record<string, string> = {
  mjs: 'js',
  cjs: 'js',
  mts: 'ts',
  cts: 'ts',
  bash: 'sh',
  zsh: 'sh',
  exs: 'ex',
  yml: 'yaml',
};

export interface LanguageRegistryEntry {
  wasmName: string;
  query: string;
  /** 'custom' = wasm from packages/core/wasm/, 'svelte' = from tree-sitter-svelte npm */
  wasmPath?: 'custom' | 'svelte';
}

/**
 * Registry mapping normalized file extensions to tree-sitter configuration.
 * Extensions that share a parser (e.g. js/jsx/json) each get their own entry
 * so the lookup remains a simple map access.
 */
export const LANGUAGE_REGISTRY: Record<string, LanguageRegistryEntry> = {
  js:       { wasmName: 'javascript',  query: javascriptQuery },
  jsx:      { wasmName: 'javascript',  query: javascriptQuery },
  json:     { wasmName: 'json',        query: javascriptQuery },
  ts:       { wasmName: 'typescript',  query: typescriptQuery },
  tsx:      { wasmName: 'tsx',         query: tsxQuery },
  md:       { wasmName: 'markdown',    query: markdownQuery },
  markdown: { wasmName: 'markdown',    query: markdownQuery },
  html:     { wasmName: 'html',        query: htmlQuery },
  htm:      { wasmName: 'html',        query: htmlQuery },
  css:      { wasmName: 'css',         query: cssQuery },
  py:       { wasmName: 'python',      query: pythonQuery },
  java:     { wasmName: 'java',        query: javaQuery },
  rs:       { wasmName: 'rust',        query: rustQuery },
  c:        { wasmName: 'c',           query: cQuery },
  h:        { wasmName: 'c',           query: cQuery },
  cpp:      { wasmName: 'cpp',         query: cppQuery },
  hpp:      { wasmName: 'cpp',         query: cppQuery },
  go:       { wasmName: 'go',          query: goQuery },
  kt:       { wasmName: 'kotlin',      query: kotlinQuery },
  rb:       { wasmName: 'ruby',        query: rubyQuery },
  php:      { wasmName: 'php',         query: phpQuery },
  swift:    { wasmName: 'swift',       query: swiftQuery },
  cs:       { wasmName: 'c_sharp',     query: csharpQuery },
  vue:      { wasmName: 'vue',         query: vueQuery },
  vala:     { wasmName: 'vala',        query: valaQuery,   wasmPath: 'custom' },
  vapi:     { wasmName: 'vala',        query: valaQuery,   wasmPath: 'custom' },
  svelte:   { wasmName: 'svelte',      query: svelteQuery, wasmPath: 'svelte' },
  sh:       { wasmName: 'bash',        query: bashQuery },
  scala:    { wasmName: 'scala',       query: scalaQuery },
  lua:      { wasmName: 'lua',         query: luaQuery },
  zig:      { wasmName: 'zig',         query: zigQuery },
  toml:     { wasmName: 'toml',        query: tomlQuery },
  yaml:     { wasmName: 'yaml',        query: yamlQuery },
  ex:       { wasmName: 'elixir',      query: elixirQuery },
  sql:      { wasmName: 'sql',     query: sqlQuery,     wasmPath: 'custom' },
  graphql:  { wasmName: 'graphql', query: graphqlQuery, wasmPath: 'custom' },
};
