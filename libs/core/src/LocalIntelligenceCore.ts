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

export interface DownloadOptions {
  onProgress?: DownloadProgressCallback;
  maxRetries?: number;
  retryDelayMs?: number;
}

export async function downloadModel(
  modelId: string,
  optionsOrCallback?: DownloadOptions | DownloadProgressCallback,
): Promise<string> {
  ensureInitialized();

  // Support both old callback-only API and new options API
  const options: DownloadOptions =
    typeof optionsOrCallback === 'function'
      ? { onProgress: optionsOrCallback }
      : (optionsOrCallback ?? {});

  const { onProgress, maxRetries = 3, retryDelayMs = 1000 } = options;

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

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resultJson =
        await LocalIntelligenceCoreModule.downloadModel(modelId);
      const result = JSON.parse(resultJson);
      return result.path;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if it's a network error worth retrying
      const isRetryable = isNetworkError(lastError);

      if (!isRetryable || attempt >= maxRetries) {
        break;
      }

      // Exponential backoff
      const delay = retryDelayMs * Math.pow(2, attempt);
      await sleep(delay);
    }
  }

  subscription?.remove();

  throw new ModelDownloadError(
    modelId,
    lastError ?? new Error('Unknown error'),
  );
}

function isNetworkError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('connection') ||
    message.includes('offline') ||
    message.includes('internet') ||
    message.includes('timed out') ||
    message.includes('could not connect')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

export async function hasBundledModel(modelId: string): Promise<boolean> {
  return LocalIntelligenceCoreModule.hasBundledModel(modelId);
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
  changelog?: string;
}> {
  ensureInitialized();

  // Fetch latest metadata from CDN
  const latestMetadata = await getModelMetadata(modelId);
  const status = await getModelStatus(modelId);

  // Check if we have a local version
  if (status.state !== 'ready') {
    return {
      hasUpdate: true,
      latestVersion: latestMetadata.version,
    };
  }

  // Read local metadata to compare versions
  try {
    const localMetadataJson =
      await LocalIntelligenceCoreModule.getLocalModelMetadata(modelId);
    const localMetadata = JSON.parse(localMetadataJson) as {
      version?: string;
    };

    const currentVersion = localMetadata.version || '0.0.0';
    const latestVersion = latestMetadata.version;

    // Compare semantic versions
    const hasUpdate = compareVersions(currentVersion, latestVersion) < 0;

    return {
      hasUpdate,
      currentVersion,
      latestVersion,
    };
  } catch {
    // No local metadata, assume update needed
    return {
      hasUpdate: true,
      latestVersion: latestMetadata.version,
    };
  }
}

/**
 * Compare two semantic version strings.
 * Returns: -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map((p) => parseInt(p, 10) || 0);
  const parts2 = v2.split('.').map((p) => parseInt(p, 10) || 0);

  const maxLen = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < maxLen; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 < p2) return -1;
    if (p1 > p2) return 1;
  }
  return 0;
}

/**
 * Update a model to the latest version.
 * Downloads the new version and replaces the existing one.
 */
export async function updateModel(
  modelId: string,
  onProgress?: DownloadProgressCallback,
): Promise<{ path: string; version: string }> {
  ensureInitialized();

  const updateInfo = await checkForModelUpdate(modelId);
  if (!updateInfo.hasUpdate) {
    const status = await getModelStatus(modelId);
    if (status.state === 'ready') {
      return { path: status.path, version: updateInfo.currentVersion! };
    }
  }

  // Download the latest version
  const path = await downloadModel(modelId, onProgress);
  return { path, version: updateInfo.latestVersion };
}

function ensureInitialized(): void {
  if (!isInitialized) {
    throw new InitializationError(
      '@local-intelligence/core is not initialized. Call initialize() first.',
    );
  }
}
