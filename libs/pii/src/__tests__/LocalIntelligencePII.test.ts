/**
 * Integration tests for @local-intelligence/pii
 *
 * Note: These tests require mocking the native modules since they run in Node.js.
 * For full E2E testing, use Detox or similar frameworks.
 */

import { NativeModules, NativeEventEmitter } from 'react-native';

// Mock React Native modules
jest.mock('react-native', () => ({
  NativeModules: {
    LocalIntelligencePII: {
      initialize: jest.fn(),
      detectEntities: jest.fn(),
      redactText: jest.fn(),
      redactBatch: jest.fn(),
      addCustomPattern: jest.fn(),
      removeCustomPattern: jest.fn(),
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
  detectEntities,
  redactText,
  redactBatch,
  addCustomPattern,
  removeCustomPattern,
  getStats,
  resetStats,
  isReady,
} from '../LocalIntelligencePII';

describe('@local-intelligence/pii', () => {
  const mockNativeModule = NativeModules.LocalIntelligencePII;

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
        enabledTypes: ['email', 'phone', 'ssn'],
        redactionChar: 'X',
        minConfidence: 0.8,
        preserveLength: false,
      });

      expect(mockNativeModule.initialize).toHaveBeenCalledWith(
        expect.stringContaining('"enabledTypes":["email","phone","ssn"]'),
      );
    });
  });

  describe('detectEntities', () => {
    beforeEach(async () => {
      mockNativeModule.initialize.mockResolvedValue(true);
      await initialize();
    });

    it('should detect email addresses', async () => {
      const mockEntities = [
        {
          type: 'email_address',
          text: 'john@example.com',
          startIndex: 16,
          endIndex: 32,
          confidence: 0.95,
        },
      ];

      mockNativeModule.detectEntities.mockResolvedValue(
        JSON.stringify(mockEntities),
      );

      const entities = await detectEntities('Contact me at john@example.com');

      expect(entities).toHaveLength(1);
      expect(entities[0].type).toBe('email_address');
      expect(entities[0].text).toBe('john@example.com');
      expect(entities[0].confidence).toBeGreaterThan(0.9);
    });

    it('should detect phone numbers', async () => {
      const mockEntities = [
        {
          type: 'phone_number',
          text: '555-123-4567',
          startIndex: 15,
          endIndex: 27,
          confidence: 0.95,
        },
      ];

      mockNativeModule.detectEntities.mockResolvedValue(
        JSON.stringify(mockEntities),
      );

      const entities = await detectEntities('Call me at 555-123-4567');

      expect(entities).toHaveLength(1);
      expect(entities[0].type).toBe('phone_number');
    });

    it('should detect SSN', async () => {
      const mockEntities = [
        {
          type: 'us_ssn',
          text: '123-45-6789',
          startIndex: 11,
          endIndex: 22,
          confidence: 0.95,
        },
      ];

      mockNativeModule.detectEntities.mockResolvedValue(
        JSON.stringify(mockEntities),
      );

      const entities = await detectEntities('My SSN is 123-45-6789');

      expect(entities).toHaveLength(1);
      expect(entities[0].type).toBe('us_ssn');
    });

    it('should detect multiple entity types', async () => {
      const mockEntities = [
        {
          type: 'person',
          text: 'John Smith',
          startIndex: 0,
          endIndex: 10,
          confidence: 0.85,
        },
        {
          type: 'email_address',
          text: 'john@example.com',
          startIndex: 24,
          endIndex: 40,
          confidence: 0.95,
        },
      ];

      mockNativeModule.detectEntities.mockResolvedValue(
        JSON.stringify(mockEntities),
      );

      const entities = await detectEntities(
        'John Smith can be reached at john@example.com',
      );

      expect(entities).toHaveLength(2);
      expect(entities.map((e) => e.type)).toContain('person');
      expect(entities.map((e) => e.type)).toContain('email_address');
    });

    it('should return empty array for text without PII', async () => {
      mockNativeModule.detectEntities.mockResolvedValue(JSON.stringify([]));

      const entities = await detectEntities('Hello world');

      expect(entities).toHaveLength(0);
    });
  });

  describe('redactText', () => {
    beforeEach(async () => {
      mockNativeModule.initialize.mockResolvedValue(true);
      await initialize();
    });

    it('should redact PII from text', async () => {
      const mockResult = {
        originalText: 'Contact john@example.com',
        redactedText: 'Contact ****************',
        entities: [
          {
            type: 'email_address',
            text: 'john@example.com',
            startIndex: 8,
            endIndex: 24,
            confidence: 0.95,
          },
        ],
        processingTimeMs: 5.2,
      };

      mockNativeModule.redactText.mockResolvedValue(JSON.stringify(mockResult));

      const result = await redactText('Contact john@example.com');

      expect(result.redactedText).toBe('Contact ****************');
      expect(result.entities).toHaveLength(1);
      expect(result.processingTimeMs).toBeGreaterThan(0);
    });

    it('should preserve text without PII', async () => {
      const mockResult = {
        originalText: 'Hello world',
        redactedText: 'Hello world',
        entities: [],
        processingTimeMs: 1.5,
      };

      mockNativeModule.redactText.mockResolvedValue(JSON.stringify(mockResult));

      const result = await redactText('Hello world');

      expect(result.redactedText).toBe('Hello world');
      expect(result.entities).toHaveLength(0);
    });
  });

  describe('redactBatch', () => {
    beforeEach(async () => {
      mockNativeModule.initialize.mockResolvedValue(true);
      await initialize();
    });

    it('should redact multiple texts', async () => {
      const mockResults = [
        {
          originalText: 'Email: john@example.com',
          redactedText: 'Email: ****************',
          entities: [
            {
              type: 'email_address',
              text: 'john@example.com',
              startIndex: 7,
              endIndex: 23,
              confidence: 0.95,
            },
          ],
          processingTimeMs: 3.1,
        },
        {
          originalText: 'Phone: 555-123-4567',
          redactedText: 'Phone: ************',
          entities: [
            {
              type: 'phone_number',
              text: '555-123-4567',
              startIndex: 7,
              endIndex: 19,
              confidence: 0.95,
            },
          ],
          processingTimeMs: 2.8,
        },
      ];

      mockNativeModule.redactBatch.mockResolvedValue(
        JSON.stringify(mockResults),
      );

      const results = await redactBatch([
        'Email: john@example.com',
        'Phone: 555-123-4567',
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].redactedText).toContain('*');
      expect(results[1].redactedText).toContain('*');
    });
  });

  describe('addCustomPattern', () => {
    beforeEach(async () => {
      mockNativeModule.initialize.mockResolvedValue(true);
      await initialize();
    });

    it('should add custom regex pattern', async () => {
      mockNativeModule.addCustomPattern.mockResolvedValue(true);

      const result = await addCustomPattern(
        'employee_id',
        'EMP-[0-9]{6}',
        'employee_id',
      );

      expect(result).toBe(true);
      expect(mockNativeModule.addCustomPattern).toHaveBeenCalledWith(
        'employee_id',
        'EMP-[0-9]{6}',
        'employee_id',
      );
    });
  });

  describe('removeCustomPattern', () => {
    beforeEach(async () => {
      mockNativeModule.initialize.mockResolvedValue(true);
      await initialize();
    });

    it('should remove custom pattern', async () => {
      mockNativeModule.removeCustomPattern.mockResolvedValue(true);

      const result = await removeCustomPattern('employee_id');

      expect(result).toBe(true);
    });

    it('should return false for non-existent pattern', async () => {
      mockNativeModule.removeCustomPattern.mockResolvedValue(false);

      const result = await removeCustomPattern('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      mockNativeModule.initialize.mockResolvedValue(true);
      await initialize();
    });

    it('should return processing stats', async () => {
      const mockStats = {
        totalScanned: 100,
        totalRedacted: 45,
        byType: {
          email_address: 20,
          phone_number: 15,
          person: 10,
        },
        averageProcessingTimeMs: 4.5,
      };

      mockNativeModule.getStats.mockResolvedValue(JSON.stringify(mockStats));

      const stats = await getStats();

      expect(stats.totalScanned).toBe(100);
      expect(stats.totalRedacted).toBe(45);
      expect(stats.byType.email_address).toBe(20);
    });
  });

  describe('resetStats', () => {
    beforeEach(async () => {
      mockNativeModule.initialize.mockResolvedValue(true);
      await initialize();
    });

    it('should reset stats', async () => {
      mockNativeModule.resetStats.mockResolvedValue(true);

      const result = await resetStats();

      expect(result).toBe(true);
    });
  });
});
