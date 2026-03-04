/**
 * Tree-sitter query patterns for YAML.
 * Captures top-level mapping pairs as structural chunks.
 */
const yamlQuery = `
(block_mapping_pair key: (_) @name) @yaml.module
`;

export default yamlQuery;
