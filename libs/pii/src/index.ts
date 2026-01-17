export {
  initialize,
  detectEntities,
  redact,
  redactBatch,
  addCustomPattern,
  removeCustomPattern,
  getStats,
  resetStats,
  onRedaction,
  isReady,
  getConfig,
} from './LocalIntelligencePII';

export { useRedactor } from './useRedactor';

export type {
  PIIEntityType,
  PIIEntity,
  RedactionResult,
  PIIConfig,
  CustomPattern,
  PIIStats,
} from './types';
export type { PIIEventCallback } from './LocalIntelligencePII';
export type {
  UseRedactorOptions,
  UseRedactorState,
  UseRedactorActions,
  UseRedactorReturn,
} from './useRedactor';
