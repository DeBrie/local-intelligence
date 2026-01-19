import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import type {
  PIIConfig,
  PIIEntity,
  RedactionResult,
  PIIStats,
  CustomPattern,
} from './types';

const LINKING_ERROR =
  `The package '@local-intelligence/pii' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

const NativeModule = NativeModules.LocalIntelligencePII;

const LocalIntelligencePIIModule = NativeModule
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
let currentConfig: PIIConfig = {};
let modelDownloadSubscription: { remove: () => void } | null = null;

function getEventEmitter(): NativeEventEmitter {
  if (!eventEmitter) {
    eventEmitter = new NativeEventEmitter(LocalIntelligencePIIModule);
  }
  return eventEmitter;
}

import { PII_MODEL_ID, ML_REQUIRED_TYPES } from './constants';
import type { PIITypeName } from './constants';

export async function initialize(config: PIIConfig = {}): Promise<boolean> {
  if (isInitialized) {
    return true;
  }

  const nativeConfig = {
    enabledTypes: config.enabledTypes ?? [
      'person',
      'organization',
      'location',
      'email_address',
      'phone_number',
      'us_ssn',
      'credit_card',
    ],
    redactionChar: config.redactionChar ?? '*',
    minConfidence: config.minConfidence ?? 0.7,
    preserveLength: config.preserveLength ?? true,
  };

  const result = await LocalIntelligencePIIModule.initialize(
    JSON.stringify(nativeConfig),
  );
  if (result) {
    isInitialized = true;
    currentConfig = config;

    if (config.customPatterns) {
      for (const pattern of config.customPatterns) {
        await addCustomPattern(pattern);
      }
    }

    subscribeToModelDownloads();

    // Check if ML-required types are enabled and trigger model download if needed
    const enabledTypes = nativeConfig.enabledTypes as PIITypeName[];
    const needsMLModel = enabledTypes.some((type) =>
      ML_REQUIRED_TYPES.includes(type),
    );
    if (needsMLModel) {
      // Try to load the model if already downloaded, otherwise trigger download
      await loadModelIfDownloaded().catch(() => {
        // Model not downloaded yet - trigger download in background
        triggerModelDownloadIfNeeded().catch(() => {
          // Silently fail - user will get MODEL_NOT_READY error when trying to detect
        });
      });
    }
  }
  return result;
}

/**
 * Triggers download of the PII model if it's not already available.
 * Returns the model path if successful.
 */
export async function ensureModelReady(): Promise<string> {
  try {
    const CoreModule = NativeModules.LocalIntelligenceCore;
    if (!CoreModule) {
      throw new Error('Core module not available');
    }

    // Check if model is already downloaded
    const statusJson = await CoreModule.getModelStatus(PII_MODEL_ID);
    const status = JSON.parse(statusJson);

    if (status.state === 'ready') {
      return status.path;
    }

    // Download the model
    const resultJson = await CoreModule.downloadModel(PII_MODEL_ID);
    const result = JSON.parse(resultJson);
    return result.path;
  } catch (error) {
    throw new Error(
      `Failed to download PII model: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function triggerModelDownloadIfNeeded(): Promise<void> {
  try {
    const CoreModule = NativeModules.LocalIntelligenceCore;
    if (!CoreModule) return;

    const statusJson = await CoreModule.getModelStatus(PII_MODEL_ID);
    const status = JSON.parse(statusJson);

    if (status.state === 'not_downloaded') {
      // Start download in background
      CoreModule.downloadModel(PII_MODEL_ID).catch(() => {
        // Silently fail - user can manually trigger download
      });
    }
  } catch {
    // Silently fail
  }
}

/**
 * Loads the model if it's already downloaded.
 * This is called during initialize to ensure the ONNX model is loaded.
 */
async function loadModelIfDownloaded(): Promise<void> {
  const CoreModule = NativeModules.LocalIntelligenceCore;
  if (!CoreModule) {
    throw new Error('Core module not available');
  }

  const statusJson = await CoreModule.getModelStatus(PII_MODEL_ID);
  const status = JSON.parse(statusJson);

  if (status.state === 'ready' && status.path) {
    // Model is downloaded, notify native module to load it
    if (LocalIntelligencePIIModule.notifyModelDownloaded) {
      LocalIntelligencePIIModule.notifyModelDownloaded(
        PII_MODEL_ID,
        status.path,
      );
    }

    // Wait for the model to be loaded (poll with timeout)
    const maxWaitMs = 10000; // 10 seconds max
    const pollIntervalMs = 100;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const modelStatusJson = await LocalIntelligencePIIModule.getModelStatus();
      const modelStatus = JSON.parse(modelStatusJson);
      if (modelStatus.isModelReady) {
        return; // Model loaded successfully
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    // Timeout - model didn't load in time, but don't throw - it may still load
    console.warn(
      'PII model loading timed out, but may still be loading in background',
    );
  } else {
    throw new Error('Model not downloaded');
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
          if (event.modelId === 'bert-small-pii') {
            LocalIntelligencePIIModule.notifyModelDownloaded?.(
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

export async function detectEntities(text: string): Promise<PIIEntity[]> {
  if (!isInitialized) {
    throw new Error(
      '@local-intelligence/pii is not initialized. Call initialize() first.',
    );
  }

  const resultJson = await LocalIntelligencePIIModule.detectEntities(text);
  return JSON.parse(resultJson) as PIIEntity[];
}

export async function redact(text: string): Promise<RedactionResult> {
  if (!isInitialized) {
    throw new Error(
      '@local-intelligence/pii is not initialized. Call initialize() first.',
    );
  }

  const resultJson = await LocalIntelligencePIIModule.redactText(text);
  return JSON.parse(resultJson) as RedactionResult;
}

export async function redactBatch(texts: string[]): Promise<RedactionResult[]> {
  if (!isInitialized) {
    throw new Error(
      '@local-intelligence/pii is not initialized. Call initialize() first.',
    );
  }

  const resultJson = await LocalIntelligencePIIModule.redactBatch(texts);
  return JSON.parse(resultJson) as RedactionResult[];
}

export async function addCustomPattern(
  pattern: CustomPattern,
): Promise<boolean> {
  if (!isInitialized) {
    throw new Error(
      '@local-intelligence/pii is not initialized. Call initialize() first.',
    );
  }

  return LocalIntelligencePIIModule.addCustomPattern(
    pattern.name,
    pattern.pattern,
    pattern.type,
  );
}

export async function removeCustomPattern(name: string): Promise<boolean> {
  if (!isInitialized) {
    throw new Error(
      '@local-intelligence/pii is not initialized. Call initialize() first.',
    );
  }

  return LocalIntelligencePIIModule.removeCustomPattern(name);
}

export async function getStats(): Promise<PIIStats> {
  if (!isInitialized) {
    throw new Error(
      '@local-intelligence/pii is not initialized. Call initialize() first.',
    );
  }

  const resultJson = await LocalIntelligencePIIModule.getStats();
  return JSON.parse(resultJson) as PIIStats;
}

export async function resetStats(): Promise<boolean> {
  if (!isInitialized) {
    throw new Error(
      '@local-intelligence/pii is not initialized. Call initialize() first.',
    );
  }

  return LocalIntelligencePIIModule.resetStats();
}

export type PIIEventCallback = (data: {
  text: string;
  entities: PIIEntity[];
}) => void;

export function onRedaction(callback: PIIEventCallback): () => void {
  const emitter = getEventEmitter();
  const subscription = emitter.addListener('onPIIRedaction', (event) => {
    callback({
      text: event.text,
      entities: JSON.parse(event.entities),
    });
  });

  return () => subscription.remove();
}

export function isReady(): boolean {
  return isInitialized;
}

/**
 * Get the current model status for the PII BERT model.
 */
export async function getModelStatus(): Promise<{
  status: 'not_ready' | 'downloading' | 'ready';
  modelId: string;
  isModelReady: boolean;
}> {
  const resultJson = await LocalIntelligencePIIModule.getModelStatus();
  return JSON.parse(resultJson);
}

/**
 * Manually trigger download of the PII model.
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
        if (event.modelId === PII_MODEL_ID) {
          onProgress(event.progress * 100);
        }
      },
    );
  }

  try {
    const resultJson = await CoreModule.downloadModel(PII_MODEL_ID);
    const result = JSON.parse(resultJson);

    // Notify the PII module that the model is ready
    if (LocalIntelligencePIIModule.notifyModelDownloaded) {
      LocalIntelligencePIIModule.notifyModelDownloaded(
        PII_MODEL_ID,
        result.path,
      );
    }

    return result.path;
  } finally {
    subscription?.remove();
  }
}

export function getConfig(): PIIConfig {
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
