import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    Platform,
    RefreshControl,
} from 'react-native';
import {
    initialize as initializeCore,
    getModelStatus,
    downloadModel,
    deleteModel,
    cancelDownload,
    getCacheSize,
    isReady as isCoreReady,
} from '@local-intelligence/core';
import type { ModelStatus } from '@local-intelligence/core';
import { initialize as initializeSentiment } from '@local-intelligence/sentiment';
import { initialize as initializePII } from '@local-intelligence/pii';

// Model definitions for each platform
interface ModelDefinition {
    id: string;
    name: string;
    description: string;
    version: string;
    sizeBytes: number;
    format: 'onnx' | 'tflite' | 'coreml';
    platform: 'ios' | 'android' | 'both';
    usedBy: string[];
    required: boolean;
}

const MODEL_DEFINITIONS: ModelDefinition[] = [
    {
        id: 'distilbert-sst2',
        name: 'DistilBERT SST-2',
        description: 'Sentiment analysis model for 3-class classification',
        version: '1.0.0',
        sizeBytes: 67_000_000,
        format: 'onnx',
        platform: 'both',
        usedBy: ['Sentiment Analysis'],
        required: false,
    },
    {
        id: 'bert-small-pii',
        name: 'BERT Small PII',
        description: 'Personal information detection model',
        version: '1.0.0',
        sizeBytes: 30_000_000,
        format: 'onnx',
        platform: 'both',
        usedBy: ['PII Redaction'],
        required: false,
    },
    {
        id: 'minilm-l6-v2',
        name: 'MiniLM-L6-v2',
        description: 'Sentence embeddings for semantic search',
        version: '1.0.0',
        sizeBytes: 23_000_000,
        format: 'tflite',
        platform: 'android',
        usedBy: ['Semantic Search'],
        required: true,
    },
];

type ActivityState = 'not_initialized' | 'initialized' | 'in_memory' | 'unloaded';

interface ModelState {
    definition: ModelDefinition;
    downloadStatus: ModelStatus;
    activityState: ActivityState;
    isDownloading: boolean;
    downloadProgress: number;
    isInitializing: boolean;
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function ModelManagementScreen() {
    const [models, setModels] = useState<ModelState[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [totalCacheSize, setTotalCacheSize] = useState(0);
    const [coreInitialized, setCoreInitialized] = useState(false);

    const initCore = useCallback(async () => {
        if (!isCoreReady()) {
            try {
                await initializeCore();
                setCoreInitialized(true);
            } catch {
                setCoreInitialized(false);
            }
        } else {
            setCoreInitialized(true);
        }
    }, []);

    const loadModelStates = useCallback(async () => {
        const platformModels = MODEL_DEFINITIONS.filter(
            (m) => m.platform === 'both' || m.platform === Platform.OS
        );

        const states: ModelState[] = await Promise.all(
            platformModels.map(async (definition) => {
                let downloadStatus: ModelStatus = { state: 'not_downloaded' };
                try {
                    downloadStatus = await getModelStatus(definition.id);
                } catch {
                    // Model status check failed
                }

                return {
                    definition,
                    downloadStatus,
                    activityState: 'not_initialized' as ActivityState,
                    isDownloading: downloadStatus.state === 'downloading',
                    downloadProgress:
                        downloadStatus.state === 'downloading'
                            ? downloadStatus.progress
                            : 0,
                    isInitializing: false,
                };
            })
        );

        setModels(states);

        try {
            const cacheSize = await getCacheSize();
            setTotalCacheSize(cacheSize);
        } catch {
            // Cache size check failed
        }
    }, []);

    useEffect(() => {
        const init = async () => {
            setIsLoading(true);
            await initCore();
            await loadModelStates();
            setIsLoading(false);
        };
        init();
    }, [initCore, loadModelStates]);

    const onRefresh = useCallback(async () => {
        setIsRefreshing(true);
        await loadModelStates();
        setIsRefreshing(false);
    }, [loadModelStates]);

    const handleDownload = async (modelId: string) => {
        setModels((prev) =>
            prev.map((m) =>
                m.definition.id === modelId
                    ? { ...m, isDownloading: true, downloadProgress: 0 }
                    : m
            )
        );

        try {
            await downloadModel(modelId, {
                onProgress: (progress) => {
                    setModels((prev) =>
                        prev.map((m) =>
                            m.definition.id === modelId
                                ? { ...m, downloadProgress: progress.progress * 100 }
                                : m
                        )
                    );
                },
            });

            await loadModelStates();
            Alert.alert('Success', 'Model downloaded successfully');
        } catch (error) {
            Alert.alert(
                'Download Failed',
                error instanceof Error ? error.message : 'Unknown error'
            );
            setModels((prev) =>
                prev.map((m) =>
                    m.definition.id === modelId
                        ? { ...m, isDownloading: false, downloadProgress: 0 }
                        : m
                )
            );
        }
    };

    const handleCancelDownload = async (modelId: string) => {
        try {
            await cancelDownload(modelId);
            setModels((prev) =>
                prev.map((m) =>
                    m.definition.id === modelId
                        ? { ...m, isDownloading: false, downloadProgress: 0 }
                        : m
                )
            );
        } catch (error) {
            Alert.alert(
                'Cancel Failed',
                error instanceof Error ? error.message : 'Unknown error'
            );
        }
    };

    const handleDelete = async (modelId: string, modelName: string) => {
        Alert.alert(
            'Delete Model',
            `Are you sure you want to delete ${modelName}? You will need to re-download it to use this feature.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteModel(modelId);
                            await loadModelStates();
                            Alert.alert('Success', 'Model deleted successfully');
                        } catch (error) {
                            Alert.alert(
                                'Delete Failed',
                                error instanceof Error ? error.message : 'Unknown error'
                            );
                        }
                    },
                },
            ]
        );
    };

    const handleRedownload = async (modelId: string, modelName: string) => {
        Alert.alert(
            'Re-download Model',
            `This will delete and re-download ${modelName}. Continue?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Re-download',
                    onPress: async () => {
                        try {
                            await deleteModel(modelId);
                            await handleDownload(modelId);
                        } catch (error) {
                            Alert.alert(
                                'Re-download Failed',
                                error instanceof Error ? error.message : 'Unknown error'
                            );
                        }
                    },
                },
            ]
        );
    };

    const handleInitializeModel = async (modelId: string, modelName: string) => {
        setModels((prev) =>
            prev.map((m) =>
                m.definition.id === modelId
                    ? { ...m, isInitializing: true }
                    : m
            )
        );

        try {
            if (modelId === 'distilbert-sst2') {
                await initializeSentiment({
                    minConfidence: 0.5,
                    defaultLabel: 'neutral',
                    enableCaching: true,
                    maxCacheSize: 100,
                });
            } else if (modelId === 'bert-small-pii') {
                await initializePII({
                    enabledTypes: [
                        'person',
                        'organization',
                        'location',
                        'email_address',
                        'phone_number',
                        'us_ssn',
                        'credit_card',
                    ],
                    redactionChar: '*',
                    minConfidence: 0.7,
                    preserveLength: true,
                });
            } else {
                throw new Error(`No initializer available for model: ${modelId}`);
            }

            setModels((prev) =>
                prev.map((m) =>
                    m.definition.id === modelId
                        ? { ...m, activityState: 'initialized' as ActivityState, isInitializing: false }
                        : m
                )
            );
            Alert.alert('Success', `${modelName} initialized successfully`);
        } catch (error) {
            setModels((prev) =>
                prev.map((m) =>
                    m.definition.id === modelId
                        ? { ...m, isInitializing: false }
                        : m
                )
            );
            Alert.alert(
                'Initialize Failed',
                error instanceof Error ? error.message : 'Unknown error'
            );
        }
    };

    const getDownloadStatusBadge = (status: ModelStatus) => {
        switch (status.state) {
            case 'ready':
                return { text: 'Downloaded', color: '#4CAF50' };
            case 'downloading':
                return { text: 'Downloading', color: '#2196F3' };
            case 'not_downloaded':
                return { text: 'Not Downloaded', color: '#FF9800' };
            case 'error':
                return { text: 'Error', color: '#F44336' };
            default:
                return { text: 'Unknown', color: '#9E9E9E' };
        }
    };

    const getActivityBadge = (state: ActivityState) => {
        switch (state) {
            case 'in_memory':
                return { text: 'In Memory', color: '#4CAF50' };
            case 'initialized':
                return { text: 'Initialized', color: '#8BC34A' };
            case 'unloaded':
                return { text: 'Unloaded', color: '#FF9800' };
            case 'not_initialized':
            default:
                return { text: 'Not Initialized', color: '#9E9E9E' };
        }
    };

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={styles.loadingText}>Loading models...</Text>
            </View>
        );
    }

    return (
        <ScrollView
            style={styles.container}
            refreshControl={
                <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
            }
        >
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.title}>Model Management</Text>
                <Text style={styles.subtitle}>
                    Platform: {Platform.OS === 'ios' ? 'iOS' : 'Android'}
                </Text>
            </View>

            {/* Cache Info */}
            <View style={styles.cacheCard}>
                <View style={styles.cacheRow}>
                    <Text style={styles.cacheLabel}>Core Status:</Text>
                    <View
                        style={[
                            styles.statusBadge,
                            { backgroundColor: coreInitialized ? '#4CAF50' : '#FF9800' },
                        ]}
                    >
                        <Text style={styles.statusBadgeText}>
                            {coreInitialized ? 'Ready' : 'Not Initialized'}
                        </Text>
                    </View>
                </View>
                <View style={styles.cacheRow}>
                    <Text style={styles.cacheLabel}>Total Cache Size:</Text>
                    <Text style={styles.cacheValue}>{formatBytes(totalCacheSize)}</Text>
                </View>
                <View style={styles.cacheRow}>
                    <Text style={styles.cacheLabel}>Models for Platform:</Text>
                    <Text style={styles.cacheValue}>{models.length}</Text>
                </View>
            </View>

            {/* Models List */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Available Models</Text>
                {models.map((model) => {
                    const downloadBadge = getDownloadStatusBadge(model.downloadStatus);
                    const activityBadge = getActivityBadge(model.activityState);

                    return (
                        <View key={model.definition.id} style={styles.modelCard}>
                            {/* Model Header */}
                            <View style={styles.modelHeader}>
                                <View style={styles.modelTitleRow}>
                                    <Text style={styles.modelName}>
                                        {model.definition.name}
                                    </Text>
                                    {model.definition.required && (
                                        <View style={styles.requiredBadge}>
                                            <Text style={styles.requiredText}>Required</Text>
                                        </View>
                                    )}
                                </View>
                                <Text style={styles.modelDescription}>
                                    {model.definition.description}
                                </Text>
                            </View>

                            {/* Status Badges */}
                            <View style={styles.badgeRow}>
                                <View
                                    style={[
                                        styles.statusBadge,
                                        { backgroundColor: downloadBadge.color },
                                    ]}
                                >
                                    <Text style={styles.statusBadgeText}>
                                        {downloadBadge.text}
                                    </Text>
                                </View>
                                <View
                                    style={[
                                        styles.statusBadge,
                                        { backgroundColor: activityBadge.color },
                                    ]}
                                >
                                    <Text style={styles.statusBadgeText}>
                                        {activityBadge.text}
                                    </Text>
                                </View>
                            </View>

                            {/* Download Progress */}
                            {model.isDownloading && (
                                <View style={styles.progressContainer}>
                                    <View style={styles.progressBar}>
                                        <View
                                            style={[
                                                styles.progressFill,
                                                { width: `${model.downloadProgress}%` },
                                            ]}
                                        />
                                    </View>
                                    <Text style={styles.progressText}>
                                        {model.downloadProgress.toFixed(0)}%
                                    </Text>
                                </View>
                            )}

                            {/* Model Metadata */}
                            <View style={styles.metadataContainer}>
                                <View style={styles.metadataRow}>
                                    <Text style={styles.metadataLabel}>Version:</Text>
                                    <Text style={styles.metadataValue}>
                                        {model.definition.version}
                                    </Text>
                                </View>
                                <View style={styles.metadataRow}>
                                    <Text style={styles.metadataLabel}>Size:</Text>
                                    <Text style={styles.metadataValue}>
                                        {formatBytes(model.definition.sizeBytes)}
                                    </Text>
                                </View>
                                <View style={styles.metadataRow}>
                                    <Text style={styles.metadataLabel}>Format:</Text>
                                    <Text style={styles.metadataValue}>
                                        {model.definition.format.toUpperCase()}
                                    </Text>
                                </View>
                                <View style={styles.metadataRow}>
                                    <Text style={styles.metadataLabel}>Used by:</Text>
                                    <Text style={styles.metadataValue}>
                                        {model.definition.usedBy.join(', ')}
                                    </Text>
                                </View>
                                {model.downloadStatus.state === 'ready' && (
                                    <View style={styles.metadataRow}>
                                        <Text style={styles.metadataLabel}>Disk Size:</Text>
                                        <Text style={styles.metadataValue}>
                                            {formatBytes(model.downloadStatus.sizeBytes)}
                                        </Text>
                                    </View>
                                )}
                            </View>

                            {/* Actions */}
                            <View style={styles.actionsContainer}>
                                {model.downloadStatus.state === 'not_downloaded' && (
                                    <TouchableOpacity
                                        style={[styles.actionButton, styles.downloadButton]}
                                        onPress={() => handleDownload(model.definition.id)}
                                        disabled={model.isDownloading}
                                    >
                                        <Text style={styles.actionButtonText}>Download</Text>
                                    </TouchableOpacity>
                                )}

                                {model.isDownloading && (
                                    <TouchableOpacity
                                        style={[styles.actionButton, styles.cancelButton]}
                                        onPress={() =>
                                            handleCancelDownload(model.definition.id)
                                        }
                                    >
                                        <Text style={styles.actionButtonText}>Cancel</Text>
                                    </TouchableOpacity>
                                )}

                                {model.isInitializing && (
                                    <View style={[styles.actionButton, styles.initializingButton]}>
                                        <ActivityIndicator size="small" color="#FFF" />
                                    </View>
                                )}

                                {model.downloadStatus.state === 'ready' && !model.isInitializing && (
                                    <>
                                        <TouchableOpacity
                                            style={[styles.actionButton, styles.redownloadButton]}
                                            onPress={() =>
                                                handleRedownload(
                                                    model.definition.id,
                                                    model.definition.name
                                                )
                                            }
                                        >
                                            <Text style={styles.actionButtonText}>
                                                Re-download
                                            </Text>
                                        </TouchableOpacity>
                                        {model.activityState !== 'initialized' && model.activityState !== 'in_memory' && (
                                            <TouchableOpacity
                                                style={[styles.actionButton, styles.initializeButton]}
                                                onPress={() =>
                                                    handleInitializeModel(
                                                        model.definition.id,
                                                        model.definition.name
                                                    )
                                                }
                                            >
                                                <Text style={styles.actionButtonText}>Initialize</Text>
                                            </TouchableOpacity>
                                        )}
                                        <TouchableOpacity
                                            style={[styles.actionButton, styles.deleteButton]}
                                            onPress={() =>
                                                handleDelete(
                                                    model.definition.id,
                                                    model.definition.name
                                                )
                                            }
                                        >
                                            <Text style={styles.actionButtonText}>Delete</Text>
                                        </TouchableOpacity>
                                    </>
                                )}

                                {model.downloadStatus.state === 'error' && (
                                    <TouchableOpacity
                                        style={[styles.actionButton, styles.retryButton]}
                                        onPress={() => handleDownload(model.definition.id)}
                                    >
                                        <Text style={styles.actionButtonText}>Retry</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    );
                })}
            </View>

            {/* Info Section */}
            <View style={styles.infoSection}>
                <Text style={styles.infoTitle}>About Models</Text>
                <Text style={styles.infoText}>
                    • Models are downloaded on-demand when features are first used
                </Text>
                <Text style={styles.infoText}>
                    • Some features have fallback methods when models aren't available
                </Text>
                <Text style={styles.infoText}>
                    • Models are cached locally and persist across app restarts
                </Text>
                <Text style={styles.infoText}>
                    • Pull down to refresh model status
                </Text>
            </View>

            <View style={styles.footer} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F5F5F5',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F5F5F5',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 16,
        color: '#666',
    },
    header: {
        padding: 20,
        backgroundColor: '#1a1a2e',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#FFF',
    },
    subtitle: {
        fontSize: 14,
        color: '#AAA',
        marginTop: 4,
    },
    cacheCard: {
        backgroundColor: '#FFF',
        margin: 16,
        padding: 16,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    cacheRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
    },
    cacheLabel: {
        fontSize: 14,
        color: '#666',
    },
    cacheValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
    },
    section: {
        paddingHorizontal: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
        marginBottom: 12,
    },
    modelCard: {
        backgroundColor: '#FFF',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    modelHeader: {
        marginBottom: 12,
    },
    modelTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    modelName: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
        flex: 1,
    },
    modelDescription: {
        fontSize: 14,
        color: '#666',
    },
    requiredBadge: {
        backgroundColor: '#E3F2FD',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        marginLeft: 8,
    },
    requiredText: {
        fontSize: 10,
        fontWeight: '600',
        color: '#1976D2',
    },
    badgeRow: {
        flexDirection: 'row',
        marginBottom: 12,
        gap: 8,
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusBadgeText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#FFF',
    },
    progressContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    progressBar: {
        flex: 1,
        height: 8,
        backgroundColor: '#E0E0E0',
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#2196F3',
        borderRadius: 4,
    },
    progressText: {
        marginLeft: 12,
        fontSize: 14,
        fontWeight: '600',
        color: '#2196F3',
        width: 45,
        textAlign: 'right',
    },
    metadataContainer: {
        backgroundColor: '#F5F5F5',
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
    },
    metadataRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 4,
    },
    metadataLabel: {
        fontSize: 13,
        color: '#666',
    },
    metadataValue: {
        fontSize: 13,
        fontWeight: '500',
        color: '#333',
    },
    actionsContainer: {
        flexDirection: 'row',
        gap: 8,
    },
    actionButton: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
    },
    actionButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#FFF',
    },
    downloadButton: {
        backgroundColor: '#4CAF50',
    },
    cancelButton: {
        backgroundColor: '#FF9800',
    },
    redownloadButton: {
        backgroundColor: '#2196F3',
    },
    deleteButton: {
        backgroundColor: '#F44336',
    },
    retryButton: {
        backgroundColor: '#FF9800',
    },
    initializeButton: {
        backgroundColor: '#4CAF50',
    },
    initializingButton: {
        backgroundColor: '#4CAF50',
        justifyContent: 'center',
    },
    infoSection: {
        margin: 16,
        padding: 16,
        backgroundColor: '#E3F2FD',
        borderRadius: 12,
    },
    infoTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1976D2',
        marginBottom: 8,
    },
    infoText: {
        fontSize: 13,
        color: '#1565C0',
        marginBottom: 4,
    },
    footer: {
        height: 40,
    },
});
