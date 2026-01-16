import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import type {
  SemanticSearchConfig,
  EmbeddingResult,
  BatchEmbeddingResult,
} from './types';

const LINKING_ERROR =
  `The package '@debrie/semantic-search' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

const NativeModule = NativeModules.DebrieSemanticSearch;

const DebrieSemanticSearchModule = NativeModule
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

function getEventEmitter(): NativeEventEmitter {
  if (!eventEmitter) {
    eventEmitter = new NativeEventEmitter(DebrieSemanticSearchModule);
  }
  return eventEmitter;
}

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
    modelId: config.modelId ?? 'minilm-l6-v2',
  };

  const result = await DebrieSemanticSearchModule.initialize(
    JSON.stringify(nativeConfig),
  );
  if (result) {
    isInitialized = true;
    currentConfig = config;
  }
  return result;
}

export async function generateEmbedding(
  text: string,
): Promise<EmbeddingResult> {
  if (!isInitialized) {
    throw new Error(
      '@debrie/semantic-search is not initialized. Call initialize() first.',
    );
  }

  const resultJson = await DebrieSemanticSearchModule.generateEmbedding(text);
  return JSON.parse(resultJson) as EmbeddingResult;
}

export async function generateEmbeddingBatch(
  texts: string[],
): Promise<BatchEmbeddingResult> {
  if (!isInitialized) {
    throw new Error(
      '@debrie/semantic-search is not initialized. Call initialize() first.',
    );
  }

  const resultJson =
    await DebrieSemanticSearchModule.generateEmbeddingBatch(texts);
  return JSON.parse(resultJson) as BatchEmbeddingResult;
}

export async function getModelStatus(): Promise<{
  status: 'not_downloaded' | 'downloading' | 'ready' | 'error';
  progress?: number;
  error?: string;
}> {
  const resultJson = await DebrieSemanticSearchModule.getModelStatus();
  return JSON.parse(resultJson);
}

export async function preloadModel(): Promise<boolean> {
  return DebrieSemanticSearchModule.preloadModel();
}

export async function unloadModel(): Promise<boolean> {
  if (!isInitialized) {
    return true;
  }
  return DebrieSemanticSearchModule.unloadModel();
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
