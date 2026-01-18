import { by, device, element, expect } from 'detox';

describe('Local Intelligence E2E Tests', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  describe('Core Module', () => {
    it('should initialize successfully', async () => {
      // Navigate to core module test screen if needed
      // The app should show initialization status
      await expect(element(by.id('core-status'))).toBeVisible();
    });

    it('should report device capabilities', async () => {
      await element(by.id('check-capabilities-btn')).tap();
      await expect(element(by.id('capabilities-result'))).toBeVisible();
      // Verify platform is reported
      await expect(element(by.text(/platform/))).toBeVisible();
    });
  });

  describe('Semantic Search Module', () => {
    it('should initialize semantic search', async () => {
      await element(by.id('semantic-search-tab')).tap();
      await expect(element(by.id('semantic-search-status'))).toHaveText(
        'ready',
      );
    });

    it('should generate embeddings for text', async () => {
      await element(by.id('semantic-search-tab')).tap();
      await element(by.id('embedding-input')).typeText('Hello world');
      await element(by.id('generate-embedding-btn')).tap();

      // Wait for embedding generation
      await waitFor(element(by.id('embedding-result')))
        .toBeVisible()
        .withTimeout(10000);

      // Verify embedding has correct dimensions
      await expect(element(by.id('embedding-dimensions'))).toHaveText('384');
    });

    it('should perform semantic search', async () => {
      await element(by.id('semantic-search-tab')).tap();

      // Add some documents first
      await element(by.id('add-document-btn')).tap();
      await element(by.id('document-input')).typeText(
        'The quick brown fox jumps over the lazy dog',
      );
      await element(by.id('save-document-btn')).tap();

      // Search for similar content
      await element(by.id('search-input')).typeText('fast fox');
      await element(by.id('search-btn')).tap();

      await waitFor(element(by.id('search-results')))
        .toBeVisible()
        .withTimeout(10000);
    });
  });

  describe('PII Detection Module', () => {
    it('should initialize PII module', async () => {
      await element(by.id('pii-tab')).tap();
      await expect(element(by.id('pii-status'))).toHaveText('ready');
    });

    it('should detect email addresses', async () => {
      await element(by.id('pii-tab')).tap();
      await element(by.id('pii-input')).typeText(
        'Contact me at john@example.com',
      );
      await element(by.id('detect-pii-btn')).tap();

      await waitFor(element(by.id('pii-results')))
        .toBeVisible()
        .withTimeout(5000);

      await expect(element(by.text('email'))).toBeVisible();
    });

    it('should detect phone numbers', async () => {
      await element(by.id('pii-tab')).tap();
      await element(by.id('pii-input')).clearText();
      await element(by.id('pii-input')).typeText('Call me at 555-123-4567');
      await element(by.id('detect-pii-btn')).tap();

      await waitFor(element(by.id('pii-results')))
        .toBeVisible()
        .withTimeout(5000);

      await expect(element(by.text('phone'))).toBeVisible();
    });

    it('should redact PII from text', async () => {
      await element(by.id('pii-tab')).tap();
      await element(by.id('pii-input')).clearText();
      await element(by.id('pii-input')).typeText(
        'Email: test@test.com Phone: 555-555-5555',
      );
      await element(by.id('redact-btn')).tap();

      await waitFor(element(by.id('redacted-text')))
        .toBeVisible()
        .withTimeout(5000);

      // Verify PII is redacted (replaced with asterisks)
      await expect(element(by.id('redacted-text'))).not.toHaveText(
        'test@test.com',
      );
    });
  });

  describe('Sentiment Analysis Module', () => {
    it('should initialize sentiment module', async () => {
      await element(by.id('sentiment-tab')).tap();
      await expect(element(by.id('sentiment-status'))).toHaveText('ready');
    });

    it('should detect positive sentiment', async () => {
      await element(by.id('sentiment-tab')).tap();
      await element(by.id('sentiment-input')).typeText(
        'I love this amazing product! It is fantastic!',
      );
      await element(by.id('analyze-sentiment-btn')).tap();

      await waitFor(element(by.id('sentiment-result')))
        .toBeVisible()
        .withTimeout(5000);

      await expect(element(by.id('sentiment-label'))).toHaveText('positive');
    });

    it('should detect negative sentiment', async () => {
      await element(by.id('sentiment-tab')).tap();
      await element(by.id('sentiment-input')).clearText();
      await element(by.id('sentiment-input')).typeText(
        'This is terrible and awful. I hate it.',
      );
      await element(by.id('analyze-sentiment-btn')).tap();

      await waitFor(element(by.id('sentiment-result')))
        .toBeVisible()
        .withTimeout(5000);

      await expect(element(by.id('sentiment-label'))).toHaveText('negative');
    });

    it('should detect neutral sentiment', async () => {
      await element(by.id('sentiment-tab')).tap();
      await element(by.id('sentiment-input')).clearText();
      await element(by.id('sentiment-input')).typeText(
        'The meeting is scheduled for tomorrow at 3pm.',
      );
      await element(by.id('analyze-sentiment-btn')).tap();

      await waitFor(element(by.id('sentiment-result')))
        .toBeVisible()
        .withTimeout(5000);

      await expect(element(by.id('sentiment-label'))).toHaveText('neutral');
    });
  });

  describe('Model Download', () => {
    it('should download model with progress', async () => {
      await element(by.id('models-tab')).tap();
      await element(by.id('download-model-btn')).tap();

      // Verify progress indicator appears
      await waitFor(element(by.id('download-progress')))
        .toBeVisible()
        .withTimeout(5000);

      // Wait for download to complete (longer timeout for actual download)
      await waitFor(element(by.id('model-status')))
        .toHaveText('ready')
        .withTimeout(60000);
    });

    it('should handle download cancellation', async () => {
      await element(by.id('models-tab')).tap();
      await element(by.id('download-model-btn')).tap();

      // Wait for download to start
      await waitFor(element(by.id('download-progress')))
        .toBeVisible()
        .withTimeout(5000);

      // Cancel the download
      await element(by.id('cancel-download-btn')).tap();

      // Verify download was cancelled
      await expect(element(by.id('model-status'))).not.toHaveText(
        'downloading',
      );
    });
  });
});
