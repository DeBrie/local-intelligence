import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import NativeDebrieCore from './NativeDebrieCore';
import type {
  CoreConfig,
  DeviceCapabilities,
  ModelStatus,
  DownloadProgress,
  DownloadProgressCallback,
} from './types';
import { InitializationError, ModelDownloadError } from './errors';

const LINKING_ERROR =
  `The package '@debrie/core' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

const DebrieCoreTurboModule: typeof NativeDebrieCore = NativeDebrieCore
  ? NativeDebrieCore
  : (new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      },
    ) as typeof NativeDebrieCore);

const DEFAULT_CDN_BASE_URL = 'https://cdn.debrie.dev/models';

let isInitialized = false;
let currentConfig: CoreConfig = {};
let eventEmitter: NativeEventEmitter | null = null;

function getEventEmitter(): NativeEventEmitter {
  if (!eventEmitter) {
    eventEmitter = new NativeEventEmitter(NativeModules.DebrieCore);
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
    const success = await DebrieCoreTurboModule.initialize(configJson);

    if (!success) {
      throw new InitializationError(
        'Native module initialization returned false',
      );
    }

    currentConfig = mergedConfig;
    isInitialized = true;
  } catch (error) {
    throw new InitializationError(
      `Failed to initialize @debrie/core: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function getDeviceCapabilities(): Promise<DeviceCapabilities> {
  ensureInitialized();

  const resultJson = await DebrieCoreTurboModule.getDeviceCapabilities();
  return JSON.parse(resultJson) as DeviceCapabilities;
}

export async function getModelStatus(modelId: string): Promise<ModelStatus> {
  ensureInitialized();

  const resultJson = await DebrieCoreTurboModule.getModelStatus(modelId);
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
      'DebrieDownloadProgress',
      (event: DownloadProgress) => {
        if (event.modelId === modelId) {
          onProgress(event);
        }
      },
    );
  }

  try {
    const resultJson = await DebrieCoreTurboModule.downloadModel(modelId);
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
  return DebrieCoreTurboModule.cancelDownload(modelId);
}

export async function deleteModel(modelId: string): Promise<boolean> {
  ensureInitialized();
  return DebrieCoreTurboModule.deleteModel(modelId);
}

export async function clearModelCache(): Promise<void> {
  ensureInitialized();
  await DebrieCoreTurboModule.clearModelCache();
}

export async function getCacheSize(): Promise<number> {
  ensureInitialized();
  return DebrieCoreTurboModule.getCacheSize();
}

export function isReady(): boolean {
  return isInitialized;
}

export function getConfig(): CoreConfig {
  return { ...currentConfig };
}

function ensureInitialized(): void {
  if (!isInitialized) {
    throw new InitializationError(
      '@debrie/core is not initialized. Call initialize() first.',
    );
  }
}
