import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  initialize(config: string): Promise<boolean>;

  analyze(text: string): Promise<string>;

  analyzeBatch(texts: string[]): Promise<string>;

  getStats(): Promise<string>;

  resetStats(): Promise<boolean>;

  clearCache(): Promise<boolean>;

  addListener(eventName: string): void;

  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('LocalIntelligenceSentiment');
