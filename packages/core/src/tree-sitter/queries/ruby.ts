/**
 * Tree-sitter query patterns for Ruby.
 * Captures methods, classes, and modules.
 */
const rubyQuery = `
(method name: (identifier) @name) @ruby.method
(singleton_method name: (identifier) @name) @ruby.method
(class name: (constant) @name) @ruby.class
(module name: (constant) @name) @ruby.module
`;

export default rubyQuery;
