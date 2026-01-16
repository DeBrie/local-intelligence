import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import type {
  SentimentConfig,
  SentimentResult,
  BatchSentimentResult,
  SentimentStats,
  SentimentLabel,
} from './types';

const LINKING_ERROR =
  `The package '@debrie/sentiment' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

const NativeModule = NativeModules.DebrieSentiment;

const DebrieSentimentModule = NativeModule
  ? NativeModule
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      },
    );

let eventEmitter: NativeEventEmitter | null = null;
let isInitialized = false;
let currentConfig: SentimentConfig = {};

function getEventEmitter(): NativeEventEmitter {
  if (!eventEmitter) {
    eventEmitter = new NativeEventEmitter(DebrieSentimentModule);
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

  const result = await DebrieSentimentModule.initialize(
    JSON.stringify(nativeConfig),
  );
  if (result) {
    isInitialized = true;
    currentConfig = config;
  }
  return result;
}

export async function analyze(text: string): Promise<SentimentResult> {
  if (!isInitialized) {
    throw new Error(
      '@debrie/sentiment is not initialized. Call initialize() first.',
    );
  }

  const resultJson = await DebrieSentimentModule.analyze(text);
  return JSON.parse(resultJson) as SentimentResult;
}

export async function analyzeBatch(
  texts: string[],
): Promise<BatchSentimentResult> {
  if (!isInitialized) {
    throw new Error(
      '@debrie/sentiment is not initialized. Call initialize() first.',
    );
  }

  const resultJson = await DebrieSentimentModule.analyzeBatch(texts);
  return JSON.parse(resultJson) as BatchSentimentResult;
}

export async function getStats(): Promise<SentimentStats> {
  if (!isInitialized) {
    throw new Error(
      '@debrie/sentiment is not initialized. Call initialize() first.',
    );
  }

  const resultJson = await DebrieSentimentModule.getStats();
  return JSON.parse(resultJson) as SentimentStats;
}

export async function resetStats(): Promise<boolean> {
  if (!isInitialized) {
    throw new Error(
      '@debrie/sentiment is not initialized. Call initialize() first.',
    );
  }

  return DebrieSentimentModule.resetStats();
}

export async function clearCache(): Promise<boolean> {
  if (!isInitialized) {
    throw new Error(
      '@debrie/sentiment is not initialized. Call initialize() first.',
    );
  }

  return DebrieSentimentModule.clearCache();
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
