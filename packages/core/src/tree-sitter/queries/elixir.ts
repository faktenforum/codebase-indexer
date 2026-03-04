/**
 * Tree-sitter query patterns for Elixir.
 * Captures module definitions and function definitions.
 *
 * Note: Uses #any-of? predicates which require web-tree-sitter support.
 * If predicates are not supported, these patterns will silently not match
 * and the file will fall back to line-based chunking.
 */
const elixirQuery = `
(call
  target: (identifier) @_keyword
  (arguments (alias) @name)
  (#any-of? @_keyword "defmodule" "defprotocol")) @elixir.module

(call
  target: (identifier) @_keyword
  (arguments
    [
      (identifier) @name
      (call target: (identifier) @name)
      (binary_operator
        left: (call target: (identifier) @name)
        operator: "when")
    ])
  (#any-of? @_keyword "def" "defp" "defdelegate" "defguard" "defguardp" "defmacro" "defmacrop")) @elixir.function
`;

export default elixirQuery;
