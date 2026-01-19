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

let eventEmitter: NativeEventEmitter | null = null;
let isInitialized = false;
let currentConfig: SentimentConfig = {};
let modelDownloadSubscription: { remove: () => void } | null = null;

function getEventEmitter(): NativeEventEmitter {
  if (!eventEmitter) {
    eventEmitter = new NativeEventEmitter(LocalIntelligenceSentimentModule);
  }
  return eventEmitter;
}

export async function initialize(
  config: SentimentConfig = {},
): Promise<boolean> {
  if (isInitialized) {
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
    isInitialized = true;
    currentConfig = config;

    // Subscribe to model download events and trigger download if needed
    subscribeToModelDownloads();
    triggerModelDownloadIfNeeded().catch(() => {
      // Silently fail - sentiment will use fallback (NLTagger/lexicon)
    });
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

function subscribeToModelDownloads(): void {
  if (modelDownloadSubscription) {
    return;
  }

  try {
    const CoreModule = NativeModules.LocalIntelligenceCore;
    if (CoreModule) {
      const coreEmitter = new NativeEventEmitter(CoreModule);
      modelDownloadSubscription = coreEmitter.addListener(
        'LocalIntelligenceModelDownloaded',
        (event: { modelId: string; path: string }) => {
          if (event.modelId === SENTIMENT_MODEL_ID) {
            LocalIntelligenceSentimentModule.notifyModelDownloaded?.(
              event.modelId,
              event.path,
            );
          }
        },
      );
    }
  } catch {
    // Core module not available, skip subscription
  }
}

async function triggerModelDownloadIfNeeded(): Promise<void> {
  try {
    const CoreModule = NativeModules.LocalIntelligenceCore;
    if (!CoreModule) return;

    const statusJson = await CoreModule.getModelStatus(SENTIMENT_MODEL_ID);
    const status = JSON.parse(statusJson);

    if (status.state === 'ready') {
      // Model already downloaded, notify sentiment module to load it
      LocalIntelligenceSentimentModule.notifyModelDownloaded?.(
        SENTIMENT_MODEL_ID,
        status.path,
      );

      // Wait for the model to be loaded (poll with timeout)
      const maxWaitMs = 10000; // 10 seconds max
      const pollIntervalMs = 100;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitMs) {
        const modelStatusJson =
          await LocalIntelligenceSentimentModule.getModelStatus();
        const modelStatus = JSON.parse(modelStatusJson);
        if (modelStatus.isModelReady) {
          return; // Model loaded successfully
        }
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }

      // Timeout - model didn't load in time, but don't throw - it may still load
      console.warn(
        'Sentiment model loading timed out, but may still be loading in background',
      );
    } else if (status.state === 'not_downloaded') {
      // Start download in background
      CoreModule.downloadModel(SENTIMENT_MODEL_ID)
        .then((resultJson: string) => {
          const result = JSON.parse(resultJson);
          LocalIntelligenceSentimentModule.notifyModelDownloaded?.(
            SENTIMENT_MODEL_ID,
            result.path,
          );
        })
        .catch(() => {
          // Silently fail - user can manually trigger download
        });
    }
  } catch {
    // Silently fail
  }
}

export async function analyze(text: string): Promise<SentimentResult> {
  if (!isInitialized) {
    throw new Error(
      '@local-intelligence/sentiment is not initialized. Call initialize() first.',
    );
  }

  const resultJson = await LocalIntelligenceSentimentModule.analyze(text);
  return JSON.parse(resultJson) as SentimentResult;
}

export async function analyzeBatch(
  texts: string[],
): Promise<BatchSentimentResult> {
  if (!isInitialized) {
    throw new Error(
      '@local-intelligence/sentiment is not initialized. Call initialize() first.',
    );
  }

  const resultJson = await LocalIntelligenceSentimentModule.analyzeBatch(texts);
  return JSON.parse(resultJson) as BatchSentimentResult;
}

export async function getStats(): Promise<SentimentStats> {
  if (!isInitialized) {
    throw new Error(
      '@local-intelligence/sentiment is not initialized. Call initialize() first.',
    );
  }

  const resultJson = await LocalIntelligenceSentimentModule.getStats();
  return JSON.parse(resultJson) as SentimentStats;
}

export async function resetStats(): Promise<boolean> {
  if (!isInitialized) {
    throw new Error(
      '@local-intelligence/sentiment is not initialized. Call initialize() first.',
    );
  }

  return LocalIntelligenceSentimentModule.resetStats();
}

export async function clearCache(): Promise<boolean> {
  if (!isInitialized) {
    throw new Error(
      '@local-intelligence/sentiment is not initialized. Call initialize() first.',
    );
  }

  return LocalIntelligenceSentimentModule.clearCache();
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
  return isInitialized;
}

export function getConfig(): SentimentConfig {
  return { ...currentConfig };
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
