# codebase-indexer

Semantic code search engine that understands your codebase. Uses Tree-sitter for AST-aware chunking, vector embeddings for semantic similarity, and LanceDB for blazing-fast retrieval.

## Features

- **AST-aware chunking** — Splits code along semantic boundaries (functions, classes, modules) instead of arbitrary line counts
- **Hybrid search** — Combines vector similarity with keyword matching for accurate results
- **30+ languages** — Full Tree-sitter support for popular languages, line-based fallback for the rest
- **Incremental indexing** — Only re-indexes changed files using content hashing
- **Multiple embedding providers** — OpenRouter, Scaleway, or any OpenAI-compatible API
- **Monorepo support** — Respects `.gitignore` and skips common build artifacts

## Supported Languages

### AST-aware chunking (Tree-sitter)

Languages with full AST parsing — code is split along semantic boundaries like functions, classes, and modules.

| Language | Extensions |
|----------|-----------|
| TypeScript | `.ts`, `.tsx`, `.mts`, `.cts` |
| JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs` |
| Python | `.py` |
| Rust | `.rs` |
| Go | `.go` |
| C / C++ | `.c`, `.h`, `.cpp`, `.hpp` |
| Java | `.java` |
| Kotlin | `.kt` |
| Ruby | `.rb` |
| PHP | `.php` |
| Swift | `.swift` |
| C# | `.cs` |
| Scala | `.scala` |
| Lua | `.lua` |
| Zig | `.zig` |
| Elixir | `.ex`, `.exs` |
| Bash | `.sh`, `.bash`, `.zsh` |
| SQL | `.sql` |
| Vala | `.vala`, `.vapi` |
| HTML | `.html` |
| CSS | `.css` |
| Vue | `.vue` |
| Svelte | `.svelte` |
| JSON | `.json` |
| Markdown | `.md`, `.markdown` |
| TOML | `.toml` |
| YAML | `.yaml`, `.yml` |

### Line-based chunking (fallback)

These file types are indexed using line-based splitting.

| Type | Extensions / Files |
|------|-------------------|
| GraphQL | `.graphql` |
| Special files | `Dockerfile`, `Makefile`, `Vagrantfile`, `Gemfile`, `Rakefile`, `.env.example` |

## Packages

| Package | Description |
|---------|-------------|
| `@codebase-indexer/core` | Core indexing engine — usable as standalone NPM package |
| `@codebase-indexer/vscode` | VS Code extension with sidebar search |
| `@codebase-indexer/web` | Nuxt 4 web dashboard |

## Quick Start

```bash
pnpm install
pnpm build
```

## Usage

### As NPM Package

```typescript
import { CodeIndexer } from '@codebase-indexer/core';

const indexer = new CodeIndexer({
  embedding: {
    apiKey: 'your-api-key',
    provider: 'openrouter',
    model: 'openai/text-embedding-3-small',
  },
});

await indexer.indexWorkspace('/path/to/workspace');
const results = await indexer.searchWorkspace('/path/to/workspace', 'authentication logic');
```

### From Environment Variables

```typescript
import { createFromEnv } from '@codebase-indexer/core';

const indexer = createFromEnv();
```

### Web UI

```bash
CODE_INDEX_EMBEDDING_API_KEY=your-key pnpm dev:web
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `CODE_INDEX_EMBEDDING_API_KEY` | Embedding API key (required) | — |
| `CODE_INDEX_EMBEDDING_PROVIDER` | Provider: `openrouter`, `scaleway` | `openrouter` |
| `CODE_INDEX_EMBEDDING_MODEL` | Model name | `openai/text-embedding-3-small` |
| `CODE_INDEX_EMBEDDING_BASE_URL` | Custom API base URL | — |
| `CODE_INDEX_EMBEDDING_DIMENSIONS` | Vector dimensions | `1536` |
| `CODE_INDEX_ENABLED` | Set to `false` to disable | `true` |

## Architecture

```
workspace files
      │
      ▼
  File Scanner ──── .gitignore filtering
      │
      ▼
  Chunking Service
      ├── Tree-sitter AST parsing (28 languages)
      └── Line-based fallback
      │
      ▼
  Embedding Service ──── OpenAI-compatible API
      │
      ▼
  LanceDB ──── Vector storage + hybrid search
```

## Requirements

- Node.js >= 22.0.0
- pnpm
