export interface SemanticSearchConfig {
  databasePath?: string;
  tableName?: string;
  embeddingDimensions?: number;
  modelId?: string;
}

export interface IndexEntry {
  id: string;
  text: string;
  embedding?: number[];
  metadata?: Record<string, unknown>;
  createdAt?: number;
}

export interface SearchResult {
  id: string;
  text: string;
  similarity: number;
  metadata?: Record<string, unknown>;
}

export interface BatchSearchResult {
  query: string;
  results: SearchResult[];
}

export interface EmbeddingResult {
  text: string;
  embedding: number[];
  processingTimeMs: number;
}

export interface BatchEmbeddingResult {
  embeddings: EmbeddingResult[];
  totalProcessingTimeMs: number;
}

export interface IndexStats {
  totalEntries: number;
  databaseSizeBytes: number;
  embeddingDimensions: number;
  tableName: string;
}

export interface SearchOptions {
  limit?: number;
  minSimilarity?: number;
  includeMetadata?: boolean;
}

export interface AddEntryOptions {
  metadata?: Record<string, unknown>;
  skipDuplicates?: boolean;
}
