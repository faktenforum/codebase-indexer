/**
 * Tree-sitter query patterns for Zig.
 * Captures function prototypes and top-level declarations.
 */
const zigQuery = `
(FnProto) @zig.function
(TopLevelDecl) @zig.type
`;

export default zigQuery;
