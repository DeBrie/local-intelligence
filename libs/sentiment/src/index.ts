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

export type {
  SentimentLabel,
  SentimentResult,
  BatchSentimentResult,
  SentimentConfig,
  SentimentStats,
  SentimentTrend,
} from './types';

export type { SentimentEventCallback } from './DebrieSentiment';
