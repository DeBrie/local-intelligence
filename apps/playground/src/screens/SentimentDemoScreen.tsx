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
import * as DebrieSentiment from '@debrie/sentiment';
import type { SentimentResult, SentimentStats } from '@debrie/sentiment';

const SAMPLE_TEXTS = [
    'I absolutely love this product! It exceeded all my expectations.',
    'This is the worst experience I have ever had. Completely disappointed.',
    'The weather today is cloudy with a chance of rain.',
    'Great customer service but the product quality could be better.',
    'I am so happy with my purchase! Highly recommend to everyone.',
    'Terrible quality, broke after one day. Never buying again.',
];

export function SentimentDemoScreen() {
    const [isInitialized, setIsInitialized] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [inputText, setInputText] = useState(SAMPLE_TEXTS[0]);
    const [result, setResult] = useState<SentimentResult | null>(null);
    const [stats, setStats] = useState<SentimentStats | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        initializeSentiment();
    }, []);

    const initializeSentiment = async () => {
        setIsLoading(true);
        setError(null);
        try {
            await DebrieSentiment.initialize({
                minConfidence: 0.5,
                defaultLabel: 'neutral',
                enableCaching: true,
                maxCacheSize: 100,
            });
            setIsInitialized(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to initialize');
        } finally {
            setIsLoading(false);
        }
    };

    const handleAnalyze = async () => {
        if (!inputText.trim()) {
            Alert.alert('Error', 'Please enter some text to analyze');
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const sentimentResult = await DebrieSentiment.analyze(inputText);
            setResult(sentimentResult);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Analysis failed');
        } finally {
            setIsLoading(false);
        }
    };

    const handleGetStats = async () => {
        try {
            const sentimentStats = await DebrieSentiment.getStats();
            setStats(sentimentStats);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to get stats');
        }
    };

    const handleResetStats = async () => {
        try {
            await DebrieSentiment.resetStats();
            setStats(null);
            Alert.alert('Success', 'Stats have been reset');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to reset stats');
        }
    };

    const handleClearCache = async () => {
        try {
            await DebrieSentiment.clearCache();
            Alert.alert('Success', 'Cache has been cleared');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to clear cache');
        }
    };

    const loadSampleText = (index: number) => {
        setInputText(SAMPLE_TEXTS[index]);
        setResult(null);
    };

    const getLabelColor = (label: string): string => {
        switch (label) {
            case 'positive':
                return '#4CAF50';
            case 'negative':
                return '#F44336';
            case 'neutral':
                return '#9E9E9E';
            default:
                return '#9E9E9E';
        }
    };

    const getLabelEmoji = (label: string): string => {
        switch (label) {
            case 'positive':
                return '😊';
            case 'negative':
                return '😞';
            case 'neutral':
                return '😐';
            default:
                return '😐';
        }
    };

    return (
        <ScrollView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Sentiment Analysis</Text>
                <Text style={styles.subtitle}>
                    On-device 3-class classification with NLTagger (iOS) / Lexicon (Android)
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
                    placeholder="Enter text to analyze sentiment..."
                    placeholderTextColor="#999"
                />
            </View>

            {/* Analyze Button */}
            <View style={styles.buttonContainer}>
                <TouchableOpacity
                    style={[styles.button, styles.analyzeButton]}
                    onPress={handleAnalyze}
                    disabled={!isInitialized || isLoading}
                >
                    <Text style={styles.buttonText}>Analyze Sentiment</Text>
                </TouchableOpacity>
            </View>

            {isLoading && (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#007AFF" />
                    <Text style={styles.loadingText}>Analyzing...</Text>
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
                    <Text style={styles.sectionTitle}>Result</Text>
                    <View style={styles.resultCard}>
                        <View style={styles.sentimentHeader}>
                            <Text style={styles.sentimentEmoji}>{getLabelEmoji(result.label)}</Text>
                            <View
                                style={[
                                    styles.sentimentBadge,
                                    { backgroundColor: getLabelColor(result.label) },
                                ]}
                            >
                                <Text style={styles.sentimentLabel}>
                                    {result.label.toUpperCase()}
                                </Text>
                            </View>
                        </View>

                        <View style={styles.confidenceRow}>
                            <Text style={styles.confidenceLabel}>Confidence:</Text>
                            <Text style={styles.confidenceValue}>
                                {(result.confidence * 100).toFixed(1)}%
                            </Text>
                        </View>

                        <View style={styles.scoresSection}>
                            <Text style={styles.scoresTitle}>Score Breakdown:</Text>
                            <View style={styles.scoreBar}>
                                <View
                                    style={[
                                        styles.scoreSegment,
                                        {
                                            flex: result.scores.positive,
                                            backgroundColor: '#4CAF50',
                                        },
                                    ]}
                                />
                                <View
                                    style={[
                                        styles.scoreSegment,
                                        {
                                            flex: result.scores.neutral,
                                            backgroundColor: '#9E9E9E',
                                        },
                                    ]}
                                />
                                <View
                                    style={[
                                        styles.scoreSegment,
                                        {
                                            flex: result.scores.negative,
                                            backgroundColor: '#F44336',
                                        },
                                    ]}
                                />
                            </View>
                            <View style={styles.scoreLegend}>
                                <View style={styles.legendItem}>
                                    <View style={[styles.legendDot, { backgroundColor: '#4CAF50' }]} />
                                    <Text style={styles.legendText}>
                                        Pos: {(result.scores.positive * 100).toFixed(1)}%
                                    </Text>
                                </View>
                                <View style={styles.legendItem}>
                                    <View style={[styles.legendDot, { backgroundColor: '#9E9E9E' }]} />
                                    <Text style={styles.legendText}>
                                        Neu: {(result.scores.neutral * 100).toFixed(1)}%
                                    </Text>
                                </View>
                                <View style={styles.legendItem}>
                                    <View style={[styles.legendDot, { backgroundColor: '#F44336' }]} />
                                    <Text style={styles.legendText}>
                                        Neg: {(result.scores.negative * 100).toFixed(1)}%
                                    </Text>
                                </View>
                            </View>
                        </View>

                        <Text style={styles.processingTime}>
                            Processing time: {result.processingTimeMs.toFixed(2)}ms
                        </Text>
                    </View>
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
                        style={[styles.button, styles.cacheButton]}
                        onPress={handleClearCache}
                        disabled={!isInitialized}
                    >
                        <Text style={styles.buttonText}>Clear Cache</Text>
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
                            <Text style={styles.statLabel}>Total Analyzed:</Text>
                            <Text style={styles.statValue}>{stats.totalAnalyzed}</Text>
                        </View>
                        <View style={styles.statRow}>
                            <Text style={styles.statLabel}>Avg Confidence:</Text>
                            <Text style={styles.statValue}>
                                {(stats.averageConfidence * 100).toFixed(1)}%
                            </Text>
                        </View>
                        <View style={styles.statRow}>
                            <Text style={styles.statLabel}>Avg Processing:</Text>
                            <Text style={styles.statValue}>
                                {stats.averageProcessingTimeMs.toFixed(2)}ms
                            </Text>
                        </View>
                        <View style={styles.byLabelSection}>
                            <Text style={styles.byLabelTitle}>By Label:</Text>
                            {Object.entries(stats.byLabel).map(([label, count]) => (
                                <View key={label} style={styles.byLabelRow}>
                                    <View
                                        style={[
                                            styles.labelBadge,
                                            { backgroundColor: getLabelColor(label) },
                                        ]}
                                    >
                                        <Text style={styles.labelBadgeText}>{label}</Text>
                                    </View>
                                    <Text style={styles.byLabelCount}>{count}</Text>
                                </View>
                            ))}
                        </View>
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
        backgroundColor: '#9C27B0',
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
        backgroundColor: '#F3E5F5',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        marginRight: 8,
    },
    sampleButtonText: {
        color: '#7B1FA2',
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
    buttonContainer: {
        marginHorizontal: 16,
        marginBottom: 16,
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 8,
    },
    button: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
    },
    analyzeButton: {
        backgroundColor: '#9C27B0',
    },
    statsButton: {
        backgroundColor: '#673AB7',
    },
    cacheButton: {
        backgroundColor: '#3F51B5',
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
        padding: 20,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    sentimentHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    sentimentEmoji: {
        fontSize: 48,
        marginRight: 16,
    },
    sentimentBadge: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 24,
    },
    sentimentLabel: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
    confidenceRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#EEE',
    },
    confidenceLabel: {
        fontSize: 16,
        color: '#666',
    },
    confidenceValue: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
    },
    scoresSection: {
        marginBottom: 16,
    },
    scoresTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#666',
        marginBottom: 8,
    },
    scoreBar: {
        flexDirection: 'row',
        height: 24,
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 8,
    },
    scoreSegment: {
        height: '100%',
    },
    scoreLegend: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    legendDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        marginRight: 6,
    },
    legendText: {
        fontSize: 12,
        color: '#666',
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
        marginTop: 12,
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
    byLabelSection: {
        marginTop: 12,
    },
    byLabelTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#666',
        marginBottom: 8,
    },
    byLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
    },
    labelBadge: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 12,
        marginRight: 12,
    },
    labelBadgeText: {
        color: '#FFF',
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'capitalize',
    },
    byLabelCount: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
    },
    footer: {
        height: 40,
    },
});
