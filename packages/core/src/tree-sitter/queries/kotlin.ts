/**
 * Tree-sitter query patterns for Kotlin.
 * Captures classes, objects, interfaces, and functions.
 */
const kotlinQuery = `
(function_declaration (simple_identifier) @name) @kotlin.function
(class_declaration (type_identifier) @name) @kotlin.class
(object_declaration (type_identifier) @name) @kotlin.object
(interface_declaration (type_identifier) @name) @kotlin.interface
(companion_object) @kotlin.companion
`;

export default kotlinQuery;
