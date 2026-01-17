export {
  initialize,
  getDeviceCapabilities,
  getModelStatus,
  downloadModel,
  cancelDownload,
  deleteModel,
  clearModelCache,
  getCacheSize,
  isReady,
  getConfig,
} from './LocalIntelligenceCore';

export type {
  CoreConfig,
  DeviceCapabilities,
  ModelStatus,
  ModelStatusNotDownloaded,
  ModelStatusDownloading,
  ModelStatusReady,
  ModelStatusError,
  ModelState,
  ModelInfo,
  DownloadProgress,
  DownloadProgressCallback,
} from './types';

export {
  LocalIntelligenceError,
  ModelNotFoundError,
  ModelDownloadError,
  HardwareNotSupportedError,
  InferenceError,
  InitializationError,
} from './errors';
