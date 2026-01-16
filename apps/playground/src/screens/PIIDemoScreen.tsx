import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
} from 'react-native';
import * as DebriePII from '@debrie/pii';
import type { PIIEntity, RedactionResult, PIIStats } from '@debrie/pii';

const SAMPLE_TEXTS = [
    'Contact John Smith at john.smith@example.com or call 555-123-4567.',
    'My SSN is 123-45-6789 and my credit card is 4111-1111-1111-1111.',
    'Send the package to Jane Doe at 123 Main Street, New York.',
    'Meeting with Dr. Sarah Johnson from Acme Corporation tomorrow.',
];

export function PIIDemoScreen() {
    const [isInitialized, setIsInitialized] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [inputText, setInputText] = useState(SAMPLE_TEXTS[0]);
    const [result, setResult] = useState<RedactionResult | null>(null);
    const [stats, setStats] = useState<PIIStats | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        initializePII();
    }, []);

    const initializePII = async () => {
        setIsLoading(true);
        setError(null);
        try {
            await DebriePII.initialize({
                enabledTypes: [
                    'person',
                    'organization',
                    'location',
                    'email',
                    'phone',
                    'ssn',
                    'credit_card',
                ],
                redactionChar: '*',
                minConfidence: 0.7,
                preserveLength: true,
            });
            setIsInitialized(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to initialize PII');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDetect = async () => {
        if (!inputText.trim()) {
            Alert.alert('Error', 'Please enter some text to analyze');
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const entities = await DebriePII.detectEntities(inputText);
            setResult({
                originalText: inputText,
                redactedText: inputText,
                entities,
                processingTimeMs: 0,
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Detection failed');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRedact = async () => {
        if (!inputText.trim()) {
            Alert.alert('Error', 'Please enter some text to redact');
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const redactionResult = await DebriePII.redact(inputText);
            setResult(redactionResult);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Redaction failed');
        } finally {
            setIsLoading(false);
        }
    };

    const handleGetStats = async () => {
        try {
            const piiStats = await DebriePII.getStats();
            setStats(piiStats);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to get stats');
        }
    };

    const handleResetStats = async () => {
        try {
            await DebriePII.resetStats();
            setStats(null);
            Alert.alert('Success', 'Stats have been reset');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to reset stats');
        }
    };

    const loadSampleText = (index: number) => {
        setInputText(SAMPLE_TEXTS[index]);
        setResult(null);
    };

    const getEntityColor = (type: string): string => {
        const colors: Record<string, string> = {
            person: '#FF6B6B',
            organization: '#4ECDC4',
            location: '#45B7D1',
            email: '#96CEB4',
            phone: '#FFEAA7',
            ssn: '#DDA0DD',
            credit_card: '#FFB347',
            custom: '#C9C9C9',
        };
        return colors[type] || '#C9C9C9';
    };

    return (
        <ScrollView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>PII Redaction</Text>
                <Text style={styles.subtitle}>
                    On-device privacy protection with NLTagger (iOS) / Regex (Android)
                </Text>
            </View>

            {/* Status */}
            <View style={styles.statusCard}>
                <View style={styles.statusRow}>
                    <Text style={styles.statusLabel}>Status:</Text>
                    <View
                        style={[
                            styles.statusBadge,
                            { backgroundColor: isInitialized ? '#4CAF50' : '#FF9800' },
                        ]}
                    >
                        <Text style={styles.statusBadgeText}>
                            {isInitialized ? 'Ready' : 'Not Initialized'}
                        </Text>
                    </View>
                </View>
            </View>

            {/* Sample Texts */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Sample Texts</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {SAMPLE_TEXTS.map((_, index) => (
                        <TouchableOpacity
                            key={index}
                            style={styles.sampleButton}
                            onPress={() => loadSampleText(index)}
                        >
                            <Text style={styles.sampleButtonText}>Sample {index + 1}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {/* Input */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Input Text</Text>
                <TextInput
                    style={styles.textInput}
                    multiline
                    numberOfLines={4}
                    value={inputText}
                    onChangeText={setInputText}
                    placeholder="Enter text containing PII..."
                    placeholderTextColor="#999"
                />
            </View>

            {/* Actions */}
            <View style={styles.buttonRow}>
                <TouchableOpacity
                    style={[styles.button, styles.detectButton]}
                    onPress={handleDetect}
                    disabled={!isInitialized || isLoading}
                >
                    <Text style={styles.buttonText}>Detect</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.button, styles.redactButton]}
                    onPress={handleRedact}
                    disabled={!isInitialized || isLoading}
                >
                    <Text style={styles.buttonText}>Redact</Text>
                </TouchableOpacity>
            </View>

            {isLoading && (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#007AFF" />
                    <Text style={styles.loadingText}>Processing...</Text>
                </View>
            )}

            {error && (
                <View style={styles.errorCard}>
                    <Text style={styles.errorText}>{error}</Text>
                </View>
            )}

            {/* Results */}
            {result && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Results</Text>

                    {result.redactedText !== result.originalText && (
                        <View style={styles.resultCard}>
                            <Text style={styles.resultLabel}>Redacted Text:</Text>
                            <Text style={styles.redactedText}>{result.redactedText}</Text>
                        </View>
                    )}

                    <View style={styles.resultCard}>
                        <Text style={styles.resultLabel}>
                            Entities Found: {result.entities.length}
                        </Text>
                        {result.entities.map((entity: PIIEntity, index: number) => (
                            <View key={index} style={styles.entityRow}>
                                <View
                                    style={[
                                        styles.entityBadge,
                                        { backgroundColor: getEntityColor(entity.type) },
                                    ]}
                                >
                                    <Text style={styles.entityType}>{entity.type}</Text>
                                </View>
                                <Text style={styles.entityText}>"{entity.text}"</Text>
                                <Text style={styles.entityConfidence}>
                                    {Math.round(entity.confidence * 100)}%
                                </Text>
                            </View>
                        ))}
                    </View>

                    {result.processingTimeMs > 0 && (
                        <Text style={styles.processingTime}>
                            Processing time: {result.processingTimeMs.toFixed(2)}ms
                        </Text>
                    )}
                </View>
            )}

            {/* Stats */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Statistics</Text>
                <View style={styles.buttonRow}>
                    <TouchableOpacity
                        style={[styles.button, styles.statsButton]}
                        onPress={handleGetStats}
                        disabled={!isInitialized}
                    >
                        <Text style={styles.buttonText}>Get Stats</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.button, styles.resetButton]}
                        onPress={handleResetStats}
                        disabled={!isInitialized}
                    >
                        <Text style={styles.buttonText}>Reset</Text>
                    </TouchableOpacity>
                </View>

                {stats && (
                    <View style={styles.statsCard}>
                        <View style={styles.statRow}>
                            <Text style={styles.statLabel}>Total Scanned:</Text>
                            <Text style={styles.statValue}>{stats.totalScanned}</Text>
                        </View>
                        <View style={styles.statRow}>
                            <Text style={styles.statLabel}>Total Redacted:</Text>
                            <Text style={styles.statValue}>{stats.totalRedacted}</Text>
                        </View>
                        <View style={styles.statRow}>
                            <Text style={styles.statLabel}>Avg Processing:</Text>
                            <Text style={styles.statValue}>
                                {stats.averageProcessingTimeMs.toFixed(2)}ms
                            </Text>
                        </View>
                        {Object.entries(stats.byType).length > 0 && (
                            <View style={styles.byTypeSection}>
                                <Text style={styles.byTypeTitle}>By Type:</Text>
                                {Object.entries(stats.byType).map(([type, count]) => (
                                    <View key={type} style={styles.byTypeRow}>
                                        <View
                                            style={[
                                                styles.entityBadge,
                                                { backgroundColor: getEntityColor(type) },
                                            ]}
                                        >
                                            <Text style={styles.entityType}>{type}</Text>
                                        </View>
                                        <Text style={styles.byTypeCount}>{count}</Text>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>
                )}
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
    header: {
        padding: 20,
        backgroundColor: '#007AFF',
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#FFF',
    },
    subtitle: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.8)',
        marginTop: 4,
    },
    statusCard: {
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
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    statusLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
    },
    statusBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
    },
    statusBadgeText: {
        color: '#FFF',
        fontWeight: '600',
        fontSize: 12,
    },
    section: {
        marginHorizontal: 16,
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
        marginBottom: 12,
    },
    sampleButton: {
        backgroundColor: '#E3F2FD',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        marginRight: 8,
    },
    sampleButtonText: {
        color: '#1976D2',
        fontWeight: '500',
    },
    textInput: {
        backgroundColor: '#FFF',
        borderRadius: 12,
        padding: 16,
        fontSize: 16,
        color: '#333',
        minHeight: 120,
        textAlignVertical: 'top',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    buttonRow: {
        flexDirection: 'row',
        marginHorizontal: 16,
        marginBottom: 16,
        gap: 12,
    },
    button: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
    },
    detectButton: {
        backgroundColor: '#4CAF50',
    },
    redactButton: {
        backgroundColor: '#FF5722',
    },
    statsButton: {
        backgroundColor: '#9C27B0',
    },
    resetButton: {
        backgroundColor: '#607D8B',
    },
    buttonText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '600',
    },
    loadingContainer: {
        alignItems: 'center',
        padding: 20,
    },
    loadingText: {
        marginTop: 8,
        color: '#666',
    },
    errorCard: {
        backgroundColor: '#FFEBEE',
        marginHorizontal: 16,
        marginBottom: 16,
        padding: 16,
        borderRadius: 12,
        borderLeftWidth: 4,
        borderLeftColor: '#F44336',
    },
    errorText: {
        color: '#C62828',
    },
    resultCard: {
        backgroundColor: '#FFF',
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    resultLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#666',
        marginBottom: 8,
    },
    redactedText: {
        fontSize: 16,
        color: '#333',
        fontFamily: 'monospace',
        backgroundColor: '#F5F5F5',
        padding: 12,
        borderRadius: 8,
    },
    entityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#EEE',
    },
    entityBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        marginRight: 12,
    },
    entityType: {
        color: '#FFF',
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
    },
    entityText: {
        flex: 1,
        fontSize: 14,
        color: '#333',
    },
    entityConfidence: {
        fontSize: 12,
        color: '#999',
        fontWeight: '500',
    },
    processingTime: {
        fontSize: 12,
        color: '#999',
        textAlign: 'center',
    },
    statsCard: {
        backgroundColor: '#FFF',
        padding: 16,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    statRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#EEE',
    },
    statLabel: {
        fontSize: 14,
        color: '#666',
    },
    statValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
    },
    byTypeSection: {
        marginTop: 12,
    },
    byTypeTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#666',
        marginBottom: 8,
    },
    byTypeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
    },
    byTypeCount: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
        marginLeft: 12,
    },
    footer: {
        height: 40,
    },
});
