import { useState, useCallback, useRef, useEffect } from 'react';
import { initialize, detectEntities, redact, redactBatch } from './LocalIntelligencePII';
import type { PIIEntity, RedactionResult, PIIConfig } from './types';

export interface UseRedactorOptions {
  autoInitialize?: boolean;
  config?: Partial<PIIConfig>;
}

export interface UseRedactorState {
  isInitialized: boolean;
  isLoading: boolean;
  error: Error | null;
  result: RedactionResult | null;
  entities: PIIEntity[];
}

export interface UseRedactorActions {
  initialize: (config?: Partial<PIIConfig>) => Promise<void>;
  detect: (text: string) => Promise<PIIEntity[]>;
  redact: (text: string) => Promise<RedactionResult>;
  redactBatch: (texts: string[]) => Promise<RedactionResult[]>;
  reset: () => void;
}

export type UseRedactorReturn = UseRedactorState & UseRedactorActions;

export function useRedactor(
  options: UseRedactorOptions = {},
): UseRedactorReturn {
  const { autoInitialize = true, config: initialConfig } = options;

  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<RedactionResult | null>(null);
  const [entities, setEntities] = useState<PIIEntity[]>([]);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (autoInitialize) {
      initializeRedactor(initialConfig);
    }
  }, [autoInitialize]);

  const initializeRedactor = useCallback(
    async (config?: Partial<PIIConfig>) => {
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

  const detectAction = useCallback(
    async (text: string): Promise<PIIEntity[]> => {
      if (!isInitialized) {
        throw new Error('Redactor not initialized. Call initialize() first.');
      }

      setIsLoading(true);
      setError(null);

      try {
        const detectedEntities = await detectEntities(text);
        if (mountedRef.current) {
          setEntities(detectedEntities);
          // Also set result so UI can display entities via result.entities
          setResult({
            originalText: text,
            redactedText: text,
            entities: detectedEntities,
            processingTimeMs: 0,
          });
        }
        return detectedEntities;
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

  const redactAction = useCallback(
    async (text: string): Promise<RedactionResult> => {
      if (!isInitialized) {
        throw new Error('Redactor not initialized. Call initialize() first.');
      }

      setIsLoading(true);
      setError(null);

      try {
        const redactionResult = await redact(text);
        if (mountedRef.current) {
          setResult(redactionResult);
          setEntities(redactionResult.entities);
        }
        return redactionResult;
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

  const redactBatchAction = useCallback(
    async (texts: string[]): Promise<RedactionResult[]> => {
      if (!isInitialized) {
        throw new Error('Redactor not initialized. Call initialize() first.');
      }

      setIsLoading(true);
      setError(null);

      try {
        const results = await redactBatch(texts);
        if (mountedRef.current && results.length > 0) {
          setResult(results[results.length - 1]);
          const allEntities = results.flatMap((r) => r.entities);
          setEntities(allEntities);
        }
        return results;
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
    setEntities([]);
    setError(null);
  }, []);

  return {
    isInitialized,
    isLoading,
    error,
    result,
    entities,
    initialize: initializeRedactor,
    detect: detectAction,
    redact: redactAction,
    redactBatch: redactBatchAction,
    reset,
  };
}
