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

function getEventEmitter(): NativeEventEmitter {
  if (!eventEmitter) {
    eventEmitter = new NativeEventEmitter(LocalIntelligencePIIModule);
  }
  return eventEmitter;
}

export async function initialize(config: PIIConfig = {}): Promise<boolean> {
  if (isInitialized) {
    return true;
  }

  const nativeConfig = {
    enabledTypes: config.enabledTypes ?? [
      'person',
      'organization',
      'location',
      'email',
      'phone',
      'ssn',
      'credit_card',
    ],
    redactionChar: config.redactionChar ?? '*',
    minConfidence: config.minConfidence ?? 0.7,
    preserveLength: config.preserveLength ?? true,
  };

  const result = await LocalIntelligencePIIModule.initialize(JSON.stringify(nativeConfig));
  if (result) {
    isInitialized = true;
    currentConfig = config;

    if (config.customPatterns) {
      for (const pattern of config.customPatterns) {
        await addCustomPattern(pattern);
      }
    }
  }
  return result;
}

export async function detectEntities(text: string): Promise<PIIEntity[]> {
  if (!isInitialized) {
    throw new Error('@local-intelligence/pii is not initialized. Call initialize() first.');
  }

  const resultJson = await LocalIntelligencePIIModule.detectEntities(text);
  return JSON.parse(resultJson) as PIIEntity[];
}

export async function redact(text: string): Promise<RedactionResult> {
  if (!isInitialized) {
    throw new Error('@local-intelligence/pii is not initialized. Call initialize() first.');
  }

  const resultJson = await LocalIntelligencePIIModule.redactText(text);
  return JSON.parse(resultJson) as RedactionResult;
}

export async function redactBatch(texts: string[]): Promise<RedactionResult[]> {
  if (!isInitialized) {
    throw new Error('@local-intelligence/pii is not initialized. Call initialize() first.');
  }

  const resultJson = await LocalIntelligencePIIModule.redactBatch(texts);
  return JSON.parse(resultJson) as RedactionResult[];
}

export async function addCustomPattern(
  pattern: CustomPattern,
): Promise<boolean> {
  if (!isInitialized) {
    throw new Error('@local-intelligence/pii is not initialized. Call initialize() first.');
  }

  return LocalIntelligencePIIModule.addCustomPattern(
    pattern.name,
    pattern.pattern,
    pattern.type,
  );
}

export async function removeCustomPattern(name: string): Promise<boolean> {
  if (!isInitialized) {
    throw new Error('@local-intelligence/pii is not initialized. Call initialize() first.');
  }

  return LocalIntelligencePIIModule.removeCustomPattern(name);
}

export async function getStats(): Promise<PIIStats> {
  if (!isInitialized) {
    throw new Error('@local-intelligence/pii is not initialized. Call initialize() first.');
  }

  const resultJson = await LocalIntelligencePIIModule.getStats();
  return JSON.parse(resultJson) as PIIStats;
}

export async function resetStats(): Promise<boolean> {
  if (!isInitialized) {
    throw new Error('@local-intelligence/pii is not initialized. Call initialize() first.');
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

export function getConfig(): PIIConfig {
  return { ...currentConfig };
}
