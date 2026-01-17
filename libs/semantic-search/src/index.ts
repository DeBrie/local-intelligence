export {
  initialize,
  generateEmbedding,
  generateEmbeddingBatch,
  getModelStatus,
  preloadModel,
  unloadModel,
  onEmbeddingGenerated,
  onModelDownloadProgress,
  isReady,
  getConfig,
} from './LocalIntelligenceSemanticSearch';

export { SemanticIndex } from './SemanticIndex';

export { useSemanticSearch } from './useSemanticSearch';

export type {
  SemanticSearchConfig,
  IndexEntry,
  SearchResult,
  BatchSearchResult,
  EmbeddingResult,
  BatchEmbeddingResult,
  IndexStats,
  SearchOptions,
  AddEntryOptions,
} from './types';

export type { SemanticIndexOptions } from './SemanticIndex';

export type {
  EmbeddingEventCallback,
  ProgressEventCallback,
} from './LocalIntelligenceSemanticSearch';

export type {
  UseSemanticSearchOptions,
  UseSemanticSearchState,
  UseSemanticSearchActions,
  UseSemanticSearchReturn,
} from './useSemanticSearch';
