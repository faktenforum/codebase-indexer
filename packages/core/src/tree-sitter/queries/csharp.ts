/**
 * Tree-sitter query patterns for C#.
 * Captures methods, classes, interfaces, structs, enums, namespaces, and records.
 */
const csharpQuery = `
(method_declaration name: (identifier) @name) @csharp.method
(class_declaration name: (identifier) @name) @csharp.class
(interface_declaration name: (identifier) @name) @csharp.interface
(struct_declaration name: (identifier) @name) @csharp.struct
(enum_declaration name: (identifier) @name) @csharp.enum
(namespace_declaration name: (identifier) @name) @csharp.namespace
(record_declaration name: (identifier) @name) @csharp.record
`;

export default csharpQuery;
