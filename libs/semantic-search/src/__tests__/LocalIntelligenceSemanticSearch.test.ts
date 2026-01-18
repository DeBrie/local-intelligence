/**
 * Integration tests for @local-intelligence/semantic-search
 *
 * Note: These tests require mocking the native modules since they run in Node.js.
 * For full E2E testing, use Detox or similar frameworks.
 *
 * The semantic-search module provides:
 * - Native: initialize, generateEmbedding, generateEmbeddingBatch, getModelStatus, preloadModel, unloadModel
 * - JS (SemanticIndex): add, addBatch, search, remove, clear, getEntry, getStats
 */

import { NativeModules } from 'react-native';

// Mock React Native modules
jest.mock('react-native', () => ({
  NativeModules: {
    LocalIntelligenceSemanticSearch: {
      initialize: jest.fn(),
      generateEmbedding: jest.fn(),
      generateEmbeddingBatch: jest.fn(),
      getModelStatus: jest.fn(),
      preloadModel: jest.fn(),
      unloadModel: jest.fn(),
      notifyModelDownloaded: jest.fn(),
    },
    LocalIntelligenceCore: {
      // Core module for model download events
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
  getModelStatus,
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
        {
          embedding: new Array(384).fill(0).map(() => Math.random()),
          processingTimeMs: 15,
        },
        {
          embedding: new Array(384).fill(0).map(() => Math.random()),
          processingTimeMs: 15,
        },
        {
          embedding: new Array(384).fill(0).map(() => Math.random()),
          processingTimeMs: 15,
        },
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
      expect(result.embeddings[0].embedding).toHaveLength(384);
      expect(result.totalProcessingTimeMs).toBeGreaterThan(0);
    });
  });

  describe('getModelStatus', () => {
    beforeEach(async () => {
      mockNativeModule.initialize.mockResolvedValue(true);
      await initialize();
    });

    it('should return model status', async () => {
      mockNativeModule.getModelStatus.mockResolvedValue(
        JSON.stringify({ status: 'ready', progress: 100 }),
      );

      const status = await getModelStatus();

      expect(status.status).toBe('ready');
      expect(status.progress).toBe(100);
    });

    it('should return downloading status with progress', async () => {
      mockNativeModule.getModelStatus.mockResolvedValue(
        JSON.stringify({ status: 'downloading', progress: 45 }),
      );

      const status = await getModelStatus();

      expect(status.status).toBe('downloading');
      expect(status.progress).toBe(45);
    });
  });

  /**
   * Note: The following APIs are available via SemanticIndex class, not the native module directly:
   * - search() - Use SemanticIndex.search()
   * - add/addBatch - Use SemanticIndex.add() / SemanticIndex.addBatch()
   * - remove - Use SemanticIndex.remove()
   * - clear - Use SemanticIndex.clear()
   * - getStats - Use SemanticIndex.getStats()
   *
   * SemanticIndex uses sqlite-vec for vector storage and the native module for embedding generation.
   * See SemanticIndex.ts for the full implementation.
   */
});
