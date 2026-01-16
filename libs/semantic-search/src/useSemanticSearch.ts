import { useState, useCallback, useRef, useEffect } from 'react';
import { SemanticIndex, SemanticIndexOptions } from './SemanticIndex';
import type {
  SearchResult,
  IndexStats,
  SearchOptions,
  AddEntryOptions,
} from './types';

export interface UseSemanticSearchOptions {
  autoInitialize?: boolean;
  indexOptions: SemanticIndexOptions;
}

export interface UseSemanticSearchState {
  isInitialized: boolean;
  isLoading: boolean;
  error: Error | null;
  results: SearchResult[];
  stats: IndexStats | null;
}

export interface UseSemanticSearchActions {
  initialize: () => Promise<void>;
  search: (query: string, options?: SearchOptions) => Promise<SearchResult[]>;
  add: (id: string, text: string, options?: AddEntryOptions) => Promise<void>;
  addBatch: (
    entries: Array<{
      id: string;
      text: string;
      metadata?: Record<string, unknown>;
    }>,
  ) => Promise<{ added: number; skipped: number }>;
  remove: (id: string) => Promise<boolean>;
  clear: () => Promise<void>;
  getStats: () => Promise<IndexStats>;
  reset: () => void;
  close: () => Promise<void>;
}

export type UseSemanticSearchReturn = UseSemanticSearchState &
  UseSemanticSearchActions;

export function useSemanticSearch(
  options: UseSemanticSearchOptions,
): UseSemanticSearchReturn {
  const { autoInitialize = true, indexOptions } = options;

  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [stats, setStats] = useState<IndexStats | null>(null);

  const indexRef = useRef<SemanticIndex | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (autoInitialize) {
      initializeIndex();
    }
  }, [autoInitialize]);

  const initializeIndex = useCallback(async () => {
    if (!mountedRef.current) return;

    setIsLoading(true);
    setError(null);

    try {
      const index = new SemanticIndex(indexOptions);
      await index.initialize();
      indexRef.current = index;
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
  }, [indexOptions]);

  const searchAction = useCallback(
    async (
      query: string,
      searchOptions?: SearchOptions,
    ): Promise<SearchResult[]> => {
      if (!indexRef.current) {
        throw new Error(
          'SemanticIndex not initialized. Call initialize() first.',
        );
      }

      setIsLoading(true);
      setError(null);

      try {
        const searchResults = await indexRef.current.search(
          query,
          searchOptions,
        );
        if (mountedRef.current) {
          setResults(searchResults);
        }
        return searchResults;
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
    [],
  );

  const addAction = useCallback(
    async (
      id: string,
      text: string,
      addOptions?: AddEntryOptions,
    ): Promise<void> => {
      if (!indexRef.current) {
        throw new Error(
          'SemanticIndex not initialized. Call initialize() first.',
        );
      }

      setIsLoading(true);
      setError(null);

      try {
        await indexRef.current.add(id, text, addOptions);
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
    [],
  );

  const addBatchAction = useCallback(
    async (
      entries: Array<{
        id: string;
        text: string;
        metadata?: Record<string, unknown>;
      }>,
    ): Promise<{ added: number; skipped: number }> => {
      if (!indexRef.current) {
        throw new Error(
          'SemanticIndex not initialized. Call initialize() first.',
        );
      }

      setIsLoading(true);
      setError(null);

      try {
        return await indexRef.current.addBatch(entries);
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
    [],
  );

  const removeAction = useCallback(async (id: string): Promise<boolean> => {
    if (!indexRef.current) {
      throw new Error(
        'SemanticIndex not initialized. Call initialize() first.',
      );
    }

    setIsLoading(true);
    setError(null);

    try {
      return await indexRef.current.remove(id);
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
  }, []);

  const clearAction = useCallback(async (): Promise<void> => {
    if (!indexRef.current) {
      throw new Error(
        'SemanticIndex not initialized. Call initialize() first.',
      );
    }

    setIsLoading(true);
    setError(null);

    try {
      await indexRef.current.clear();
      if (mountedRef.current) {
        setResults([]);
        setStats(null);
      }
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
  }, []);

  const getStatsAction = useCallback(async (): Promise<IndexStats> => {
    if (!indexRef.current) {
      throw new Error(
        'SemanticIndex not initialized. Call initialize() first.',
      );
    }

    try {
      const indexStats = await indexRef.current.getStats();
      if (mountedRef.current) {
        setStats(indexStats);
      }
      return indexStats;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (mountedRef.current) {
        setError(error);
      }
      throw error;
    }
  }, []);

  const reset = useCallback(() => {
    setResults([]);
    setStats(null);
    setError(null);
  }, []);

  const closeAction = useCallback(async (): Promise<void> => {
    if (indexRef.current) {
      await indexRef.current.close();
      indexRef.current = null;
      if (mountedRef.current) {
        setIsInitialized(false);
      }
    }
  }, []);

  return {
    isInitialized,
    isLoading,
    error,
    results,
    stats,
    initialize: initializeIndex,
    search: searchAction,
    add: addAction,
    addBatch: addBatchAction,
    remove: removeAction,
    clear: clearAction,
    getStats: getStatsAction,
    reset,
    close: closeAction,
  };
}
