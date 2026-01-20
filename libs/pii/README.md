# @local-intelligence/pii

On-device PII (Personally Identifiable Information) detection for React Native. Identify and redact sensitive data without sending it to the cloud.

## Installation

```bash
npm install @local-intelligence/pii @local-intelligence/core
```

## Features

- **On-device detection** - All processing happens locally
- **BERT-based model** - Accurate entity recognition
- **Multiple entity types** - Names, emails, phones, addresses, SSNs, credit cards
- **Redaction** - Automatically mask sensitive information

## Usage

```typescript
import { initialize, downloadModel, detectPII, redactPII } from '@local-intelligence/pii';

// Initialize and download model (~38MB)
await initialize();
await downloadModel();

// Detect PII entities
const result = await detectPII('Contact John Smith at john@email.com');
console.log(result.entities);
// [{ type: 'PERSON', text: 'John Smith', confidence: 0.92 },
//  { type: 'EMAIL', text: 'john@email.com', confidence: 0.98 }]

// Redact PII
const redacted = await redactPII('Call me at 555-123-4567');
console.log(redacted.redactedText); // 'Call me at [PHONE]'
```

## Supported Entity Types

| Type          | Examples                |
| ------------- | ----------------------- |
| `PERSON`      | Names                   |
| `EMAIL`       | Email addresses         |
| `PHONE`       | Phone numbers           |
| `ADDRESS`     | Physical addresses      |
| `SSN`         | Social Security Numbers |
| `CREDIT_CARD` | Credit card numbers     |

## Platform Support

| Platform | Minimum Version |
| -------- | --------------- |
| iOS      | 15.0            |
| Android  | API 24          |

## License

MIT
