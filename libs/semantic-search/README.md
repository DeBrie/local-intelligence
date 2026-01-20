# @local-intelligence/semantic-search

On-device semantic search and text embeddings for React Native. Build vector search without cloud dependencies.

## Installation

```bash
npm install @local-intelligence/semantic-search @local-intelligence/core
```

## Features

- **On-device embeddings** - Generate vectors locally
- **Semantic search** - Find similar content by meaning
- **Index management** - Create and query vector indexes
- **iOS**: NLEmbedding (512-dim)
- **Android**: MiniLM-L6-v2 TFLite (384-dim)

## Usage

```typescript
import { initialize, createEmbedding, createIndex, addToIndex, search } from '@local-intelligence/semantic-search';

// Initialize
await initialize();

// Create embeddings
const embedding = await createEmbedding('Machine learning is fascinating');

// Build a search index
const index = await createIndex('my-docs');
await addToIndex(index, [
  { id: '1', text: 'Introduction to AI', metadata: { category: 'tech' } },
  { id: '2', text: 'Cooking recipes', metadata: { category: 'food' } },
]);

// Search by meaning
const results = await search(index, 'artificial intelligence basics');
console.log(results[0].id); // '1'
console.log(results[0].score); // 0.87
```

## API

| Function                   | Description                  |
| -------------------------- | ---------------------------- |
| `initialize()`             | Initialize the module        |
| `createEmbedding(text)`    | Generate vector embedding    |
| `createIndex(name)`        | Create a new search index    |
| `addToIndex(index, docs)`  | Add documents to index       |
| `search(index, query, k?)` | Search for similar documents |
| `deleteIndex(name)`        | Delete an index              |

## Platform Note

Embeddings are **not compatible across platforms**. Indexes built on iOS cannot be searched from Android and vice versa.

## Platform Support

| Platform | Minimum Version |
| -------- | --------------- |
| iOS      | 15.0            |
| Android  | API 24          |

## License

MIT
