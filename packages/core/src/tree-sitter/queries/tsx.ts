// This query is adapted from Kilo Code
// (kilocode/src/services/tree-sitter/queries/tsx.ts),
// licensed under the Apache License, Version 2.0.
// See the upstream LICENSE for full terms.
//
// Extends the TypeScript query with React component patterns.
// JSX element captures are excluded — they fragment chunks.
import typescriptQuery from './typescript.js';

export default `${typescriptQuery}

; Function Components
(function_declaration
  name: (identifier) @name) @definition.component

; Arrow Function Components (const Foo = () => ...)
(variable_declaration
  (variable_declarator
    name: (identifier) @name
    value: (arrow_function))) @definition.component

; Exported Arrow Function Components
(export_statement
  (variable_declaration
    (variable_declarator
      name: (identifier) @name
      value: (arrow_function)))) @definition.component
`;
