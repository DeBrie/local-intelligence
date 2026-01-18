export class LocalIntelligenceError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'LocalIntelligenceError';
    this.code = code;
  }
}

export class ModelNotFoundError extends LocalIntelligenceError {
  modelId: string;

  constructor(modelId: string) {
    super(`Model not found: ${modelId}`, 'MODEL_NOT_FOUND');
    this.name = 'ModelNotFoundError';
    this.modelId = modelId;
  }
}

export class ModelDownloadError extends LocalIntelligenceError {
  modelId: string;
  override cause: Error;

  constructor(modelId: string, cause: Error) {
    super(`Failed to download model: ${modelId}`, 'MODEL_DOWNLOAD_ERROR');
    this.name = 'ModelDownloadError';
    this.modelId = modelId;
    this.cause = cause;
  }
}

export class HardwareNotSupportedError extends LocalIntelligenceError {
  reason: string;
  ramGB: number;
  hasNPU: boolean;

  constructor(reason: string, ramGB: number, hasNPU: boolean) {
    super(`Hardware not supported: ${reason}`, 'HARDWARE_NOT_SUPPORTED');
    this.name = 'HardwareNotSupportedError';
    this.reason = reason;
    this.ramGB = ramGB;
    this.hasNPU = hasNPU;
  }
}

export class InferenceError extends LocalIntelligenceError {
  input: string;

  constructor(message: string, input: string) {
    super(message, 'INFERENCE_ERROR');
    this.name = 'InferenceError';
    this.input = input;
  }
}

export class InitializationError extends LocalIntelligenceError {
  constructor(message: string) {
    super(message, 'INITIALIZATION_ERROR');
    this.name = 'InitializationError';
  }
}

export class ModelValidationError extends LocalIntelligenceError {
  modelId: string;
  expectedSize?: number;
  actualSize?: number;

  constructor(
    modelId: string,
    message: string,
    expectedSize?: number,
    actualSize?: number,
  ) {
    super(message, 'MODEL_VALIDATION_ERROR');
    this.name = 'ModelValidationError';
    this.modelId = modelId;
    this.expectedSize = expectedSize;
    this.actualSize = actualSize;
  }
}

export class NetworkError extends LocalIntelligenceError {
  url: string;
  statusCode?: number;

  constructor(url: string, message: string, statusCode?: number) {
    super(message, 'NETWORK_ERROR');
    this.name = 'NetworkError';
    this.url = url;
    this.statusCode = statusCode;
  }
}

export class TokenizerError extends LocalIntelligenceError {
  constructor(message: string) {
    super(message, 'TOKENIZER_ERROR');
    this.name = 'TokenizerError';
  }
}

// Error codes for native module errors
export const ErrorCodes = {
  NOT_INITIALIZED: 'NOT_INITIALIZED',
  MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',
  MODEL_DOWNLOAD_ERROR: 'MODEL_DOWNLOAD_ERROR',
  MODEL_VALIDATION_ERROR: 'MODEL_VALIDATION_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  INFERENCE_ERROR: 'INFERENCE_ERROR',
  TOKENIZER_ERROR: 'TOKENIZER_ERROR',
  HARDWARE_NOT_SUPPORTED: 'HARDWARE_NOT_SUPPORTED',
  INITIALIZATION_ERROR: 'INITIALIZATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  TIMEOUT: 'TIMEOUT',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
