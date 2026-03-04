/**
 * Tree-sitter query patterns for TOML.
 * Captures table sections and array tables as structural chunks.
 */
const tomlQuery = `
(table (bare_key) @name) @toml.module
(table (dotted_key) @name) @toml.module
(table_array_element (bare_key) @name) @toml.module
(table_array_element (dotted_key) @name) @toml.module
`;

export default tomlQuery;
