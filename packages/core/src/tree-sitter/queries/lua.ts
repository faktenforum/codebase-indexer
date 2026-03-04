/**
 * Tree-sitter query patterns for Lua.
 * Captures function declarations and method definitions.
 */
const luaQuery = `
(function_declaration name: (identifier) @name) @lua.function
(function_declaration name: (dot_index_expression field: (identifier) @name)) @lua.function
(function_declaration name: (method_index_expression method: (identifier) @name)) @lua.method
(assignment_statement (variable_list name: (identifier) @name) (expression_list value: (function_definition))) @lua.function
`;

export default luaQuery;
