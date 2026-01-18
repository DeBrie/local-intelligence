/**
 * Sentiment Analysis Benchmark
 * Tests accuracy against SST-2 style test cases
 */

interface SentimentTestCase {
  text: string;
  expected: 'positive' | 'negative';
}

// SST-2 style test cases
const testCases: SentimentTestCase[] = [
  // Clearly positive
  {
    text: 'This movie was absolutely fantastic! I loved every minute of it.',
    expected: 'positive',
  },
  {
    text: 'An excellent product that exceeded all my expectations.',
    expected: 'positive',
  },
  {
    text: 'The service was outstanding and the staff were incredibly helpful.',
    expected: 'positive',
  },
  {
    text: 'I am so happy with this purchase, best decision ever!',
    expected: 'positive',
  },
  {
    text: 'Brilliant performance, truly a masterpiece of cinema.',
    expected: 'positive',
  },
  {
    text: 'The food was delicious and the atmosphere was perfect.',
    expected: 'positive',
  },
  {
    text: 'Highly recommend this to everyone, you will not be disappointed.',
    expected: 'positive',
  },
  {
    text: 'A wonderful experience from start to finish.',
    expected: 'positive',
  },
  {
    text: 'The team did an amazing job delivering on time.',
    expected: 'positive',
  },
  {
    text: 'I could not be more pleased with the results.',
    expected: 'positive',
  },

  // Clearly negative
  { text: 'This was the worst movie I have ever seen.', expected: 'negative' },
  {
    text: 'Terrible quality, broke after just one day of use.',
    expected: 'negative',
  },
  {
    text: 'The customer service was rude and unhelpful.',
    expected: 'negative',
  },
  {
    text: 'Complete waste of money, do not buy this product.',
    expected: 'negative',
  },
  {
    text: 'Disappointed with the poor quality and slow delivery.',
    expected: 'negative',
  },
  {
    text: 'The food was cold and tasteless, never going back.',
    expected: 'negative',
  },
  {
    text: 'Avoid this place at all costs, horrible experience.',
    expected: 'negative',
  },
  {
    text: 'The software is buggy and crashes constantly.',
    expected: 'negative',
  },
  {
    text: 'I regret buying this, it does not work as advertised.',
    expected: 'negative',
  },
  {
    text: 'Frustrating and time-consuming, not worth the effort.',
    expected: 'negative',
  },

  // More nuanced cases
  {
    text: 'While the plot was predictable, the acting was superb.',
    expected: 'positive',
  },
  { text: 'Not bad, but I expected more for the price.', expected: 'negative' },
  {
    text: 'The concept is great but the execution falls short.',
    expected: 'negative',
  },
  {
    text: 'Despite some flaws, overall a very enjoyable experience.',
    expected: 'positive',
  },
  { text: 'Started slow but ended on a high note.', expected: 'positive' },
  {
    text: 'Looked promising but ultimately disappointing.',
    expected: 'negative',
  },
  {
    text: 'A solid effort that delivers on its promises.',
    expected: 'positive',
  },
  { text: 'Mediocre at best, nothing special about it.', expected: 'negative' },
  {
    text: 'Exceeded my low expectations, pleasantly surprised.',
    expected: 'positive',
  },
  { text: 'Had potential but failed to deliver.', expected: 'negative' },
];

interface BenchmarkResult {
  totalCases: number;
  correctPredictions: number;
  accuracy: number;
  truePositives: number;
  trueNegatives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1Score: number;
}

export async function runSentimentBenchmark(
  analyzeSentiment: (
    text: string,
  ) => Promise<{ label: 'positive' | 'negative'; confidence: number }>,
): Promise<BenchmarkResult> {
  let correctPredictions = 0;
  let truePositives = 0;
  let trueNegatives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;

  for (const testCase of testCases) {
    const result = await analyzeSentiment(testCase.text);
    const predicted = result.label;
    const expected = testCase.expected;

    if (predicted === expected) {
      correctPredictions++;
      if (expected === 'positive') {
        truePositives++;
      } else {
        trueNegatives++;
      }
    } else {
      if (predicted === 'positive') {
        falsePositives++;
      } else {
        falseNegatives++;
      }
    }
  }

  const accuracy = correctPredictions / testCases.length;
  const precision = truePositives / (truePositives + falsePositives) || 0;
  const recall = truePositives / (truePositives + falseNegatives) || 0;
  const f1Score = (2 * precision * recall) / (precision + recall) || 0;

  return {
    totalCases: testCases.length,
    correctPredictions,
    accuracy,
    truePositives,
    trueNegatives,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    f1Score,
  };
}

// Thresholds based on DistilBERT-SST2 expected performance
export const SENTIMENT_THRESHOLDS = {
  minAccuracy: 0.88,
  targetAccuracy: 0.91,
  minF1Score: 0.85,
};

export function validateSentimentBenchmark(result: BenchmarkResult): boolean {
  return result.accuracy >= SENTIMENT_THRESHOLDS.minAccuracy;
}
