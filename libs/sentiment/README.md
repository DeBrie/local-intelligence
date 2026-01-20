# @local-intelligence/sentiment

On-device sentiment analysis for React Native using DistilBERT-SST2 ONNX model. Privacy-first, no cloud dependencies.

## Installation

```bash
npm install @local-intelligence/sentiment @local-intelligence/core
```

## Features

- **On-device inference** - All processing happens locally
- **DistilBERT-SST2** - Production-grade sentiment classification
- **Batch analysis** - Analyze multiple texts efficiently
- **Caching** - Built-in result caching with LRU eviction

## Usage

```typescript
import { initialize, downloadModel, waitForModel, analyze, destroy } from '@local-intelligence/sentiment';

// Initialize
await initialize();

// Download and load model (~67MB)
await downloadModel((progress) => console.log(`${progress}%`));
await waitForModel();

// Analyze sentiment
const result = await analyze('I love this product!');
console.log(result.label); // 'positive'
console.log(result.confidence); // 0.95
console.log(result.scores); // { positive: 0.95, negative: 0.03, neutral: 0.02 }

// Cleanup
destroy();
```

## API

| Function                     | Description                |
| ---------------------------- | -------------------------- |
| `initialize(config?)`        | Initialize the module      |
| `downloadModel(onProgress?)` | Download the ONNX model    |
| `waitForModel(timeout?)`     | Wait for model to be ready |
| `analyze(text)`              | Analyze single text        |
| `analyzeBatch(texts)`        | Analyze multiple texts     |
| `getStats()`                 | Get analysis statistics    |
| `destroy()`                  | Cleanup subscriptions      |

## Platform Support

| Platform | Minimum Version |
| -------- | --------------- |
| iOS      | 15.0            |
| Android  | API 24          |

## License

MIT
