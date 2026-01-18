import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type {
  CoreConfig,
  DeviceCapabilities,
  ModelStatus,
  DownloadProgress,
  DownloadProgressCallback,
  ModelMetadata,
} from './types';
import {
  InitializationError,
  ModelDownloadError,
  NetworkError,
} from './errors';

const LINKING_ERROR =
  `The package '@local-intelligence/core' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

const NativeModule = NativeModules.LocalIntelligenceCore;

const LocalIntelligenceCoreModule = NativeModule
  ? NativeModule
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      },
    );

const DEFAULT_CDN_BASE_URL = 'https://cdn.localintelligence.dev/models';

let isInitialized = false;
let currentConfig: CoreConfig = {};
let eventEmitter: NativeEventEmitter | null = null;

function getEventEmitter(): NativeEventEmitter {
  if (!eventEmitter) {
    eventEmitter = new NativeEventEmitter(NativeModules.LocalIntelligenceCore);
  }
  return eventEmitter;
}

export async function initialize(config?: CoreConfig): Promise<void> {
  if (isInitialized) {
    return;
  }

  const mergedConfig: CoreConfig = {
    cdnBaseUrl: DEFAULT_CDN_BASE_URL,
    maxConcurrentDownloads: 2,
    enableLogging: __DEV__,
    ...config,
  };

  try {
    const configJson = JSON.stringify(mergedConfig);
    const success = await LocalIntelligenceCoreModule.initialize(configJson);

    if (!success) {
      throw new InitializationError(
        'Native module initialization returned false',
      );
    }

    currentConfig = mergedConfig;
    isInitialized = true;
  } catch (error) {
    throw new InitializationError(
      `Failed to initialize @local-intelligence/core: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function getDeviceCapabilities(): Promise<DeviceCapabilities> {
  ensureInitialized();

  const resultJson = await LocalIntelligenceCoreModule.getDeviceCapabilities();
  return JSON.parse(resultJson) as DeviceCapabilities;
}

export async function getModelStatus(modelId: string): Promise<ModelStatus> {
  ensureInitialized();

  const resultJson = await LocalIntelligenceCoreModule.getModelStatus(modelId);
  return JSON.parse(resultJson) as ModelStatus;
}

export async function downloadModel(
  modelId: string,
  onProgress?: DownloadProgressCallback,
): Promise<string> {
  ensureInitialized();

  let subscription: { remove: () => void } | null = null;

  if (onProgress) {
    const emitter = getEventEmitter();
    subscription = emitter.addListener(
      'LocalIntelligenceDownloadProgress',
      (event: DownloadProgress) => {
        if (event.modelId === modelId) {
          onProgress(event);
        }
      },
    );
  }

  try {
    const resultJson = await LocalIntelligenceCoreModule.downloadModel(modelId);
    const result = JSON.parse(resultJson);

    if (result.error) {
      throw new ModelDownloadError(modelId, new Error(result.error));
    }

    return result.path;
  } finally {
    subscription?.remove();
  }
}

export async function cancelDownload(modelId: string): Promise<boolean> {
  ensureInitialized();
  return LocalIntelligenceCoreModule.cancelDownload(modelId);
}

export async function deleteModel(modelId: string): Promise<boolean> {
  ensureInitialized();
  return LocalIntelligenceCoreModule.deleteModel(modelId);
}

export async function clearModelCache(): Promise<void> {
  ensureInitialized();
  await LocalIntelligenceCoreModule.clearModelCache();
}

export async function getCacheSize(): Promise<number> {
  ensureInitialized();
  return LocalIntelligenceCoreModule.getCacheSize();
}

export function isReady(): boolean {
  return isInitialized;
}

export function getConfig(): CoreConfig {
  return { ...currentConfig };
}

export type ModelDownloadedCallback = (event: {
  modelId: string;
  path: string;
  format: string;
}) => void;

const modelDownloadedListeners: ModelDownloadedCallback[] = [];

export function onModelDownloaded(
  callback: ModelDownloadedCallback,
): () => void {
  modelDownloadedListeners.push(callback);

  // Set up native event listener if this is the first subscriber
  if (modelDownloadedListeners.length === 1) {
    const emitter = getEventEmitter();
    emitter.addListener('LocalIntelligenceModelDownloaded', (event) => {
      modelDownloadedListeners.forEach((listener) => listener(event));
    });
  }

  return () => {
    const index = modelDownloadedListeners.indexOf(callback);
    if (index > -1) {
      modelDownloadedListeners.splice(index, 1);
    }
  };
}

export async function getModelMetadata(
  modelId: string,
): Promise<ModelMetadata> {
  const cdnBaseUrl =
    currentConfig.cdnBaseUrl || 'https://cdn.localintelligence.dev/models';
  const metadataUrl = `${cdnBaseUrl}/${modelId}/latest/metadata.json`;

  try {
    const response = await fetch(metadataUrl);
    if (!response.ok) {
      throw new NetworkError(
        metadataUrl,
        `Failed to fetch metadata: ${response.status}`,
        response.status,
      );
    }
    return (await response.json()) as ModelMetadata;
  } catch (error) {
    if (error instanceof NetworkError) throw error;
    throw new NetworkError(
      metadataUrl,
      `Network error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function checkForModelUpdate(modelId: string): Promise<{
  hasUpdate: boolean;
  currentVersion?: string;
  latestVersion: string;
}> {
  const metadata = await getModelMetadata(modelId);
  const status = await getModelStatus(modelId);

  // Check if we have a local version
  if (status.state !== 'ready') {
    return {
      hasUpdate: true,
      latestVersion: metadata.version,
    };
  }

  // Read local metadata to compare versions
  // For now, we'll assume any downloaded model needs update check via metadata
  return {
    hasUpdate: false, // Would compare versions here
    currentVersion: metadata.version,
    latestVersion: metadata.version,
  };
}

function ensureInitialized(): void {
  if (!isInitialized) {
    throw new InitializationError(
      '@local-intelligence/core is not initialized. Call initialize() first.',
    );
  }
}
