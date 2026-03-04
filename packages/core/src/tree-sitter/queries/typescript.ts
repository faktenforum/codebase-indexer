// Portions of this query are adapted from Kilo Code
// (kilocode/src/services/tree-sitter/queries/typescript.ts),
// licensed under the Apache License, Version 2.0.
// See the upstream LICENSE for full terms.
//
// Only top-level semantic declarations are captured to produce
// meaningful, self-contained chunks. Sub-expressions (arrow
// callbacks, switch cases, class fields) are intentionally
// excluded — they will be included in their parent chunk or
// handled by gap-filling.
export default `
; Top-level and exported function declarations
(function_declaration
  name: (identifier) @name.definition.function) @definition.function

; Class declarations (including abstract)
(class_declaration
  name: (type_identifier) @name.definition.class) @definition.class

(abstract_class_declaration
  name: (type_identifier) @name.definition.class) @definition.class

; Method definitions (inside classes)
(method_definition
  name: (property_identifier) @name.definition.method) @definition.method

; Enum declarations
(enum_declaration
  name: (identifier) @name.definition.enum) @definition.enum

; Namespace / module declarations
(internal_module
  name: (identifier) @name.definition.namespace) @definition.namespace

(module
  name: (identifier) @name.definition.module) @definition.module

; Interface declarations
(interface_declaration
  name: (type_identifier) @name.definition.interface) @definition.interface

; Type alias declarations
(type_alias_declaration
  name: (type_identifier) @name.definition.type) @definition.type

; Named arrow / function-expression assignments (const foo = () => {})
(variable_declaration
  (variable_declarator
    name: (identifier) @name.definition.function
    value: [(arrow_function) (function_expression)])) @definition.function

(lexical_declaration
  (variable_declarator
    name: (identifier) @name.definition.function
    value: [(arrow_function) (function_expression)])) @definition.function

; Decorated class exports
(export_statement
  decorator: (decorator
    (call_expression
      function: (identifier) @name.definition.decorator))
  declaration: (class_declaration
    name: (type_identifier) @name.definition.decorated_class)) @definition.decorated_class
`;
