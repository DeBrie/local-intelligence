/**
 * Integration tests for @local-intelligence/semantic-search
 *
 * Note: These tests require mocking the native modules since they run in Node.js.
 * For full E2E testing, use Detox or similar frameworks.
 */

import { NativeModules, NativeEventEmitter } from 'react-native';

// Mock React Native modules
jest.mock('react-native', () => ({
  NativeModules: {
    LocalIntelligenceSemanticSearch: {
      initialize: jest.fn(),
      generateEmbedding: jest.fn(),
      generateEmbeddingBatch: jest.fn(),
      computeSimilarity: jest.fn(),
      indexDocuments: jest.fn(),
      search: jest.fn(),
      deleteDocument: jest.fn(),
      clearIndex: jest.fn(),
      getStats: jest.fn(),
      resetStats: jest.fn(),
      notifyModelDownloaded: jest.fn(),
    },
  },
  NativeEventEmitter: jest.fn().mockImplementation(() => ({
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeAllListeners: jest.fn(),
  })),
  Platform: {
    select: jest.fn((obj: Record<string, unknown>) => obj.default || obj.ios),
  },
}));

import {
  initialize,
  generateEmbedding,
  generateEmbeddingBatch,
  computeSimilarity,
  indexDocuments,
  search,
  deleteDocument,
  clearIndex,
  getStats,
  isReady,
} from '../LocalIntelligenceSemanticSearch';

describe('@local-intelligence/semantic-search', () => {
  const mockNativeModule = NativeModules.LocalIntelligenceSemanticSearch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('should initialize with default config', async () => {
      mockNativeModule.initialize.mockResolvedValue(true);

      const result = await initialize();

      expect(result).toBe(true);
      expect(mockNativeModule.initialize).toHaveBeenCalled();
      expect(isReady()).toBe(true);
    });

    it('should initialize with custom config', async () => {
      mockNativeModule.initialize.mockResolvedValue(true);

      await initialize({
        databasePath: '/custom/path/db.sqlite',
        tableName: 'custom_index',
        embeddingDimensions: 384,
      });

      expect(mockNativeModule.initialize).toHaveBeenCalledWith(
        expect.stringContaining('"databasePath":"/custom/path/db.sqlite"'),
      );
    });
  });

  describe('generateEmbedding', () => {
    beforeEach(async () => {
      mockNativeModule.initialize.mockResolvedValue(true);
      await initialize();
    });

    it('should generate embedding for text', async () => {
      const mockEmbedding = new Array(384).fill(0).map(() => Math.random());
      mockNativeModule.generateEmbedding.mockResolvedValue(
        JSON.stringify({ embedding: mockEmbedding, processingTimeMs: 15.5 }),
      );

      const result = await generateEmbedding('Hello world');

      expect(result.embedding).toHaveLength(384);
      expect(result.processingTimeMs).toBeGreaterThan(0);
    });

    it('should handle empty text', async () => {
      const mockEmbedding = new Array(384).fill(0);
      mockNativeModule.generateEmbedding.mockResolvedValue(
        JSON.stringify({ embedding: mockEmbedding, processingTimeMs: 1.0 }),
      );

      const result = await generateEmbedding('');

      expect(result.embedding).toHaveLength(384);
    });
  });

  describe('generateEmbeddingBatch', () => {
    beforeEach(async () => {
      mockNativeModule.initialize.mockResolvedValue(true);
      await initialize();
    });

    it('should generate embeddings for multiple texts', async () => {
      const mockEmbeddings = [
        new Array(384).fill(0).map(() => Math.random()),
        new Array(384).fill(0).map(() => Math.random()),
        new Array(384).fill(0).map(() => Math.random()),
      ];

      mockNativeModule.generateEmbeddingBatch.mockResolvedValue(
        JSON.stringify({
          embeddings: mockEmbeddings,
          totalProcessingTimeMs: 45.2,
        }),
      );

      const result = await generateEmbeddingBatch([
        'First document',
        'Second document',
        'Third document',
      ]);

      expect(result.embeddings).toHaveLength(3);
      expect(result.embeddings[0]).toHaveLength(384);
      expect(result.totalProcessingTimeMs).toBeGreaterThan(0);
    });
  });

  describe('computeSimilarity', () => {
    beforeEach(async () => {
      mockNativeModule.initialize.mockResolvedValue(true);
      await initialize();
    });

    it('should compute cosine similarity between embeddings', async () => {
      mockNativeModule.computeSimilarity.mockResolvedValue(0.85);

      const embedding1 = new Array(384).fill(0.5);
      const embedding2 = new Array(384).fill(0.6);

      const similarity = await computeSimilarity(embedding1, embedding2);

      expect(similarity).toBeGreaterThanOrEqual(-1);
      expect(similarity).toBeLessThanOrEqual(1);
      expect(similarity).toBe(0.85);
    });

    it('should return 1.0 for identical embeddings', async () => {
      mockNativeModule.computeSimilarity.mockResolvedValue(1.0);

      const embedding = new Array(384).fill(0.5);

      const similarity = await computeSimilarity(embedding, embedding);

      expect(similarity).toBe(1.0);
    });
  });

  describe('indexDocuments', () => {
    beforeEach(async () => {
      mockNativeModule.initialize.mockResolvedValue(true);
      await initialize();
    });

    it('should index documents with IDs and content', async () => {
      mockNativeModule.indexDocuments.mockResolvedValue(
        JSON.stringify({
          indexed: 3,
          totalProcessingTimeMs: 120.5,
        }),
      );

      const result = await indexDocuments([
        { id: 'doc1', content: 'First document content' },
        { id: 'doc2', content: 'Second document content' },
        { id: 'doc3', content: 'Third document content' },
      ]);

      expect(result.indexed).toBe(3);
      expect(result.totalProcessingTimeMs).toBeGreaterThan(0);
    });

    it('should index documents with metadata', async () => {
      mockNativeModule.indexDocuments.mockResolvedValue(
        JSON.stringify({
          indexed: 1,
          totalProcessingTimeMs: 50.0,
        }),
      );

      const result = await indexDocuments([
        {
          id: 'doc1',
          content: 'Document with metadata',
          metadata: { category: 'test', author: 'user' },
        },
      ]);

      expect(result.indexed).toBe(1);
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      mockNativeModule.initialize.mockResolvedValue(true);
      await initialize();
    });

    it('should search for similar documents', async () => {
      const mockResults = [
        { id: 'doc1', score: 0.95, content: 'Most relevant document' },
        { id: 'doc2', score: 0.82, content: 'Second most relevant' },
        { id: 'doc3', score: 0.71, content: 'Third result' },
      ];

      mockNativeModule.search.mockResolvedValue(
        JSON.stringify({
          results: mockResults,
          processingTimeMs: 25.3,
        }),
      );

      const result = await search('search query', { limit: 3 });

      expect(result.results).toHaveLength(3);
      expect(result.results[0].score).toBeGreaterThan(result.results[1].score);
      expect(result.processingTimeMs).toBeGreaterThan(0);
    });

    it('should respect limit parameter', async () => {
      const mockResults = [{ id: 'doc1', score: 0.95, content: 'Only result' }];

      mockNativeModule.search.mockResolvedValue(
        JSON.stringify({
          results: mockResults,
          processingTimeMs: 15.0,
        }),
      );

      const result = await search('query', { limit: 1 });

      expect(result.results).toHaveLength(1);
    });

    it('should filter by minimum score', async () => {
      const mockResults = [
        { id: 'doc1', score: 0.95, content: 'High score document' },
      ];

      mockNativeModule.search.mockResolvedValue(
        JSON.stringify({
          results: mockResults,
          processingTimeMs: 20.0,
        }),
      );

      const result = await search('query', { minScore: 0.8 });

      expect(result.results.every((r) => r.score >= 0.8)).toBe(true);
    });

    it('should return empty results for no matches', async () => {
      mockNativeModule.search.mockResolvedValue(
        JSON.stringify({
          results: [],
          processingTimeMs: 10.0,
        }),
      );

      const result = await search('nonexistent query');

      expect(result.results).toHaveLength(0);
    });
  });

  describe('deleteDocument', () => {
    beforeEach(async () => {
      mockNativeModule.initialize.mockResolvedValue(true);
      await initialize();
    });

    it('should delete document by ID', async () => {
      mockNativeModule.deleteDocument.mockResolvedValue(true);

      const result = await deleteDocument('doc1');

      expect(result).toBe(true);
      expect(mockNativeModule.deleteDocument).toHaveBeenCalledWith('doc1');
    });

    it('should return false for non-existent document', async () => {
      mockNativeModule.deleteDocument.mockResolvedValue(false);

      const result = await deleteDocument('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('clearIndex', () => {
    beforeEach(async () => {
      mockNativeModule.initialize.mockResolvedValue(true);
      await initialize();
    });

    it('should clear all indexed documents', async () => {
      mockNativeModule.clearIndex.mockResolvedValue(true);

      const result = await clearIndex();

      expect(result).toBe(true);
      expect(mockNativeModule.clearIndex).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      mockNativeModule.initialize.mockResolvedValue(true);
      await initialize();
    });

    it('should return embedding stats', async () => {
      const mockStats = {
        totalGenerated: 150,
        totalSearches: 45,
        totalIndexed: 100,
        averageEmbeddingTimeMs: 12.5,
        averageSearchTimeMs: 8.3,
      };

      mockNativeModule.getStats.mockResolvedValue(JSON.stringify(mockStats));

      const stats = await getStats();

      expect(stats.totalGenerated).toBe(150);
      expect(stats.totalSearches).toBe(45);
      expect(stats.totalIndexed).toBe(100);
      expect(stats.averageEmbeddingTimeMs).toBeGreaterThan(0);
    });
  });
});
