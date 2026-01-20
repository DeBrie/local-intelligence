# @local-intelligence/core

Core module for on-device AI in React Native. Provides model management, hardware detection, and shared utilities for all @local-intelligence packages.

## Installation

```bash
npm install @local-intelligence/core
```

## Features

- **Model Management** - Download, cache, and update ML models
- **Hardware Detection** - Detect device capabilities and acceleration support
- **Memory Management** - Automatic model unloading under memory pressure

## Usage

```typescript
import { getDeviceCapabilities, downloadModel, getModelStatus, checkForModelUpdate } from '@local-intelligence/core';

// Check device capabilities
const capabilities = await getDeviceCapabilities();
console.log(capabilities.hasNeuralEngine); // iOS Neural Engine
console.log(capabilities.hasNNAPI); // Android NNAPI

// Download a model
await downloadModel('distilbert-sst2', (progress) => {
  console.log(`${progress.progress * 100}%`);
});

// Check model status
const status = await getModelStatus('distilbert-sst2');
console.log(status.state); // 'ready' | 'downloading' | 'not_downloaded'
```

## Platform Support

| Platform | Minimum Version |
| -------- | --------------- |
| iOS      | 15.0            |
| Android  | API 24          |

## License

MIT
