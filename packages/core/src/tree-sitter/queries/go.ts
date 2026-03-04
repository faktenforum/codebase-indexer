/**
 * Tree-sitter query patterns for Go.
 * Captures top-level declarations: functions, methods, type declarations,
 * var/const blocks.
 */
const goQuery = `
(function_declaration name: (identifier) @name) @go.function
(method_declaration name: (field_identifier) @name) @go.method
(type_declaration (type_spec name: (type_identifier) @name)) @go.type
(var_declaration) @go.var
(const_declaration) @go.const
`;

export default goQuery;
