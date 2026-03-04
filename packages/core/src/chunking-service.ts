import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import type { CodeBlock, ChunkKind } from './types.js';
import {
  MAX_CHUNK_CHARS,
  MIN_CHUNK_CHARS,
  MIN_CHUNK_REMAINDER_CHARS,
  MAX_CHARS_TOLERANCE_FACTOR,
  MERGE_MAX_CHUNK_CHARS,
} from './constants.js';
import type { Node as TreeSitterNode } from 'web-tree-sitter';
import { loadRequiredLanguageParsers } from './tree-sitter/language-loader.js';

// The AST-based chunking flow and helpers are inspired by Kilo Code's CodeParser
// (kilocode/src/services/code-index/processors/parser.ts) and reuse the same
// min/max character heuristics. Kilo Code is licensed under the Apache License,
// Version 2.0; see the upstream LICENSE for full terms.
//
// The parent-scope context prefix and symbol metadata extraction are inspired
// by aider's TreeContext approach (aider/repomap.py) and the docs-mcp-server's
// hierarchical metadata strategy (docs-mcp-server/src/splitter/).

function detectLanguageFromPath(filePath: string): string | undefined {
  const ext = extname(filePath).toLowerCase();
  if (!ext) return undefined;
  return ext.slice(1);
}

/**
 * Create SHA-256 hash of file content for change detection.
 */
export function createFileHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

// Extensions that use AST-aware chunking (tree-sitter) before falling back to line-based chunking.
const AST_SUPPORTED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.markdown',
  '.html',
  '.htm',
  '.css',
  '.py',
  '.java',
  '.rs',
  '.c',
  '.h',
  '.cpp',
  '.hpp',
  '.go',
  '.kt',
  '.rb',
  '.php',
  '.swift',
  '.cs',
  '.vue',
  '.vala',
  '.vapi',
  '.svelte',
  '.sh',
  '.bash',
  '.zsh',
  '.scala',
  '.lua',
  '.zig',
  '.toml',
  '.yaml',
  '.yml',
  '.ex',
  '.exs',
  '.sql',
]);

function createSegmentHash(
  filePath: string,
  startLine: number,
  endLine: number,
  content: string,
): string {
  const preview = content.slice(0, 100);
  return createHash('sha256')
    .update(`${filePath}-${startLine}-${endLine}-${content.length}-${preview}`)
    .digest('hex');
}

/**
 * Map a tree-sitter capture name (e.g. "definition.function") to our ChunkKind.
 */
function captureNameToKind(captureName: string): ChunkKind {
  if (captureName.includes('function')) return 'function';
  if (captureName.includes('method')) return 'method';
  if (captureName.includes('class')) return 'class';
  if (captureName.includes('interface')) return 'interface';
  if (captureName.includes('type')) return 'type';
  if (captureName.includes('enum')) return 'enum';
  if (captureName.includes('module')) return 'module';
  if (captureName.includes('namespace')) return 'namespace';
  if (captureName.includes('struct')) return 'class';
  if (captureName.includes('trait')) return 'interface';
  if (captureName.includes('protocol')) return 'interface';
  if (captureName.includes('object')) return 'class';
  if (captureName.includes('record')) return 'class';
  if (captureName.includes('package')) return 'module';
  if (captureName.includes('decorator')) return 'decorator';
  return 'fallback';
}

/**
 * Extract the signature (first meaningful lines) of a code node.
 * For a function: `async function search(query: string, options?: SearchOptions) {`
 * For a class: `export class SearchService {`
 * Returns the signature text and number of lines it spans.
 */
function extractSignature(text: string): string {
  const lines = text.split('\n');
  let braceDepth = 0;
  let parenDepth = 0;
  const sigLines: string[] = [];

  for (const line of lines) {
    sigLines.push(line);
    for (const ch of line) {
      if (ch === '(') parenDepth++;
      if (ch === ')') parenDepth--;
      if (ch === '{') braceDepth++;
    }
    // Signature ends when we hit the opening brace at depth 1 and parens are balanced
    if (braceDepth >= 1 && parenDepth <= 0) break;
    // Safety: don't take more than 5 lines for a signature
    if (sigLines.length >= 5) break;
  }

  return sigLines.join('\n');
}

/**
 * Build a scope path like "ClassName.methodName" by walking up the AST.
 */
function buildParentScope(node: TreeSitterNode): string {
  const parts: string[] = [];
  let current = node.parent;
  while (current) {
    const type = current.type;
    if (
      type === 'class_declaration' ||
      type === 'abstract_class_declaration' ||
      type === 'class_definition' ||
      type === 'interface_declaration' ||
      type === 'enum_declaration' ||
      type === 'function_declaration' ||
      type === 'method_definition' ||
      type === 'function_definition' ||
      type === 'async_function_definition' ||
      type === 'impl_item' ||
      type === 'module' ||
      type === 'internal_module' ||
      type === 'object_declaration' ||
      type === 'companion_object' ||
      type === 'trait_declaration' ||
      type === 'namespace_declaration' ||
      type === 'struct_declaration' ||
      type === 'record_declaration' ||
      type === 'protocol_declaration' ||
      type === 'extension_declaration' ||
      type === 'singleton_class' ||
      type === 'errordomain_declaration' ||
      type === 'trait_definition' ||           // Scala
      type === 'object_definition' ||          // Scala
      type === 'package_clause'                // Scala
    ) {
      const nameNode = current.childForFieldName('name');
      if (nameNode) {
        parts.unshift(nameNode.text);
      }
    }
    current = current.parent;
  }
  return parts.join('.');
}

/**
 * Chunk a file's content into code blocks by line boundaries.
 * Oversized lines are split by character. Re-balances to avoid tiny remainder chunks.
 */
export function chunkFile(
  filePath: string,
  content: string,
  fileHash: string,
): CodeBlock[] {
  const seenSegmentHashes = new Set<string>();
  const lines = content.split('\n');
  const baseStartLine = 1;
  return chunkTextByLines(filePath, fileHash, lines, seenSegmentHashes, baseStartLine);
}

interface ChunkTextOptions {
  kind?: ChunkKind;
  symbol?: string;
  parentScope?: string;
  contextPrefix?: string;
}

function chunkTextByLines(
  filePath: string,
  fileHash: string,
  lines: string[],
  seenSegmentHashes: Set<string>,
  baseStartLine: number,
  options?: ChunkTextOptions,
): CodeBlock[] {
  const chunks: CodeBlock[] = [];
  const effectiveMaxChars = Math.floor(MAX_CHUNK_CHARS * MAX_CHARS_TOLERANCE_FACTOR);
  const prefix = options?.contextPrefix ?? '';
  const prefixLength = prefix ? prefix.length + 1 : 0; // +1 for newline separator
  const adjustedMax = effectiveMaxChars - prefixLength;
  let currentChunkLines: string[] = [];
  let currentChunkLength = 0;
  let chunkStartLineIndex = 0;
  let chunkIndex = 0;

  const finalizeChunk = (endLineIndex: number) => {
    if (currentChunkLength >= MIN_CHUNK_CHARS && currentChunkLines.length > 0) {
      const rawContent = currentChunkLines.join('\n');
      // Add context prefix to continuation sub-chunks (not the first one)
      const chunkContent = (prefix && chunkIndex > 0)
        ? `${prefix}\n${rawContent}`
        : rawContent;
      const startLine = baseStartLine + chunkStartLineIndex;
      const endLine = baseStartLine + endLineIndex;
      const segmentHash = createSegmentHash(filePath, startLine, endLine, chunkContent);

      if (!seenSegmentHashes.has(segmentHash)) {
        seenSegmentHashes.add(segmentHash);
        chunks.push({
          file_path: filePath,
          start_line: startLine,
          end_line: endLine,
          content: chunkContent,
          file_hash: fileHash,
          segment_hash: segmentHash,
          language: detectLanguageFromPath(filePath),
          kind: (prefix && chunkIndex > 0) ? 'continuation' : (options?.kind),
          symbol: options?.symbol,
          parentScope: (prefix && chunkIndex > 0)
            ? [options?.parentScope, options?.symbol].filter(Boolean).join('.')
            : options?.parentScope,
        });
      }
      chunkIndex++;
    }
    currentChunkLines = [];
    currentChunkLength = 0;
    chunkStartLineIndex = endLineIndex + 1;
  };

  const createSegmentBlock = (
    segment: string,
    originalLineNumber: number,
  ) => {
    const segmentHash = createSegmentHash(filePath, originalLineNumber, originalLineNumber, segment);

    if (!seenSegmentHashes.has(segmentHash)) {
      seenSegmentHashes.add(segmentHash);
      chunks.push({
        file_path: filePath,
        start_line: originalLineNumber,
        end_line: originalLineNumber,
        content: segment,
        file_hash: fileHash,
        segment_hash: segmentHash,
        language: detectLanguageFromPath(filePath),
        kind: options?.kind,
        symbol: options?.symbol,
        parentScope: options?.parentScope,
      });
    }
  };

  const maxForLines = adjustedMax > MIN_CHUNK_CHARS ? adjustedMax : effectiveMaxChars;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineLength = line.length + (i < lines.length - 1 ? 1 : 0);
    const originalLineNumber = baseStartLine + i;

    if (lineLength > maxForLines) {
      if (currentChunkLines.length > 0) {
        finalizeChunk(i - 1);
      }
      let remainingLineContent = line;
      while (remainingLineContent.length > 0) {
        const segment = remainingLineContent.substring(0, MAX_CHUNK_CHARS);
        remainingLineContent = remainingLineContent.substring(MAX_CHUNK_CHARS);
        createSegmentBlock(segment, originalLineNumber);
      }
      chunkStartLineIndex = i + 1;
      continue;
    }

    if (currentChunkLength > 0 && currentChunkLength + lineLength > maxForLines) {
      let remainderLength = 0;
      for (let j = i; j < lines.length; j++) {
        remainderLength += lines[j]!.length + (j < lines.length - 1 ? 1 : 0);
      }

      let splitIndex = i - 1;
      if (
        currentChunkLength >= MIN_CHUNK_CHARS &&
        remainderLength < MIN_CHUNK_REMAINDER_CHARS &&
        currentChunkLines.length > 1
      ) {
        for (let k = i - 2; k >= chunkStartLineIndex; k--) {
          const potentialChunkLines = lines.slice(chunkStartLineIndex, k + 1);
          const potentialChunkLength = potentialChunkLines.join('\n').length + 1;
          const potentialNextChunkLines = lines.slice(k + 1);
          const potentialNextChunkLength = potentialNextChunkLines.join('\n').length + 1;
          if (
            potentialChunkLength >= MIN_CHUNK_CHARS &&
            potentialNextChunkLength >= MIN_CHUNK_REMAINDER_CHARS
          ) {
            splitIndex = k;
            break;
          }
        }
      }

      finalizeChunk(splitIndex);

      if (i >= chunkStartLineIndex) {
        currentChunkLines.push(line);
        currentChunkLength += lineLength;
      } else {
        i = chunkStartLineIndex - 1;
        continue;
      }
    } else {
      currentChunkLines.push(line);
      currentChunkLength += lineLength;
    }
  }

  if (currentChunkLines.length > 0) {
    finalizeChunk(lines.length - 1);
  }

  return chunks;
}

/**
 * Information about a captured AST node including its symbol metadata.
 */
interface CapturedNode {
  node: TreeSitterNode;
  symbol?: string;
  kind: ChunkKind;
}

/**
 * Collect preceding comment nodes (JSDoc, line comments) that belong to
 * the given node. Walks backwards through previous siblings, skipping
 * blank lines, and collects contiguous comment blocks.
 */
function collectPrecedingComments(node: TreeSitterNode): TreeSitterNode[] {
  const comments: TreeSitterNode[] = [];
  let sibling = node.previousNamedSibling;

  while (sibling) {
    if (sibling.type === 'comment') {
      comments.unshift(sibling);
      sibling = sibling.previousNamedSibling;
    } else {
      break;
    }
  }

  return comments;
}

/**
 * Process AST-captured nodes into chunks with metadata.
 * When a node is too large, it splits by lines and adds a signature
 * prefix to continuation sub-chunks so they retain context.
 * Preceding JSDoc/comments are included with their node.
 */
function processAstNodes(
  captured: CapturedNode[],
  filePath: string,
  fileHash: string,
  fileContent: string,
  seenSegmentHashes: Set<string>,
): CodeBlock[] {
  const results: CodeBlock[] = [];
  const maxAllowed = Math.floor(MAX_CHUNK_CHARS * MAX_CHARS_TOLERANCE_FACTOR);
  const allLines = fileContent.split('\n');

  for (const { node, symbol, kind } of captured) {
    const parentScope = buildParentScope(node);

    // Include preceding comments (JSDoc, etc.) with this node
    const precedingComments = collectPrecedingComments(node);
    const effectiveStartRow = precedingComments.length > 0
      ? precedingComments[0]!.startPosition.row
      : node.startPosition.row;
    const effectiveStartLine = effectiveStartRow + 1;
    const endLine = node.endPosition.row + 1;

    // Build full content: comments + node
    const fullContent = allLines.slice(effectiveStartRow, node.endPosition.row + 1).join('\n');
    const length = fullContent.length;

    if (length < MIN_CHUNK_CHARS) {
      continue;
    }

    if (length > maxAllowed) {
      // Node too large — split by lines with signature prefix for continuations
      const signature = extractSignature(node.text);
      const contextPrefix = `// Context: ${parentScope ? parentScope + '.' : ''}${symbol ?? '(anonymous)'}\n${signature}`;
      const contentLines = allLines.slice(effectiveStartRow, node.endPosition.row + 1);

      const subChunks = chunkTextByLines(
        filePath,
        fileHash,
        contentLines,
        seenSegmentHashes,
        effectiveStartLine,
        {
          kind,
          symbol,
          parentScope,
          contextPrefix,
        },
      );
      results.push(...subChunks);
    } else {
      const segmentHash = createSegmentHash(filePath, effectiveStartLine, endLine, fullContent);

      if (!seenSegmentHashes.has(segmentHash)) {
        seenSegmentHashes.add(segmentHash);
        results.push({
          file_path: filePath,
          start_line: effectiveStartLine,
          end_line: endLine,
          content: fullContent,
          file_hash: fileHash,
          segment_hash: segmentHash,
          language: detectLanguageFromPath(filePath),
          kind,
          symbol,
          parentScope,
        });
      }
    }
  }

  return results;
}

/**
 * Fill gaps between AST chunks with line-based chunks.
 * This ensures imports, top-level statements, and comments are indexed.
 */
function fillGaps(
  astChunks: CodeBlock[],
  allLines: string[],
  filePath: string,
  fileHash: string,
  seenSegmentHashes: Set<string>,
): CodeBlock[] {
  if (astChunks.length === 0) return [];

  // Sort AST chunks by start line
  const sorted = [...astChunks].sort((a, b) => a.start_line - b.start_line);
  const gapChunks: CodeBlock[] = [];

  const addGap = (gapLines: string[], startLine: number) => {
    const gapText = gapLines.join('\n');
    if (gapText.length >= MIN_CHUNK_CHARS) {
      const chunks = chunkTextByLines(filePath, fileHash, gapLines, seenSegmentHashes, startLine, {
        kind: 'gap',
      });
      gapChunks.push(...chunks);
    }
  };

  // Gap before first AST chunk (e.g. imports, comments at top of file)
  if (sorted[0]!.start_line > 1) {
    addGap(allLines.slice(0, sorted[0]!.start_line - 1), 1);
  }

  // Gaps between consecutive AST chunks
  for (let i = 0; i < sorted.length - 1; i++) {
    const gapStart = sorted[i]!.end_line; // line after current chunk ends
    const gapEnd = sorted[i + 1]!.start_line - 1; // line before next chunk starts

    if (gapEnd > gapStart) {
      addGap(allLines.slice(gapStart, gapEnd), gapStart + 1);
    }
  }

  // Gap after last AST chunk (trailing code)
  const lastChunk = sorted[sorted.length - 1]!;
  if (lastChunk.end_line < allLines.length) {
    addGap(allLines.slice(lastChunk.end_line), lastChunk.end_line + 1);
  }

  return gapChunks;
}

/**
 * Greedy merge: combine adjacent small chunks into larger ones.
 * Inspired by docs-mcp-server's GreedySplitter — small chunks are
 * concatenated with their neighbors as long as combined size stays
 * within MAX_CHUNK_CHARS. Only merges chunks of the same semantic
 * level (both gap chunks, or both continuations in the same scope).
 */
function mergeSmallChunks(chunks: CodeBlock[], fileHash: string): CodeBlock[] {
  if (chunks.length <= 1) return chunks;

  const maxAllowed = Math.floor(MAX_CHUNK_CHARS * MAX_CHARS_TOLERANCE_FACTOR);
  const merged: CodeBlock[] = [];
  let current: CodeBlock | null = null;

  for (const chunk of chunks) {
    if (!current) {
      current = { ...chunk };
      continue;
    }

    const canMerge =
      // Both are small enough to consider merging
      current.content.length < MERGE_MAX_CHUNK_CHARS &&
      chunk.content.length < MERGE_MAX_CHUNK_CHARS &&
      // Combined size is within limits
      current.content.length + chunk.content.length + 1 <= maxAllowed &&
      // Same file (always true here, but defensive)
      current.file_path === chunk.file_path &&
      // Adjacent (no gap between them, or at most 1 line)
      chunk.start_line <= current.end_line + 2 &&
      // Never merge two chunks that each have their own symbol (different definitions)
      !(current.symbol && chunk.symbol && current.symbol !== chunk.symbol) &&
      // Compatible kinds: merge gaps with gaps, or symbolless chunks
      (current.kind === chunk.kind ||
        (current.kind === 'gap' && chunk.kind === 'gap') ||
        (!current.symbol && !chunk.symbol));

    if (canMerge) {
      const mergedContent: string = current.content + '\n' + chunk.content;
      const segmentHash = createSegmentHash(
        current.file_path,
        current.start_line,
        chunk.end_line,
        mergedContent,
      );
      current = {
        ...current,
        end_line: chunk.end_line,
        content: mergedContent,
        segment_hash: segmentHash,
        // Keep the more specific symbol/kind
        symbol: current.symbol || chunk.symbol,
        kind: current.kind === 'gap' && chunk.kind !== 'gap' ? chunk.kind : current.kind,
        parentScope: current.parentScope || chunk.parentScope,
      };
    } else {
      merged.push(current);
      current = { ...chunk };
    }
  }

  if (current) {
    merged.push(current);
  }

  return merged;
}

/**
 * AST-aware chunking using tree-sitter for a subset of languages,
 * with gap-filling for code between AST nodes (imports, top-level
 * statements), greedy merging of small chunks, and a guaranteed
 * fallback to line-based chunking.
 *
 * Each chunk is enriched with metadata:
 * - symbol: primary symbol name (function, class, etc.)
 * - parentScope: enclosing scope path (e.g. "ClassName.methodName")
 * - kind: semantic type of the chunk
 *
 * When large functions/classes exceed MAX_CHUNK_CHARS, sub-chunks
 * get a signature prefix so they retain context about their parent.
 */
export async function chunkFileWithAst(
  filePath: string,
  content: string,
  fileHash: string,
): Promise<CodeBlock[]> {
  const ext = extname(filePath).toLowerCase();

  if (!AST_SUPPORTED_EXTENSIONS.has(ext)) {
    return chunkFile(filePath, content, fileHash);
  }

  const seenSegmentHashes = new Set<string>();

  try {
    const parsers = await loadRequiredLanguageParsers([filePath]);
    const key = ext.slice(1);
    const language = parsers[key];
    if (!language) {
      return chunkFile(filePath, content, fileHash);
    }

    const tree = language.parser.parse(content);
    const captures = tree ? language.query.captures(tree.rootNode) : [];

    if (!captures || captures.length === 0) {
      return chunkFile(filePath, content, fileHash);
    }

    // 1. Extract captured nodes with symbol metadata
    //    Captures come in pairs: @name.definition.X (the name) and @definition.X (the full node)
    //    We want the full node captures and extract the symbol from the name captures.
    const capturedNodes: CapturedNode[] = [];
    const seenNodeIds = new Set<number>();

    for (let i = 0; i < captures.length; i++) {
      const capture = captures[i]!;
      const name = capture.name;

      // Skip @name.* captures — we only process @definition.* captures
      if (name.startsWith('name.')) continue;

      // Deduplicate by node id (same node can be captured by multiple patterns)
      const nodeId = capture.node.id;
      if (seenNodeIds.has(nodeId)) continue;
      seenNodeIds.add(nodeId);

      // Find the corresponding @name.* capture for this definition
      let symbol: string | undefined;
      for (let j = 0; j < captures.length; j++) {
        const other = captures[j]!;
        if (
          other.name.startsWith('name.') &&
          other.node.startPosition.row >= capture.node.startPosition.row &&
          other.node.endPosition.row <= capture.node.endPosition.row
        ) {
          symbol = other.node.text;
          break;
        }
      }

      capturedNodes.push({
        node: capture.node,
        symbol,
        kind: captureNameToKind(name),
      });
    }

    if (capturedNodes.length === 0) {
      return chunkFile(filePath, content, fileHash);
    }

    // 2. Filter nodes to avoid overlap:
    //    a) If a parent fits in one chunk, skip its children (parent is the chunk).
    //    b) If a parent is too large AND has children in the list, skip the parent
    //       (children become chunks, fillGaps handles code between them).
    const maxAllowed = Math.floor(MAX_CHUNK_CHARS * MAX_CHARS_TOLERANCE_FACTOR);

    const filteredNodes = capturedNodes.filter((candidate) => {
      const cStart = candidate.node.startPosition.row;
      const cEnd = candidate.node.endPosition.row;
      const cLen = candidate.node.text.length;

      // (a) Skip children whose parent fits in one chunk
      for (const other of capturedNodes) {
        if (other === candidate) continue;
        const oStart = other.node.startPosition.row;
        const oEnd = other.node.endPosition.row;

        const isContained = oStart <= cStart && oEnd >= cEnd &&
          !(oStart === cStart && oEnd === cEnd);

        if (isContained && other.node.text.length <= maxAllowed) {
          return false;
        }
      }

      // (b) Skip oversized parents that have children in the capture list
      if (cLen > maxAllowed) {
        const hasChildren = capturedNodes.some((other) => {
          if (other === candidate) return false;
          const oStart = other.node.startPosition.row;
          const oEnd = other.node.endPosition.row;
          return oStart >= cStart && oEnd <= cEnd &&
            !(oStart === cStart && oEnd === cEnd);
        });
        if (hasChildren) return false;
      }

      return true;
    });

    // 3. Process AST-captured nodes into chunks (with signature prefix for large ones)
    const astChunks = processAstNodes(filteredNodes, filePath, fileHash, content, seenSegmentHashes);

    if (astChunks.length === 0) {
      return chunkFile(filePath, content, fileHash);
    }

    // 4. Fill gaps between AST chunks (imports, comments, top-level code)
    const allLines = content.split('\n');
    const gapChunks = fillGaps(astChunks, allLines, filePath, fileHash, seenSegmentHashes);

    // 5. Combine, sort by start line, and greedy-merge small adjacent chunks
    const allChunks = [...astChunks, ...gapChunks].sort((a, b) => a.start_line - b.start_line);
    return mergeSmallChunks(allChunks, fileHash);
  } catch {
    return chunkFile(filePath, content, fileHash);
  }
}
