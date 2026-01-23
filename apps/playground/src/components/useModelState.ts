import { useState, useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import {
  initialize as initializeCore,
  getModelStatus as getCoreModelStatus,
  downloadModel as coreDownloadModel,
  deleteModel as coreDeleteModel,
  cancelDownload as coreCancelDownload,
  isReady as isCoreReady,
} from '@local-intelligence/core';
import type { ModelStatus } from '@local-intelligence/core';
import type { DownloadState, ActivityState, ModelCardState } from './ModelCard';

export interface UseModelStateOptions {
  modelId: string;
  onInitialize: () => Promise<void>;
  getIsModelReady?: () => Promise<boolean>;
  autoCheckStatus?: boolean;
}

export interface UseModelStateReturn {
  state: ModelCardState;
  isLoading: boolean;
  refresh: () => Promise<void>;
  handleDownload: () => Promise<void>;
  handleInitialize: () => Promise<void>;
  handleRedownload: () => Promise<void>;
  handleDelete: () => Promise<void>;
  handleCancelDownload: () => Promise<void>;
}

export function useModelState({
  modelId,
  onInitialize,
  getIsModelReady,
  autoCheckStatus = true,
}: UseModelStateOptions): UseModelStateReturn {
  const [isLoading, setIsLoading] = useState(true);
  const [state, setState] = useState<ModelCardState>({
    downloadState: 'not_downloaded',
    activityState: 'not_initialized',
    isDownloading: false,
    downloadProgress: 0,
    isInitializing: false,
  });

  const checkStatus = useCallback(async () => {
    try {
      // Ensure core is initialized
      if (!isCoreReady()) {
        await initializeCore();
      }

      // Get download status from core
      const coreStatus: ModelStatus = await getCoreModelStatus(modelId);

      let downloadState: DownloadState = 'not_downloaded';
      let diskSizeBytes: number | undefined;

      if (coreStatus.state === 'ready') {
        downloadState = 'ready';
        diskSizeBytes = coreStatus.sizeBytes;
      } else if (coreStatus.state === 'downloading') {
        downloadState = 'downloading';
      } else if (coreStatus.state === 'error') {
        downloadState = 'error';
      }

      // Check if model is initialized/ready for inference
      let activityState: ActivityState = 'not_initialized';
      if (getIsModelReady) {
        try {
          const isReady = await getIsModelReady();
          if (isReady) {
            activityState = 'initialized';
          }
        } catch {
          // Model ready check failed
        }
      }

      setState((prev) => ({
        ...prev,
        downloadState,
        activityState,
        diskSizeBytes,
        isDownloading: coreStatus.state === 'downloading',
        downloadProgress:
          coreStatus.state === 'downloading'
            ? (coreStatus.progress ?? 0) * 100
            : 0,
      }));
    } catch {
      // Status check failed
    } finally {
      setIsLoading(false);
    }
  }, [modelId, getIsModelReady]);

  useEffect(() => {
    if (autoCheckStatus) {
      checkStatus();
    }
  }, [autoCheckStatus, checkStatus]);

  const handleInitialize = useCallback(async () => {
    setState((prev) => ({ ...prev, isInitializing: true }));

    try {
      await onInitialize();
      setState((prev) => ({
        ...prev,
        activityState: 'initialized',
        isInitializing: false,
      }));
    } catch (error) {
      Alert.alert(
        'Initialize Failed',
        error instanceof Error ? error.message : 'Unknown error',
      );
      setState((prev) => ({ ...prev, isInitializing: false }));
    }
  }, [onInitialize]);

  const handleDownload = useCallback(async () => {
    setState((prev) => ({ ...prev, isDownloading: true, downloadProgress: 0 }));

    try {
      // Ensure core is initialized
      if (!isCoreReady()) {
        await initializeCore();
      }

      await coreDownloadModel(modelId, {
        onProgress: (progress) => {
          setState((prev) => ({
            ...prev,
            downloadProgress: progress.progress * 100,
          }));
        },
      });

      setState((prev) => ({
        ...prev,
        downloadState: 'ready',
        isDownloading: false,
        downloadProgress: 100,
      }));

      // Auto-initialize after download
      setState((prev) => ({ ...prev, isInitializing: true }));
      try {
        await onInitialize();
        setState((prev) => ({
          ...prev,
          activityState: 'initialized',
          isInitializing: false,
        }));
      } catch (initError) {
        Alert.alert(
          'Initialize Failed',
          initError instanceof Error ? initError.message : 'Unknown error',
        );
        setState((prev) => ({ ...prev, isInitializing: false }));
      }
    } catch (error) {
      Alert.alert(
        'Download Failed',
        error instanceof Error ? error.message : 'Unknown error',
      );
      setState((prev) => ({
        ...prev,
        isDownloading: false,
        downloadProgress: 0,
      }));
    }
  }, [modelId, onInitialize]);

  const handleRedownload = useCallback(async () => {
    Alert.alert(
      'Re-download Model',
      'This will delete and re-download the model. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Re-download',
          onPress: async () => {
            try {
              await coreDeleteModel(modelId);
              setState((prev) => ({
                ...prev,
                downloadState: 'not_downloaded',
                activityState: 'not_initialized',
              }));
              await handleDownload();
            } catch (error) {
              Alert.alert(
                'Re-download Failed',
                error instanceof Error ? error.message : 'Unknown error',
              );
            }
          },
        },
      ],
    );
  }, [modelId, handleDownload]);

  const handleDelete = useCallback(async () => {
    Alert.alert(
      'Delete Model',
      'Are you sure you want to delete this model? You will need to re-download it to use this feature.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await coreDeleteModel(modelId);
              setState((prev) => ({
                ...prev,
                downloadState: 'not_downloaded',
                activityState: 'not_initialized',
                diskSizeBytes: undefined,
              }));
              Alert.alert('Success', 'Model deleted successfully');
            } catch (error) {
              Alert.alert(
                'Delete Failed',
                error instanceof Error ? error.message : 'Unknown error',
              );
            }
          },
        },
      ],
    );
  }, [modelId]);

  const handleCancelDownload = useCallback(async () => {
    try {
      await coreCancelDownload(modelId);
      setState((prev) => ({
        ...prev,
        isDownloading: false,
        downloadProgress: 0,
      }));
    } catch (error) {
      Alert.alert(
        'Cancel Failed',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }, [modelId]);

  return {
    state,
    isLoading,
    refresh: checkStatus,
    handleDownload,
    handleInitialize,
    handleRedownload,
    handleDelete,
    handleCancelDownload,
  };
}
