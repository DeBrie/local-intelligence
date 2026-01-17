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
} from './LocalIntelligenceSentiment';

export { useSentiment } from './useSentiment';

export type {
  SentimentLabel,
  SentimentResult,
  BatchSentimentResult,
  SentimentConfig,
  SentimentStats,
  SentimentTrend,
} from './types';

export type { SentimentEventCallback } from './LocalIntelligenceSentiment';

export type {
  UseSentimentOptions,
  UseSentimentState,
  UseSentimentActions,
  UseSentimentReturn,
} from './useSentiment';
