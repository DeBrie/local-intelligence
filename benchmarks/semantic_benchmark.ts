/**
 * Semantic Search Benchmark
 * Tests embedding quality against STS-B style similarity pairs
 */

interface SemanticTestCase {
  text1: string;
  text2: string;
  similarityScore: number; // 0-5 scale from STS-B
}

// STS-B style test cases (similarity score 0-5)
const testCases: SemanticTestCase[] = [
  // High similarity (4-5)
  {
    text1: 'A man is playing a guitar.',
    text2: 'A person is playing a musical instrument.',
    similarityScore: 4.5,
  },
  {
    text1: 'The cat is sleeping on the couch.',
    text2: 'A cat sleeps on the sofa.',
    similarityScore: 4.8,
  },
  {
    text1: 'The weather is beautiful today.',
    text2: 'It is a lovely day outside.',
    similarityScore: 4.2,
  },
  {
    text1: 'She is reading a book.',
    text2: 'A woman reads a novel.',
    similarityScore: 4.3,
  },
  {
    text1: 'The children are playing in the park.',
    text2: 'Kids are having fun at the playground.',
    similarityScore: 4.0,
  },

  // Medium similarity (2-4)
  {
    text1: 'A dog is running in the field.',
    text2: 'An animal is moving quickly.',
    similarityScore: 3.2,
  },
  {
    text1: 'The restaurant serves Italian food.',
    text2: 'You can eat pasta there.',
    similarityScore: 3.0,
  },
  {
    text1: 'He is driving a car.',
    text2: 'Someone is traveling by vehicle.',
    similarityScore: 3.5,
  },
  {
    text1: 'The movie was entertaining.',
    text2: 'The film had good reviews.',
    similarityScore: 2.8,
  },
  {
    text1: 'She works at a hospital.',
    text2: 'Her job is in healthcare.',
    similarityScore: 3.3,
  },

  // Low similarity (1-2)
  {
    text1: 'The sun is shining brightly.',
    text2: 'It is raining heavily.',
    similarityScore: 1.0,
  },
  {
    text1: 'He loves to cook dinner.',
    text2: 'She enjoys watching movies.',
    similarityScore: 1.2,
  },
  {
    text1: 'The computer is on the desk.',
    text2: 'The garden needs watering.',
    similarityScore: 0.5,
  },
  {
    text1: 'They went to the beach.',
    text2: 'The meeting was postponed.',
    similarityScore: 0.3,
  },
  {
    text1: 'The book is on the shelf.',
    text2: 'The car needs fuel.',
    similarityScore: 0.2,
  },

  // Semantic equivalence with different wording
  {
    text1: 'How do I reset my password?',
    text2: 'I forgot my password, how can I change it?',
    similarityScore: 4.7,
  },
  {
    text1: 'What is the return policy?',
    text2: 'Can I get a refund if I am not satisfied?',
    similarityScore: 4.0,
  },
  {
    text1: 'The package has not arrived yet.',
    text2: 'My order is still in transit.',
    similarityScore: 4.2,
  },
  {
    text1: 'I need help with my account.',
    text2: 'There is an issue with my profile.',
    similarityScore: 3.8,
  },
  {
    text1: 'When will the product be back in stock?',
    text2: 'Is this item available for purchase?',
    similarityScore: 3.5,
  },
];

interface BenchmarkResult {
  totalPairs: number;
  spearmanCorrelation: number;
  pearsonCorrelation: number;
  meanAbsoluteError: number;
  predictions: Array<{ expected: number; predicted: number }>;
}

export async function runSemanticBenchmark(
  generateEmbedding: (text: string) => Promise<number[]>,
): Promise<BenchmarkResult> {
  const predictions: Array<{ expected: number; predicted: number }> = [];

  for (const testCase of testCases) {
    const embedding1 = await generateEmbedding(testCase.text1);
    const embedding2 = await generateEmbedding(testCase.text2);

    // Calculate cosine similarity
    const similarity = cosineSimilarity(embedding1, embedding2);

    // Scale from [-1, 1] to [0, 5] to match STS-B scale
    const scaledSimilarity = ((similarity + 1) / 2) * 5;

    predictions.push({
      expected: testCase.similarityScore,
      predicted: scaledSimilarity,
    });
  }

  const expectedValues = predictions.map((p) => p.expected);
  const predictedValues = predictions.map((p) => p.predicted);

  const spearmanCorrelation = calculateSpearmanCorrelation(
    expectedValues,
    predictedValues,
  );
  const pearsonCorrelation = calculatePearsonCorrelation(
    expectedValues,
    predictedValues,
  );
  const meanAbsoluteError = calculateMAE(expectedValues, predictedValues);

  return {
    totalPairs: testCases.length,
    spearmanCorrelation,
    pearsonCorrelation,
    meanAbsoluteError,
    predictions,
  };
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

function calculateSpearmanCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  const rankX = getRanks(x);
  const rankY = getRanks(y);

  let sumDiffSquared = 0;
  for (let i = 0; i < n; i++) {
    const diff = rankX[i] - rankY[i];
    sumDiffSquared += diff * diff;
  }

  return 1 - (6 * sumDiffSquared) / (n * (n * n - 1));
}

function getRanks(arr: number[]): number[] {
  const sorted = arr
    .map((val, idx) => ({ val, idx }))
    .sort((a, b) => a.val - b.val);
  const ranks = new Array(arr.length);

  for (let i = 0; i < sorted.length; i++) {
    ranks[sorted[i].idx] = i + 1;
  }

  return ranks;
}

function calculatePearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const diffX = x[i] - meanX;
    const diffY = y[i] - meanY;
    numerator += diffX * diffY;
    denomX += diffX * diffX;
    denomY += diffY * diffY;
  }

  const denominator = Math.sqrt(denomX) * Math.sqrt(denomY);
  return denominator === 0 ? 0 : numerator / denominator;
}

function calculateMAE(expected: number[], predicted: number[]): number {
  let sum = 0;
  for (let i = 0; i < expected.length; i++) {
    sum += Math.abs(expected[i] - predicted[i]);
  }
  return sum / expected.length;
}

// Thresholds based on MiniLM expected performance
export const SEMANTIC_THRESHOLDS = {
  minSpearman: 0.7,
  targetSpearman: 0.78,
  maxMAE: 1.0,
};

export function validateSemanticBenchmark(result: BenchmarkResult): boolean {
  return result.spearmanCorrelation >= SEMANTIC_THRESHOLDS.minSpearman;
}
