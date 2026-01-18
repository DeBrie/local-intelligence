export interface CoreConfig {
  modelCacheDir?: string;
  cdnBaseUrl?: string;
  maxConcurrentDownloads?: number;
  enableLogging?: boolean;
}

export interface DeviceCapabilities {
  platform: 'ios' | 'android';
  osVersion: string;
  hasNPU: boolean;
  hasGPU: boolean;
  ramGB: number;
  supportsFoundationModels: boolean;
  supportedDelegates: Array<'nnapi' | 'gpu' | 'cpu'>;
}

export type ModelState = 'not_downloaded' | 'downloading' | 'ready' | 'error';

export interface ModelStatusNotDownloaded {
  state: 'not_downloaded';
}

export interface ModelStatusDownloading {
  state: 'downloading';
  progress: number;
}

export interface ModelStatusReady {
  state: 'ready';
  sizeBytes: number;
  path: string;
}

export interface ModelStatusError {
  state: 'error';
  message: string;
}

export type ModelStatus =
  | ModelStatusNotDownloaded
  | ModelStatusDownloading
  | ModelStatusReady
  | ModelStatusError;

export interface ModelInfo {
  id: string;
  name: string;
  version: string;
  sizeBytes: number;
  platform: 'ios' | 'android' | 'both';
  format: 'tflite' | 'coreml' | 'onnx' | 'pte';
}

export interface ModelMetadata {
  id: string;
  name: string;
  version: string;
  format: 'tflite' | 'coreml' | 'onnx' | 'pte';
  size_bytes: number;
  min_sdk_version?: string;
  checksum?: string;
  checksum_algorithm?: 'sha256' | 'md5';
  created_at?: string;
  description?: string;
  labels?: string[];
}

export interface DownloadProgress {
  modelId: string;
  bytesDownloaded: number;
  totalBytes: number;
  progress: number;
}

export type DownloadProgressCallback = (progress: DownloadProgress) => void;

export interface ModelVersion {
  version: string;
  releaseDate: string;
  changelog?: string;
  isLatest: boolean;
}
