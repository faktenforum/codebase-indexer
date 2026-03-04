/**
 * Tree-sitter query patterns for Swift.
 * Captures functions, classes, structs, protocols, enums, and extensions.
 */
const swiftQuery = `
(function_declaration name: (simple_identifier) @name) @swift.function
(class_declaration name: (type_identifier) @name) @swift.class
(struct_declaration name: (type_identifier) @name) @swift.struct
(protocol_declaration name: (type_identifier) @name) @swift.protocol
(enum_declaration name: (type_identifier) @name) @swift.enum
(extension_declaration) @swift.extension
`;

export default swiftQuery;
