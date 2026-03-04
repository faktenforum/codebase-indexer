/**
 * Tree-sitter query patterns for Scala.
 * Captures packages, traits, classes, objects, enums, functions, and type definitions.
 */
const scalaQuery = `
(package_clause name: (package_identifier) @name) @scala.package
(trait_definition name: (identifier) @name) @scala.interface
(class_definition name: (identifier) @name) @scala.class
(object_definition name: (identifier) @name) @scala.object
(enum_definition name: (identifier) @name) @scala.enum
(function_definition name: (identifier) @name) @scala.function
(type_definition name: (type_identifier) @name) @scala.type
`;

export default scalaQuery;
