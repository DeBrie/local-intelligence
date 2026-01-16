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
} from './DebrieSemanticSearch';

// SemanticIndex requires @op-engineering/op-sqlite - export separately if needed
// export { SemanticIndex } from './SemanticIndex';

// useSemanticSearch depends on SemanticIndex, disabled for now
// export { useSemanticSearch } from './useSemanticSearch';

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

// export type { SemanticIndexOptions } from './SemanticIndex';

export type {
  EmbeddingEventCallback,
  ProgressEventCallback,
} from './DebrieSemanticSearch';

// export type {
//   UseSemanticSearchOptions,
//   UseSemanticSearchState,
//   UseSemanticSearchActions,
//   UseSemanticSearchReturn,
// } from './useSemanticSearch';
