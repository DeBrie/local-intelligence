import { useState, useCallback, useRef, useEffect } from 'react';
import { initialize, analyze, analyzeBatch } from './LocalIntelligenceSentiment';
import type { SentimentResult, SentimentConfig } from './types';

export interface UseSentimentOptions {
  autoInitialize?: boolean;
  config?: Partial<SentimentConfig>;
}

export interface UseSentimentState {
  isInitialized: boolean;
  isLoading: boolean;
  error: Error | null;
  result: SentimentResult | null;
  results: SentimentResult[];
}

export interface UseSentimentActions {
  initialize: (config?: Partial<SentimentConfig>) => Promise<void>;
  analyze: (text: string) => Promise<SentimentResult>;
  analyzeBatch: (texts: string[]) => Promise<SentimentResult[]>;
  reset: () => void;
}

export type UseSentimentReturn = UseSentimentState & UseSentimentActions;

export function useSentiment(
  options: UseSentimentOptions = {},
): UseSentimentReturn {
  const { autoInitialize = true, config: initialConfig } = options;

  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<SentimentResult | null>(null);
  const [results, setResults] = useState<SentimentResult[]>([]);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (autoInitialize) {
      initializeSentiment(initialConfig);
    }
  }, [autoInitialize]);

  const initializeSentiment = useCallback(
    async (config?: Partial<SentimentConfig>) => {
      if (!mountedRef.current) return;

      setIsLoading(true);
      setError(null);

      try {
        await initialize(config);
        if (mountedRef.current) {
          setIsInitialized(true);
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (mountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [],
  );

  const analyzeAction = useCallback(
    async (text: string): Promise<SentimentResult> => {
      if (!isInitialized) {
        throw new Error(
          'Sentiment analyzer not initialized. Call initialize() first.',
        );
      }

      setIsLoading(true);
      setError(null);

      try {
        const sentimentResult = await analyze(text);
        if (mountedRef.current) {
          setResult(sentimentResult);
          setResults([sentimentResult]);
        }
        return sentimentResult;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (mountedRef.current) {
          setError(error);
        }
        throw error;
      } finally {
        if (mountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [isInitialized],
  );

  const analyzeBatchAction = useCallback(
    async (texts: string[]): Promise<SentimentResult[]> => {
      if (!isInitialized) {
        throw new Error(
          'Sentiment analyzer not initialized. Call initialize() first.',
        );
      }

      setIsLoading(true);
      setError(null);

      try {
        const batchResult = await analyzeBatch(texts);
        const batchResults = batchResult.results;
        if (mountedRef.current) {
          setResults(batchResults);
          if (batchResults.length > 0) {
            setResult(batchResults[batchResults.length - 1]);
          }
        }
        return batchResults;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (mountedRef.current) {
          setError(error);
        }
        throw error;
      } finally {
        if (mountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [isInitialized],
  );

  const reset = useCallback(() => {
    setResult(null);
    setResults([]);
    setError(null);
  }, []);

  return {
    isInitialized,
    isLoading,
    error,
    result,
    results,
    initialize: initializeSentiment,
    analyze: analyzeAction,
    analyzeBatch: analyzeBatchAction,
    reset,
  };
}
