/**
 * Tree-sitter query patterns for Svelte Single File Components.
 * Captures the top-level SFC blocks: script and style.
 */
const svelteQuery = `
(script_element) @svelte.module
(style_element) @svelte.module
`;

export default svelteQuery;
