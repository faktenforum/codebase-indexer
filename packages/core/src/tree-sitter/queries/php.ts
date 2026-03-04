/**
 * Tree-sitter query patterns for PHP.
 * Captures functions, methods, classes, interfaces, traits, and enums.
 */
const phpQuery = `
(function_definition name: (name) @name) @php.function
(method_declaration name: (name) @name) @php.method
(class_declaration name: (name) @name) @php.class
(interface_declaration name: (name) @name) @php.interface
(trait_declaration name: (name) @name) @php.trait
(enum_declaration name: (name) @name) @php.enum
`;

export default phpQuery;
