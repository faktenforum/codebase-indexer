import type { Node as TreeSitterNode } from 'web-tree-sitter';
import type { ChunkKind } from '../types.js';

/**
 * Information about a captured AST node including its symbol metadata.
 */
export interface CapturedNode {
  node: TreeSitterNode;
  symbol?: string;
  kind: ChunkKind;
}

/**
 * Map a tree-sitter capture name (e.g. "definition.function") to our ChunkKind.
 */
export function captureNameToKind(captureName: string): ChunkKind {
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
 */
export function extractSignature(text: string): string {
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
export function buildParentScope(node: TreeSitterNode): string {
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
 * Collect preceding comment nodes (JSDoc, line comments) that belong to
 * the given node. Walks backwards through previous siblings, skipping
 * blank lines, and collects contiguous comment blocks.
 */
export function collectPrecedingComments(node: TreeSitterNode): TreeSitterNode[] {
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
