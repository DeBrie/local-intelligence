import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  initialize(config: string): Promise<boolean>;

  generateEmbedding(text: string): Promise<string>;

  generateEmbeddingBatch(texts: string[]): Promise<string>;

  getModelStatus(): Promise<string>;

  preloadModel(): Promise<boolean>;

  unloadModel(): Promise<boolean>;

  addListener(eventName: string): void;

  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('DebrieSemanticSearch');
