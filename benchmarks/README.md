# Local Intelligence Benchmarks

This directory contains accuracy benchmarks for all ML models used in Local Intelligence.

## Benchmark Datasets

### PII Detection

- **Dataset**: Custom PII benchmark based on CoNLL-2003 and OntoNotes patterns
- **Expected Accuracy**: >85% F1 score for named entities, >95% for regex-based patterns
- **Test file**: `pii_benchmark.ts`

### Sentiment Analysis

- **Dataset**: SST-2 (Stanford Sentiment Treebank)
- **Expected Accuracy**: ~91% accuracy with DistilBERT-SST2
- **Test file**: `sentiment_benchmark.ts`

### Semantic Search

- **Dataset**: STS-B (Semantic Textual Similarity Benchmark)
- **Expected Accuracy**: >0.75 Spearman correlation
- **Test file**: `semantic_benchmark.ts`

## Running Benchmarks

```bash
# Install dependencies
npm install

# Run all benchmarks
npm run benchmark

# Run specific benchmark
npm run benchmark:pii
npm run benchmark:sentiment
npm run benchmark:semantic
```

## CI/CD Integration

Benchmarks are automatically run on:

- Pull requests that modify model-related code
- Model updates (when new versions are uploaded to CDN)
- Weekly scheduled runs

See `.github/workflows/benchmarks.yml` for the CI configuration.

## Accuracy Thresholds

| Model           | Metric   | Minimum | Target |
| --------------- | -------- | ------- | ------ |
| bert-small-pii  | F1 Score | 0.80    | 0.90   |
| distilbert-sst2 | Accuracy | 0.88    | 0.91   |
| minilm-l6-v2    | Spearman | 0.70    | 0.78   |

If any benchmark falls below the minimum threshold, the CI pipeline will fail.
