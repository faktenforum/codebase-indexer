/**
 * Tree-sitter query patterns for Bash/Shell scripts.
 * Captures function definitions.
 */
const bashQuery = `
(function_definition name: (word) @name) @bash.function
`;

export default bashQuery;
