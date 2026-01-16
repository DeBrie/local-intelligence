import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import {
    initialize,
    getDeviceCapabilities,
    getCacheSize,
    clearModelCache,
    isReady,
    type DeviceCapabilities,
} from '@debrie/core';

export function CoreDemoScreen() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [capabilities, setCapabilities] = useState<DeviceCapabilities | null>(null);
    const [cacheSize, setCacheSize] = useState<number>(0);
    const [initialized, setInitialized] = useState(false);

    useEffect(() => {
        initializeCore();
    }, []);

    const initializeCore = async () => {
        setLoading(true);
        setError(null);

        try {
            if (!isReady()) {
                await initialize({
                    enableLogging: true,
                });
            }
            setInitialized(true);

            const caps = await getDeviceCapabilities();
            setCapabilities(caps);

            const size = await getCacheSize();
            setCacheSize(size);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    const handleClearCache = async () => {
        try {
            await clearModelCache();
            setCacheSize(0);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to clear cache');
        }
    };

    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    };

    if (loading) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#1a1a2e" />
                <Text style={styles.loadingText}>Initializing Core...</Text>
            </View>
        );
    }

    if (error) {
        return (
            <View style={styles.centerContainer}>
                <Text style={styles.errorText}>Error: {error}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={initializeCore}>
                    <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container}>
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Initialization Status</Text>
                <View style={styles.card}>
                    <View style={styles.row}>
                        <Text style={styles.label}>Core Initialized</Text>
                        <View style={[styles.badge, initialized ? styles.badgeSuccess : styles.badgeError]}>
                            <Text style={styles.badgeText}>{initialized ? 'Yes' : 'No'}</Text>
                        </View>
                    </View>
                </View>
            </View>

            {capabilities && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Device Capabilities</Text>
                    <View style={styles.card}>
                        <View style={styles.row}>
                            <Text style={styles.label}>Platform</Text>
                            <Text style={styles.value}>{capabilities.platform}</Text>
                        </View>
                        <View style={styles.row}>
                            <Text style={styles.label}>OS Version</Text>
                            <Text style={styles.value}>{capabilities.osVersion}</Text>
                        </View>
                        <View style={styles.row}>
                            <Text style={styles.label}>RAM</Text>
                            <Text style={styles.value}>{capabilities.ramGB.toFixed(1)} GB</Text>
                        </View>
                        <View style={styles.row}>
                            <Text style={styles.label}>Has NPU</Text>
                            <View style={[styles.badge, capabilities.hasNPU ? styles.badgeSuccess : styles.badgeNeutral]}>
                                <Text style={styles.badgeText}>{capabilities.hasNPU ? 'Yes' : 'No'}</Text>
                            </View>
                        </View>
                        <View style={styles.row}>
                            <Text style={styles.label}>Has GPU</Text>
                            <View style={[styles.badge, capabilities.hasGPU ? styles.badgeSuccess : styles.badgeNeutral]}>
                                <Text style={styles.badgeText}>{capabilities.hasGPU ? 'Yes' : 'No'}</Text>
                            </View>
                        </View>
                        <View style={styles.row}>
                            <Text style={styles.label}>Foundation Models</Text>
                            <View style={[styles.badge, capabilities.supportsFoundationModels ? styles.badgeSuccess : styles.badgeNeutral]}>
                                <Text style={styles.badgeText}>{capabilities.supportsFoundationModels ? 'Supported' : 'Not Available'}</Text>
                            </View>
                        </View>
                        <View style={styles.row}>
                            <Text style={styles.label}>Supported Delegates</Text>
                            <Text style={styles.value}>{capabilities.supportedDelegates.join(', ')}</Text>
                        </View>
                    </View>
                </View>
            )}

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Model Cache</Text>
                <View style={styles.card}>
                    <View style={styles.row}>
                        <Text style={styles.label}>Cache Size</Text>
                        <Text style={styles.value}>{formatBytes(cacheSize)}</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.clearButton}
                        onPress={handleClearCache}
                    >
                        <Text style={styles.clearButtonText}>Clear Cache</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Hardware Acceleration</Text>
                <View style={styles.card}>
                    <Text style={styles.infoText}>
                        {capabilities?.hasNPU
                            ? '✅ Neural Processing Unit detected. Models will use hardware acceleration for optimal performance.'
                            : capabilities?.hasGPU
                                ? '⚡ GPU acceleration available. Models will use GPU for inference.'
                                : '💻 CPU-only mode. Models will run on CPU with multi-threading.'}
                    </Text>
                </View>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    loadingText: {
        marginTop: 12,
        fontSize: 16,
        color: '#666666',
    },
    errorText: {
        fontSize: 16,
        color: '#dc3545',
        textAlign: 'center',
        marginBottom: 16,
    },
    retryButton: {
        backgroundColor: '#1a1a2e',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
    },
    retryButtonText: {
        color: '#ffffff',
        fontWeight: '600',
    },
    section: {
        padding: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#1a1a2e',
        marginBottom: 12,
    },
    card: {
        backgroundColor: '#ffffff',
        borderRadius: 12,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    label: {
        fontSize: 14,
        color: '#666666',
    },
    value: {
        fontSize: 14,
        fontWeight: '500',
        color: '#1a1a2e',
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    badgeSuccess: {
        backgroundColor: '#d4edda',
    },
    badgeError: {
        backgroundColor: '#f8d7da',
    },
    badgeNeutral: {
        backgroundColor: '#e2e3e5',
    },
    badgeText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#333333',
    },
    clearButton: {
        backgroundColor: '#dc3545',
        paddingVertical: 12,
        borderRadius: 8,
        marginTop: 12,
        alignItems: 'center',
    },
    clearButtonText: {
        color: '#ffffff',
        fontWeight: '600',
    },
    infoText: {
        fontSize: 14,
        color: '#666666',
        lineHeight: 20,
    },
});
