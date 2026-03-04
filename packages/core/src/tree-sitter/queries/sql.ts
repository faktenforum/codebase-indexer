/**
 * Tree-sitter query patterns for SQL.
 * Captures CREATE statements for tables, views, functions, procedures,
 * triggers, indexes, types, and schemas.
 */
const sqlQuery = `
(create_table (object_reference name: (identifier) @name)) @sql.type
(create_view (object_reference name: (identifier) @name)) @sql.type
(create_materialized_view (object_reference name: (identifier) @name)) @sql.type
(create_function (function_declaration name: (object_reference name: (identifier) @name))) @sql.function
(create_procedure (function_declaration name: (object_reference name: (identifier) @name))) @sql.function
(create_index (object_reference name: (identifier) @name)) @sql.type
(create_trigger (identifier) @name) @sql.type
(create_type (object_reference name: (identifier) @name)) @sql.type
(create_schema (object_reference name: (identifier) @name)) @sql.namespace
(select) @sql.module
`;

export default sqlQuery;
