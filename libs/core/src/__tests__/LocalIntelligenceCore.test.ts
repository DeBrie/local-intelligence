/**
 * Integration tests for @local-intelligence/core
 *
 * Note: These tests require mocking the native modules since they run in Node.js.
 * For full E2E testing, use Detox or similar frameworks.
 */

import { NativeModules, NativeEventEmitter } from 'react-native';

// Mock React Native modules
jest.mock('react-native', () => ({
  NativeModules: {
    LocalIntelligenceCore: {
      initialize: jest.fn(),
      getDeviceCapabilities: jest.fn(),
      getModelStatus: jest.fn(),
      downloadModel: jest.fn(),
      cancelDownload: jest.fn(),
      deleteModel: jest.fn(),
      clearModelCache: jest.fn(),
      getCacheSize: jest.fn(),
    },
  },
  NativeEventEmitter: jest.fn().mockImplementation(() => ({
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeAllListeners: jest.fn(),
  })),
  Platform: {
    select: jest.fn((obj) => obj.default || obj.ios),
  },
}));

import {
  initialize,
  getDeviceCapabilities,
  getModelStatus,
  downloadModel,
  cancelDownload,
  deleteModel,
  clearModelCache,
  getCacheSize,
  isReady,
  getConfig,
} from '../LocalIntelligenceCore';
import { InitializationError, ModelDownloadError } from '../errors';

describe('@local-intelligence/core', () => {
  const mockNativeModule = NativeModules.LocalIntelligenceCore;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('should initialize with default config', async () => {
      mockNativeModule.initialize.mockResolvedValue(true);

      await initialize();

      expect(mockNativeModule.initialize).toHaveBeenCalledWith(
        expect.stringContaining(
          '"cdnBaseUrl":"https://cdn.localintelligence.dev/models"',
        ),
      );
      expect(isReady()).toBe(true);
    });

    it('should initialize with custom config', async () => {
      mockNativeModule.initialize.mockResolvedValue(true);

      await initialize({
        cdnBaseUrl: 'https://custom.cdn.com/models',
        maxConcurrentDownloads: 4,
        enableLogging: true,
      });

      expect(mockNativeModule.initialize).toHaveBeenCalledWith(
        expect.stringContaining('"cdnBaseUrl":"https://custom.cdn.com/models"'),
      );
    });

    it('should throw InitializationError on failure', async () => {
      mockNativeModule.initialize.mockRejectedValue(new Error('Native error'));

      await expect(initialize()).rejects.toThrow(InitializationError);
    });

    it('should not reinitialize if already initialized', async () => {
      mockNativeModule.initialize.mockResolvedValue(true);

      await initialize();
      await initialize();

      expect(mockNativeModule.initialize).toHaveBeenCalledTimes(1);
    });
  });

  describe('getDeviceCapabilities', () => {
    beforeEach(async () => {
      mockNativeModule.initialize.mockResolvedValue(true);
      await initialize();
    });

    it('should return device capabilities', async () => {
      const mockCapabilities = {
        platform: 'android',
        osVersion: '14',
        hasNPU: true,
        hasGPU: true,
        ramGB: 8,
        supportsFoundationModels: false,
        supportedDelegates: ['cpu', 'gpu', 'nnapi'],
      };

      mockNativeModule.getDeviceCapabilities.mockResolvedValue(
        JSON.stringify(mockCapabilities),
      );

      const capabilities = await getDeviceCapabilities();

      expect(capabilities).toEqual(mockCapabilities);
      expect(capabilities.platform).toBe('android');
      expect(capabilities.hasNPU).toBe(true);
    });
  });

  describe('getModelStatus', () => {
    beforeEach(async () => {
      mockNativeModule.initialize.mockResolvedValue(true);
      await initialize();
    });

    it('should return not_downloaded status for new model', async () => {
      mockNativeModule.getModelStatus.mockResolvedValue(
        JSON.stringify({ state: 'not_downloaded' }),
      );

      const status = await getModelStatus('bert-small-pii');

      expect(status.state).toBe('not_downloaded');
    });

    it('should return ready status for downloaded model', async () => {
      mockNativeModule.getModelStatus.mockResolvedValue(
        JSON.stringify({
          state: 'ready',
          sizeBytes: 38000000,
          path: '/data/models/bert-small-pii.onnx',
        }),
      );

      const status = await getModelStatus('bert-small-pii');

      expect(status.state).toBe('ready');
      if (status.state === 'ready') {
        expect(status.sizeBytes).toBe(38000000);
        expect(status.path).toContain('bert-small-pii');
      }
    });
  });

  describe('downloadModel', () => {
    beforeEach(async () => {
      mockNativeModule.initialize.mockResolvedValue(true);
      await initialize();
    });

    it('should download model and return path', async () => {
      mockNativeModule.downloadModel.mockResolvedValue(
        JSON.stringify({
          path: '/data/models/bert-small-pii.onnx',
          format: 'onnx',
        }),
      );

      const path = await downloadModel('bert-small-pii');

      expect(path).toBe('/data/models/bert-small-pii.onnx');
      expect(mockNativeModule.downloadModel).toHaveBeenCalledWith(
        'bert-small-pii',
      );
    });

    it('should throw ModelDownloadError on failure', async () => {
      mockNativeModule.downloadModel.mockResolvedValue(
        JSON.stringify({ error: 'Network error' }),
      );

      await expect(downloadModel('bert-small-pii')).rejects.toThrow(
        ModelDownloadError,
      );
    });

    it('should call progress callback during download', async () => {
      const mockEmitter = new NativeEventEmitter(mockNativeModule);
      mockNativeModule.downloadModel.mockResolvedValue(
        JSON.stringify({ path: '/data/models/bert-small-pii.onnx' }),
      );

      const onProgress = jest.fn();
      await downloadModel('bert-small-pii', onProgress);

      expect(mockEmitter.addListener).toHaveBeenCalledWith(
        'LocalIntelligenceDownloadProgress',
        expect.any(Function),
      );
    });
  });

  describe('cancelDownload', () => {
    beforeEach(async () => {
      mockNativeModule.initialize.mockResolvedValue(true);
      await initialize();
    });

    it('should cancel active download', async () => {
      mockNativeModule.cancelDownload.mockResolvedValue(true);

      const result = await cancelDownload('bert-small-pii');

      expect(result).toBe(true);
      expect(mockNativeModule.cancelDownload).toHaveBeenCalledWith(
        'bert-small-pii',
      );
    });

    it('should return false if no active download', async () => {
      mockNativeModule.cancelDownload.mockResolvedValue(false);

      const result = await cancelDownload('nonexistent-model');

      expect(result).toBe(false);
    });
  });

  describe('deleteModel', () => {
    beforeEach(async () => {
      mockNativeModule.initialize.mockResolvedValue(true);
      await initialize();
    });

    it('should delete downloaded model', async () => {
      mockNativeModule.deleteModel.mockResolvedValue(true);

      const result = await deleteModel('bert-small-pii');

      expect(result).toBe(true);
    });
  });

  describe('clearModelCache', () => {
    beforeEach(async () => {
      mockNativeModule.initialize.mockResolvedValue(true);
      await initialize();
    });

    it('should clear all cached models', async () => {
      mockNativeModule.clearModelCache.mockResolvedValue(undefined);

      await clearModelCache();

      expect(mockNativeModule.clearModelCache).toHaveBeenCalled();
    });
  });

  describe('getCacheSize', () => {
    beforeEach(async () => {
      mockNativeModule.initialize.mockResolvedValue(true);
      await initialize();
    });

    it('should return cache size in bytes', async () => {
      mockNativeModule.getCacheSize.mockResolvedValue(83000000);

      const size = await getCacheSize();

      expect(size).toBe(83000000);
    });
  });

  describe('getConfig', () => {
    it('should return current config', async () => {
      mockNativeModule.initialize.mockResolvedValue(true);

      await initialize({
        cdnBaseUrl: 'https://test.cdn.com',
        enableLogging: true,
      });

      const config = getConfig();

      expect(config.cdnBaseUrl).toBe('https://test.cdn.com');
      expect(config.enableLogging).toBe(true);
    });
  });
});
