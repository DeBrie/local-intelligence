import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  initialize(config: string): Promise<boolean>;

  getDeviceCapabilities(): Promise<string>;

  getModelStatus(modelId: string): Promise<string>;

  downloadModel(modelId: string): Promise<string>;

  cancelDownload(modelId: string): Promise<boolean>;

  deleteModel(modelId: string): Promise<boolean>;

  clearModelCache(): Promise<boolean>;

  getCacheSize(): Promise<number>;

  addListener(eventName: string): void;

  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('DebrieCore');
