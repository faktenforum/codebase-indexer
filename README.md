# codebase-indexer

Semantic code search engine using Tree-sitter, embeddings, and LanceDB for fast codebase indexing.

## Packages

| Package | Description |
|---------|-------------|
| `@codebase-indexer/core` | Core indexing engine - NPM package |
| `@codebase-indexer/vscode` | VSCode extension with sidebar search |
| `@codebase-indexer/web` | Nuxt 4 web dashboard |

## Setup

```bash
pnpm install
pnpm build:core
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

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CODE_INDEX_EMBEDDING_API_KEY` | Embedding API key (required) | - |
| `CODE_INDEX_EMBEDDING_PROVIDER` | Provider: openrouter, scaleway | openrouter |
| `CODE_INDEX_EMBEDDING_MODEL` | Model name | openai/text-embedding-3-small |
| `CODE_INDEX_EMBEDDING_BASE_URL` | Custom API base URL | - |
| `CODE_INDEX_EMBEDDING_DIMENSIONS` | Vector dimensions | 1536 |
| `CODE_INDEX_ENABLED` | Set to 'false' to disable | true |
