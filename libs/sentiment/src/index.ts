export {
  initialize,
  analyze,
  analyzeBatch,
  getStats,
  resetStats,
  clearCache,
  onAnalysis,
  isReady,
  getConfig,
  getLabelEmoji,
  getLabelColor,
} from './DebrieSentiment';

export { useSentiment } from './useSentiment';

export type {
  SentimentLabel,
  SentimentResult,
  BatchSentimentResult,
  SentimentConfig,
  SentimentStats,
  SentimentTrend,
} from './types';

export type { SentimentEventCallback } from './DebrieSentiment';

export type {
  UseSentimentOptions,
  UseSentimentState,
  UseSentimentActions,
  UseSentimentReturn,
} from './useSentiment';
