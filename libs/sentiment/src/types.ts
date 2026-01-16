export type SentimentLabel = 'positive' | 'negative' | 'neutral';

export interface SentimentResult {
  text: string;
  label: SentimentLabel;
  confidence: number;
  scores: {
    positive: number;
    negative: number;
    neutral: number;
  };
  processingTimeMs: number;
}

export interface BatchSentimentResult {
  results: SentimentResult[];
  totalProcessingTimeMs: number;
  averageConfidence: number;
}

export interface SentimentConfig {
  minConfidence?: number;
  defaultLabel?: SentimentLabel;
  enableCaching?: boolean;
  maxCacheSize?: number;
}

export interface SentimentStats {
  totalAnalyzed: number;
  byLabel: Record<SentimentLabel, number>;
  averageConfidence: number;
  averageProcessingTimeMs: number;
}

export interface SentimentTrend {
  label: SentimentLabel;
  count: number;
  percentage: number;
  averageConfidence: number;
}
