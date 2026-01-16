export class DebrieError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'DebrieError';
    this.code = code;
  }
}

export class ModelNotFoundError extends DebrieError {
  modelId: string;

  constructor(modelId: string) {
    super(`Model not found: ${modelId}`, 'MODEL_NOT_FOUND');
    this.name = 'ModelNotFoundError';
    this.modelId = modelId;
  }
}

export class ModelDownloadError extends DebrieError {
  modelId: string;
  override cause: Error;

  constructor(modelId: string, cause: Error) {
    super(`Failed to download model: ${modelId}`, 'MODEL_DOWNLOAD_ERROR');
    this.name = 'ModelDownloadError';
    this.modelId = modelId;
    this.cause = cause;
  }
}

export class HardwareNotSupportedError extends DebrieError {
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

export class InferenceError extends DebrieError {
  input: string;

  constructor(message: string, input: string) {
    super(message, 'INFERENCE_ERROR');
    this.name = 'InferenceError';
    this.input = input;
  }
}

export class InitializationError extends DebrieError {
  constructor(message: string) {
    super(message, 'INITIALIZATION_ERROR');
    this.name = 'InitializationError';
  }
}
