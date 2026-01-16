import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  initialize(config: string): Promise<boolean>;

  detectEntities(text: string): Promise<string>;

  redactText(text: string): Promise<string>;

  redactBatch(texts: string[]): Promise<string>;

  addCustomPattern(
    name: string,
    pattern: string,
    type: string,
  ): Promise<boolean>;

  removeCustomPattern(name: string): Promise<boolean>;

  getStats(): Promise<string>;

  resetStats(): Promise<boolean>;

  addListener(eventName: string): void;

  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('DebriePII');
