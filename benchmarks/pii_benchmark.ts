/**
 * PII Detection Benchmark
 * Tests accuracy against a curated dataset of PII patterns
 */

interface PIITestCase {
  text: string;
  expected: Array<{
    type: string;
    text: string;
    startIndex: number;
    endIndex: number;
  }>;
}

// Test cases covering various PII types
const testCases: PIITestCase[] = [
  // Email addresses
  {
    text: 'Contact me at john.doe@example.com for more info.',
    expected: [
      {
        type: 'email_address',
        text: 'john.doe@example.com',
        startIndex: 14,
        endIndex: 34,
      },
    ],
  },
  {
    text: 'Send to support@company.org or sales@company.org',
    expected: [
      {
        type: 'email_address',
        text: 'support@company.org',
        startIndex: 8,
        endIndex: 27,
      },
      {
        type: 'email_address',
        text: 'sales@company.org',
        startIndex: 31,
        endIndex: 48,
      },
    ],
  },

  // Phone numbers
  {
    text: 'Call us at (555) 123-4567 or +1-800-555-0199',
    expected: [
      {
        type: 'phone_number',
        text: '(555) 123-4567',
        startIndex: 11,
        endIndex: 25,
      },
      {
        type: 'phone_number',
        text: '+1-800-555-0199',
        startIndex: 29,
        endIndex: 44,
      },
    ],
  },

  // SSN (with dashes - required format)
  {
    text: 'My SSN is 123-45-6789 for the application.',
    expected: [
      { type: 'us_ssn', text: '123-45-6789', startIndex: 10, endIndex: 21 },
    ],
  },
  {
    text: 'Social Security: 456-78-9012',
    expected: [
      { type: 'us_ssn', text: '456-78-9012', startIndex: 17, endIndex: 28 },
    ],
  },

  // Credit cards
  {
    text: 'Card number: 4111-1111-1111-1111',
    expected: [
      {
        type: 'credit_card',
        text: '4111-1111-1111-1111',
        startIndex: 13,
        endIndex: 32,
      },
    ],
  },

  // IP addresses
  {
    text: 'Server IP: 192.168.1.100 and gateway 10.0.0.1',
    expected: [
      {
        type: 'ip_address',
        text: '192.168.1.100',
        startIndex: 11,
        endIndex: 24,
      },
      { type: 'ip_address', text: '10.0.0.1', startIndex: 37, endIndex: 45 },
    ],
  },

  // Named entities (require BERT model)
  {
    text: 'John Smith works at Microsoft in Seattle.',
    expected: [
      { type: 'person', text: 'John Smith', startIndex: 0, endIndex: 10 },
      { type: 'organization', text: 'Microsoft', startIndex: 20, endIndex: 29 },
      { type: 'location', text: 'Seattle', startIndex: 33, endIndex: 40 },
    ],
  },

  // Mixed PII
  {
    text: 'Jane Doe (jane@email.com, 555-123-4567) lives at 123 Main Street.',
    expected: [
      { type: 'person', text: 'Jane Doe', startIndex: 0, endIndex: 8 },
      {
        type: 'email_address',
        text: 'jane@email.com',
        startIndex: 10,
        endIndex: 24,
      },
      {
        type: 'phone_number',
        text: '555-123-4567',
        startIndex: 26,
        endIndex: 38,
      },
      {
        type: 'address',
        text: '123 Main Street',
        startIndex: 49,
        endIndex: 64,
      },
    ],
  },

  // False positive tests (should NOT match)
  {
    text: 'The year 2023 was great. Order #123456789.',
    expected: [], // 9-digit number without SSN format should not match
  },
  {
    text: 'ZIP+4: 12345-6789 is not an SSN.',
    expected: [], // ZIP+4 format should not match SSN
  },
];

interface BenchmarkResult {
  totalCases: number;
  passedCases: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1Score: number;
}

export async function runPIIBenchmark(
  detectEntities: (
    text: string,
  ) => Promise<
    Array<{ type: string; text: string; startIndex: number; endIndex: number }>
  >,
): Promise<BenchmarkResult> {
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  let passedCases = 0;

  for (const testCase of testCases) {
    const detected = await detectEntities(testCase.text);
    const expected = testCase.expected;

    // Check for matches
    const matchedExpected = new Set<number>();
    const matchedDetected = new Set<number>();

    for (let i = 0; i < detected.length; i++) {
      const det = detected[i];
      for (let j = 0; j < expected.length; j++) {
        if (matchedExpected.has(j)) continue;

        const exp = expected[j];
        // Fuzzy matching: type must match, text overlap > 80%
        if (det.type === exp.type) {
          const overlap = calculateOverlap(det, exp);
          if (overlap > 0.8) {
            matchedExpected.add(j);
            matchedDetected.add(i);
            truePositives++;
            break;
          }
        }
      }
    }

    // Count false positives (detected but not expected)
    falsePositives += detected.length - matchedDetected.size;

    // Count false negatives (expected but not detected)
    falseNegatives += expected.length - matchedExpected.size;

    // Case passes if all expected are found and no false positives
    if (
      matchedExpected.size === expected.length &&
      matchedDetected.size === detected.length
    ) {
      passedCases++;
    }
  }

  const precision = truePositives / (truePositives + falsePositives) || 0;
  const recall = truePositives / (truePositives + falseNegatives) || 0;
  const f1Score = (2 * precision * recall) / (precision + recall) || 0;

  return {
    totalCases: testCases.length,
    passedCases,
    truePositives,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    f1Score,
  };
}

function calculateOverlap(
  a: { startIndex: number; endIndex: number },
  b: { startIndex: number; endIndex: number },
): number {
  const overlapStart = Math.max(a.startIndex, b.startIndex);
  const overlapEnd = Math.min(a.endIndex, b.endIndex);
  const overlapLength = Math.max(0, overlapEnd - overlapStart);

  const aLength = a.endIndex - a.startIndex;
  const bLength = b.endIndex - b.startIndex;
  const unionLength = aLength + bLength - overlapLength;

  return overlapLength / unionLength;
}

// Thresholds
export const PII_THRESHOLDS = {
  minF1Score: 0.8,
  targetF1Score: 0.9,
  minPrecision: 0.85,
  minRecall: 0.75,
};

export function validatePIIBenchmark(result: BenchmarkResult): boolean {
  return result.f1Score >= PII_THRESHOLDS.minF1Score;
}
