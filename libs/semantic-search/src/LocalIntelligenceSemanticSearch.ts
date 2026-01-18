import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import type {
  SemanticSearchConfig,
  EmbeddingResult,
  BatchEmbeddingResult,
} from './types';

const LINKING_ERROR =
  `The package '@local-intelligence/semantic-search' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

const NativeModule = NativeModules.LocalIntelligenceSemanticSearch;

const LocalIntelligenceSemanticSearchModule = NativeModule
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
let currentConfig: SemanticSearchConfig = {};
let modelDownloadSubscription: { remove: () => void } | null = null;

function getEventEmitter(): NativeEventEmitter {
  if (!eventEmitter) {
    eventEmitter = new NativeEventEmitter(
      LocalIntelligenceSemanticSearchModule,
    );
  }
  return eventEmitter;
}

const DEFAULT_MODEL_ID = 'minilm-l6-v2';

export async function initialize(
  config: SemanticSearchConfig = {},
): Promise<boolean> {
  if (isInitialized) {
    return true;
  }

  const nativeConfig = {
    databasePath: config.databasePath ?? '',
    tableName: config.tableName ?? 'semantic_index',
    embeddingDimensions: config.embeddingDimensions ?? 384,
    modelId: config.modelId ?? DEFAULT_MODEL_ID,
  };

  const result = await LocalIntelligenceSemanticSearchModule.initialize(
    JSON.stringify(nativeConfig),
  );
  if (result) {
    isInitialized = true;
    currentConfig = config;
    subscribeToModelDownloads(nativeConfig.modelId);

    // Trigger model download in background if not already available
    triggerModelDownloadIfNeeded(nativeConfig.modelId).catch(() => {
      // Silently fail - user will get MODEL_NOT_READY error when trying to generate embeddings
    });
  }
  return result;
}

/**
 * Triggers download of the embedding model if it's not already available.
 * Returns the model path if successful.
 */
export async function ensureModelReady(
  modelId: string = DEFAULT_MODEL_ID,
): Promise<string> {
  try {
    const CoreModule = NativeModules.LocalIntelligenceCore;
    if (!CoreModule) {
      throw new Error('Core module not available');
    }

    // Check if model is already downloaded
    const statusJson = await CoreModule.getModelStatus(modelId);
    const status = JSON.parse(statusJson);

    if (status.state === 'ready') {
      return status.path;
    }

    // Download the model
    const resultJson = await CoreModule.downloadModel(modelId);
    const result = JSON.parse(resultJson);
    return result.path;
  } catch (error) {
    throw new Error(
      `Failed to download embedding model: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function triggerModelDownloadIfNeeded(modelId: string): Promise<void> {
  try {
    const CoreModule = NativeModules.LocalIntelligenceCore;
    if (!CoreModule) return;

    const statusJson = await CoreModule.getModelStatus(modelId);
    const status = JSON.parse(statusJson);

    if (status.state === 'not_downloaded') {
      // Start download in background
      CoreModule.downloadModel(modelId).catch(() => {
        // Silently fail - user can manually trigger download
      });
    }
  } catch {
    // Silently fail
  }
}

function subscribeToModelDownloads(modelId: string): void {
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
          // Notify native semantic-search module when embedding model is downloaded
          if (event.modelId === modelId) {
            LocalIntelligenceSemanticSearchModule.notifyModelDownloaded?.(
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

export async function generateEmbedding(
  text: string,
): Promise<EmbeddingResult> {
  if (!isInitialized) {
    throw new Error(
      '@local-intelligence/semantic-search is not initialized. Call initialize() first.',
    );
  }

  const resultJson =
    await LocalIntelligenceSemanticSearchModule.generateEmbedding(text);
  return JSON.parse(resultJson) as EmbeddingResult;
}

export async function generateEmbeddingBatch(
  texts: string[],
): Promise<BatchEmbeddingResult> {
  if (!isInitialized) {
    throw new Error(
      '@local-intelligence/semantic-search is not initialized. Call initialize() first.',
    );
  }

  const resultJson =
    await LocalIntelligenceSemanticSearchModule.generateEmbeddingBatch(texts);
  return JSON.parse(resultJson) as BatchEmbeddingResult;
}

export async function getModelStatus(): Promise<{
  status: 'not_downloaded' | 'downloading' | 'ready' | 'error';
  progress?: number;
  error?: string;
}> {
  const resultJson =
    await LocalIntelligenceSemanticSearchModule.getModelStatus();
  return JSON.parse(resultJson);
}

export async function preloadModel(): Promise<boolean> {
  return LocalIntelligenceSemanticSearchModule.preloadModel();
}

export async function unloadModel(): Promise<boolean> {
  if (!isInitialized) {
    return true;
  }
  return LocalIntelligenceSemanticSearchModule.unloadModel();
}

export type EmbeddingEventCallback = (result: EmbeddingResult) => void;
export type ProgressEventCallback = (progress: number) => void;

export function onEmbeddingGenerated(
  callback: EmbeddingEventCallback,
): () => void {
  const emitter = getEventEmitter();
  const subscription = emitter.addListener('onEmbeddingGenerated', (event) => {
    callback(JSON.parse(event.result));
  });

  return () => subscription.remove();
}

export function onModelDownloadProgress(
  callback: ProgressEventCallback,
): () => void {
  const emitter = getEventEmitter();
  const subscription = emitter.addListener(
    'onModelDownloadProgress',
    (event) => {
      callback(event.progress);
    },
  );

  return () => subscription.remove();
}

export function isReady(): boolean {
  return isInitialized;
}

export function getConfig(): SemanticSearchConfig {
  return { ...currentConfig };
}

/**
 * Cleanup function to remove event listeners and reset state.
 * Call this when unmounting or when the module is no longer needed.
 */
export function cleanup(): void {
  if (modelDownloadSubscription) {
    modelDownloadSubscription.remove();
    modelDownloadSubscription = null;
  }
  isInitialized = false;
  currentConfig = {};
}
