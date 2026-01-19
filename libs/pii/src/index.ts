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
  getModelStatus,
  downloadModel,
} from './LocalIntelligencePII';

export {
  PIITypes,
  DEFAULT_ENABLED_TYPES,
  ML_REQUIRED_TYPES,
  REGEX_DETECTABLE_TYPES,
  PII_MODEL_ID,
} from './constants';
export type { PIITypeName } from './constants';

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
