/**
 * Tree-sitter query patterns for Vala.
 * Captures classes, interfaces, structs, enums, error domains, namespaces,
 * methods, creation methods, delegates, signals, and properties.
 */
const valaQuery = `
(class_declaration (symbol) @name) @vala.class
(interface_declaration (symbol) @name) @vala.interface
(struct_declaration (symbol) @name) @vala.struct
(enum_declaration (symbol) @name) @vala.enum
(errordomain_declaration (symbol) @name) @vala.enum
(namespace_declaration (symbol) @name) @vala.namespace
(method_declaration (symbol) @name) @vala.method
(creation_method_declaration (symbol) @name) @vala.method
(delegate_declaration (symbol) @name) @vala.type
(signal_declaration (symbol) @name) @vala.method
(property_declaration (symbol) @name) @vala.method
(constructor_declaration) @vala.method
(destructor_declaration) @vala.method
(local_function_declaration (identifier) @name) @vala.function
`;

export default valaQuery;
