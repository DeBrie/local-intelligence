import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
} from 'react-native';

export interface ModelDefinition {
    id: string;
    name: string;
    description: string;
    version: string;
    sizeBytes: number;
    format: 'onnx' | 'tflite' | 'coreml';
    usedBy: string[];
}

export type DownloadState = 'not_downloaded' | 'downloading' | 'ready' | 'error';
export type ActivityState = 'not_initialized' | 'initialized' | 'in_memory' | 'unloaded';

export interface ModelCardState {
    downloadState: DownloadState;
    activityState: ActivityState;
    isDownloading: boolean;
    downloadProgress: number;
    isInitializing: boolean;
    diskSizeBytes?: number;
}

export interface ModelCardProps {
    definition: ModelDefinition;
    state: ModelCardState;
    onDownload: () => void;
    onInitialize: () => void;
    onRedownload?: () => void;
    onDelete?: () => void;
    onCancelDownload?: () => void;
    showMetadata?: boolean;
    compact?: boolean;
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getDownloadStatusBadge(state: DownloadState) {
    switch (state) {
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
}

function getActivityBadge(state: ActivityState) {
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
}

export function ModelCard({
    definition,
    state,
    onDownload,
    onInitialize,
    onRedownload,
    onDelete,
    onCancelDownload,
    showMetadata = true,
    compact = false,
}: ModelCardProps) {
    const downloadBadge = getDownloadStatusBadge(state.downloadState);
    const activityBadge = getActivityBadge(state.activityState);

    const isDownloaded = state.downloadState === 'ready';
    const isInitialized = state.activityState === 'initialized' || state.activityState === 'in_memory';

    return (
        <View style={[styles.modelCard, compact && styles.modelCardCompact]}>
            {/* Model Header */}
            <View style={styles.modelHeader}>
                <Text style={styles.modelName}>{definition.name}</Text>
                <Text style={styles.modelDescription}>{definition.description}</Text>
            </View>

            {/* Status Badges */}
            <View style={styles.badgeRow}>
                <View style={[styles.statusBadge, { backgroundColor: downloadBadge.color }]}>
                    <Text style={styles.statusBadgeText}>{downloadBadge.text}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: activityBadge.color }]}>
                    <Text style={styles.statusBadgeText}>{activityBadge.text}</Text>
                </View>
            </View>

            {/* Download Progress */}
            {state.isDownloading && (
                <View style={styles.progressContainer}>
                    <View style={styles.progressBar}>
                        <View
                            style={[styles.progressFill, { width: `${state.downloadProgress}%` }]}
                        />
                    </View>
                    <Text style={styles.progressText}>
                        {state.downloadProgress.toFixed(0)}%
                    </Text>
                </View>
            )}

            {/* Model Metadata */}
            {showMetadata && !compact && (
                <View style={styles.metadataContainer}>
                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataLabel}>Version:</Text>
                        <Text style={styles.metadataValue}>{definition.version}</Text>
                    </View>
                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataLabel}>Size:</Text>
                        <Text style={styles.metadataValue}>
                            {formatBytes(definition.sizeBytes)}
                        </Text>
                    </View>
                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataLabel}>Format:</Text>
                        <Text style={styles.metadataValue}>
                            {definition.format.toUpperCase()}
                        </Text>
                    </View>
                    <View style={styles.metadataRow}>
                        <Text style={styles.metadataLabel}>Used by:</Text>
                        <Text style={styles.metadataValue}>
                            {definition.usedBy.join(', ')}
                        </Text>
                    </View>
                    {isDownloaded && state.diskSizeBytes && (
                        <View style={styles.metadataRow}>
                            <Text style={styles.metadataLabel}>Disk Size:</Text>
                            <Text style={styles.metadataValue}>
                                {formatBytes(state.diskSizeBytes)}
                            </Text>
                        </View>
                    )}
                </View>
            )}

            {/* Actions */}
            <View style={styles.actionsContainer}>
                {/* Download button - only enabled when not downloaded */}
                {state.downloadState === 'not_downloaded' && !state.isDownloading && (
                    <TouchableOpacity
                        style={[styles.actionButton, styles.downloadButton]}
                        onPress={onDownload}
                    >
                        <Text style={styles.actionButtonText}>Download</Text>
                    </TouchableOpacity>
                )}

                {/* Cancel button during download */}
                {state.isDownloading && onCancelDownload && (
                    <TouchableOpacity
                        style={[styles.actionButton, styles.cancelButton]}
                        onPress={onCancelDownload}
                    >
                        <Text style={styles.actionButtonText}>Cancel</Text>
                    </TouchableOpacity>
                )}

                {/* Initializing indicator */}
                {state.isInitializing && (
                    <View style={[styles.actionButton, styles.initializingButton]}>
                        <ActivityIndicator size="small" color="#FFF" />
                    </View>
                )}

                {/* Actions when downloaded */}
                {isDownloaded && !state.isInitializing && (
                    <>
                        {/* Initialize button - only when not initialized */}
                        {!isInitialized && (
                            <TouchableOpacity
                                style={[styles.actionButton, styles.initializeButton]}
                                onPress={onInitialize}
                            >
                                <Text style={styles.actionButtonText}>Initialize</Text>
                            </TouchableOpacity>
                        )}

                        {/* Re-download button */}
                        {onRedownload && (
                            <TouchableOpacity
                                style={[styles.actionButton, styles.redownloadButton]}
                                onPress={onRedownload}
                            >
                                <Text style={styles.actionButtonText}>Re-download</Text>
                            </TouchableOpacity>
                        )}

                        {/* Delete button */}
                        {onDelete && (
                            <TouchableOpacity
                                style={[styles.actionButton, styles.deleteButton]}
                                onPress={onDelete}
                            >
                                <Text style={styles.actionButtonText}>Delete</Text>
                            </TouchableOpacity>
                        )}
                    </>
                )}

                {/* Retry on error */}
                {state.downloadState === 'error' && (
                    <TouchableOpacity
                        style={[styles.actionButton, styles.retryButton]}
                        onPress={onDownload}
                    >
                        <Text style={styles.actionButtonText}>Retry</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
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
    modelCardCompact: {
        padding: 12,
        marginBottom: 12,
    },
    modelHeader: {
        marginBottom: 12,
    },
    modelName: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
        marginBottom: 4,
    },
    modelDescription: {
        fontSize: 14,
        color: '#666',
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
});
