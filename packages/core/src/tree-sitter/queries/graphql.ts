/**
 * Tree-sitter query patterns for GraphQL.
 * Captures type definitions, operations, fragments, and directives.
 */
const graphqlQuery = `
(object_type_definition (name) @name.type) @definition.type
(interface_type_definition (name) @name.type) @definition.interface
(union_type_definition (name) @name.type) @definition.type
(enum_type_definition (name) @name.type) @definition.enum
(input_object_type_definition (name) @name.type) @definition.type
(scalar_type_definition (name) @name.type) @definition.type
(directive_definition (name) @name.type) @definition.type
(operation_definition (operation_type) @name.function) @definition.function
(fragment_definition (fragment_name) @name.function) @definition.function
(schema_definition) @definition.module
(object_type_extension (name) @name.type) @definition.type
(interface_type_extension (name) @name.type) @definition.interface
(union_type_extension (name) @name.type) @definition.type
(enum_type_extension (name) @name.type) @definition.type
(input_object_type_extension (name) @name.type) @definition.type
`;

export default graphqlQuery;
