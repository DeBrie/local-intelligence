import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import type {
  SentimentConfig,
  SentimentResult,
  BatchSentimentResult,
  SentimentStats,
  SentimentLabel,
} from './types';

const LINKING_ERROR =
  `The package '@local-intelligence/sentiment' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

const NativeModule = NativeModules.LocalIntelligenceSentiment;

const LocalIntelligenceSentimentModule = NativeModule
  ? NativeModule
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      },
    );

const SENTIMENT_MODEL_ID = 'distilbert-sst2';

// Encapsulated state management
class SentimentState {
  eventEmitter: NativeEventEmitter | null = null;
  isInitialized = false;
  currentConfig: SentimentConfig = {};
  modelDownloadSubscription: { remove: () => void } | null = null;
  modelReadySubscription: { remove: () => void } | null = null;

  reset(): void {
    this.cleanup();
    this.isInitialized = false;
    this.currentConfig = {};
  }

  cleanup(): void {
    this.modelDownloadSubscription?.remove();
    this.modelDownloadSubscription = null;
    this.modelReadySubscription?.remove();
    this.modelReadySubscription = null;
  }
}

const state = new SentimentState();

function getEventEmitter(): NativeEventEmitter {
  if (!state.eventEmitter) {
    state.eventEmitter = new NativeEventEmitter(
      LocalIntelligenceSentimentModule,
    );
  }
  return state.eventEmitter;
}

export async function initialize(
  config: SentimentConfig = {},
): Promise<boolean> {
  if (state.isInitialized) {
    return true;
  }

  const nativeConfig = {
    minConfidence: config.minConfidence ?? 0.5,
    defaultLabel: config.defaultLabel ?? 'neutral',
    enableCaching: config.enableCaching ?? true,
    maxCacheSize: config.maxCacheSize ?? 100,
  };

  const result = await LocalIntelligenceSentimentModule.initialize(
    JSON.stringify(nativeConfig),
  );
  if (result) {
    state.isInitialized = true;
    state.currentConfig = config;
  }
  return result;
}

/**
 * Get the current model status for the sentiment ONNX model.
 */
export async function getModelStatus(): Promise<{
  status: 'not_downloaded' | 'downloading' | 'ready' | 'not_ready';
  modelId: string;
  isModelReady: boolean;
}> {
  const resultJson = await LocalIntelligenceSentimentModule.getModelStatus();
  return JSON.parse(resultJson);
}

/**
 * Manually trigger download of the sentiment model.
 * Returns the model path if successful.
 */
export async function downloadModel(
  onProgress?: (progress: number) => void,
): Promise<string> {
  const CoreModule = NativeModules.LocalIntelligenceCore;
  if (!CoreModule) {
    throw new Error('Core module not available');
  }

  // Ensure Core module is initialized
  try {
    await CoreModule.initialize(JSON.stringify({}));
  } catch {
    // Already initialized or failed - continue anyway
  }

  let subscription: { remove: () => void } | null = null;

  if (onProgress) {
    const coreEmitter = new NativeEventEmitter(CoreModule);
    subscription = coreEmitter.addListener(
      'LocalIntelligenceDownloadProgress',
      (event: { modelId: string; progress: number }) => {
        if (event.modelId === SENTIMENT_MODEL_ID) {
          onProgress(event.progress * 100);
        }
      },
    );
  }

  try {
    const resultJson = await CoreModule.downloadModel(SENTIMENT_MODEL_ID);
    const result = JSON.parse(resultJson);

    // Notify the sentiment module that the model is ready
    if (LocalIntelligenceSentimentModule.notifyModelDownloaded) {
      LocalIntelligenceSentimentModule.notifyModelDownloaded(
        SENTIMENT_MODEL_ID,
        result.path,
      );
    }

    return result.path;
  } finally {
    subscription?.remove();
  }
}

/**
 * Wait for the model to be ready using event-based approach.
 * Returns a promise that resolves when the model is loaded.
 * @param timeoutMs Maximum time to wait (default 30 seconds)
 */
export async function waitForModel(timeoutMs = 30000): Promise<void> {
  const status = await getModelStatus();
  if (status.isModelReady) {
    return;
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      state.modelReadySubscription?.remove();
      state.modelReadySubscription = null;
      reject(new Error(`Model loading timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const emitter = getEventEmitter();
    state.modelReadySubscription = emitter.addListener('onModelReady', () => {
      clearTimeout(timeout);
      state.modelReadySubscription?.remove();
      state.modelReadySubscription = null;
      resolve();
    });
  });
}

export async function analyze(text: string): Promise<SentimentResult> {
  if (!state.isInitialized) {
    throw new Error(
      '@local-intelligence/sentiment is not initialized. Call initialize() first.',
    );
  }

  // The native module will throw if model is not ready - no silent fallback
  const resultJson = await LocalIntelligenceSentimentModule.analyze(text);
  return JSON.parse(resultJson) as SentimentResult;
}

export async function analyzeBatch(
  texts: string[],
): Promise<BatchSentimentResult> {
  if (!state.isInitialized) {
    throw new Error(
      '@local-intelligence/sentiment is not initialized. Call initialize() first.',
    );
  }

  // The native module will throw if model is not ready - no silent fallback
  const resultJson = await LocalIntelligenceSentimentModule.analyzeBatch(texts);
  return JSON.parse(resultJson) as BatchSentimentResult;
}

export async function getStats(): Promise<SentimentStats> {
  if (!state.isInitialized) {
    throw new Error(
      '@local-intelligence/sentiment is not initialized. Call initialize() first.',
    );
  }

  const resultJson = await LocalIntelligenceSentimentModule.getStats();
  return JSON.parse(resultJson) as SentimentStats;
}

export async function resetStats(): Promise<boolean> {
  if (!state.isInitialized) {
    throw new Error(
      '@local-intelligence/sentiment is not initialized. Call initialize() first.',
    );
  }

  return LocalIntelligenceSentimentModule.resetStats();
}

export async function clearCache(): Promise<boolean> {
  if (!state.isInitialized) {
    throw new Error(
      '@local-intelligence/sentiment is not initialized. Call initialize() first.',
    );
  }

  return LocalIntelligenceSentimentModule.clearCache();
}

/**
 * Clean up all subscriptions and reset state.
 * Call this when unmounting or when you want to reinitialize.
 */
export function destroy(): void {
  state.reset();
}

export type SentimentEventCallback = (result: SentimentResult) => void;

export function onAnalysis(callback: SentimentEventCallback): () => void {
  const emitter = getEventEmitter();
  const subscription = emitter.addListener('onSentimentAnalysis', (event) => {
    callback(JSON.parse(event.result));
  });

  return () => subscription.remove();
}

export function isReady(): boolean {
  return state.isInitialized;
}

export function getConfig(): SentimentConfig {
  return { ...state.currentConfig };
}

export function getLabelEmoji(label: SentimentLabel): string {
  switch (label) {
    case 'positive':
      return '😊';
    case 'negative':
      return '😞';
    case 'neutral':
      return '😐';
  }
}

export function getLabelColor(label: SentimentLabel): string {
  switch (label) {
    case 'positive':
      return '#4CAF50';
    case 'negative':
      return '#F44336';
    case 'neutral':
      return '#9E9E9E';
  }
}
