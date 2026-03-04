/**
 * Tree-sitter query patterns for Vue Single File Components.
 * Captures the top-level SFC blocks: script, template, and style.
 */
const vueQuery = `
(script_element) @vue.module
(template_element) @vue.module
(style_element) @vue.module
`;

export default vueQuery;
