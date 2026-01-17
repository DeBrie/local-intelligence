import React, { useState } from 'react';
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
import {
    initialize,
    generateEmbedding,
    generateEmbeddingBatch,
} from '@local-intelligence/semantic-search';

interface SearchResult {
    id: string;
    text: string;
    similarity: number;
}

interface DocumentWithEmbedding {
    id: string;
    text: string;
    embedding: number[];
}

function cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

const SAMPLE_DOCUMENTS = [
    { id: '1', text: 'React Native is a framework for building mobile apps using JavaScript and React.' },
    { id: '2', text: 'Machine learning enables computers to learn from data without explicit programming.' },
    { id: '3', text: 'TypeScript adds static typing to JavaScript for better developer experience.' },
    { id: '4', text: 'Neural networks are inspired by the structure of the human brain.' },
    { id: '5', text: 'Swift is Apple\'s programming language for iOS and macOS development.' },
    { id: '6', text: 'Kotlin is the preferred language for Android app development.' },
    { id: '7', text: 'Vector databases store embeddings for semantic similarity search.' },
    { id: '8', text: 'SQLite is a lightweight embedded database used in mobile applications.' },
];

const SAMPLE_QUERIES = [
    'How do I build mobile apps?',
    'What is artificial intelligence?',
    'Tell me about programming languages',
    'How does semantic search work?',
];

export function SemanticSearchDemoScreen() {
    const [queryText, setQueryText] = useState(SAMPLE_QUERIES[0]);
    const [indexedCount, setIndexedCount] = useState(0);
    const [isInitialized, setIsInitialized] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [results, setResults] = useState<SearchResult[]>([]);
    const [indexedDocs, setIndexedDocs] = useState<DocumentWithEmbedding[]>([]);
    const [embeddingDimensions, setEmbeddingDimensions] = useState(0);

    const handleInitialize = async () => {
        setIsLoading(true);
        setError(null);
        try {
            await initialize({
                modelId: 'sentence-embedding',
                embeddingDimensions: 512,
            });
            setIsInitialized(true);
            Alert.alert('Success', 'Embedding model initialized (in-memory search)');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to initialize');
            Alert.alert('Error', err instanceof Error ? err.message : 'Failed to initialize');
        } finally {
            setIsLoading(false);
        }
    };

    const handleIndexDocuments = async () => {
        if (!isInitialized) {
            Alert.alert('Error', 'Please initialize first');
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const texts = SAMPLE_DOCUMENTS.map(d => d.text);
            const batchResult = await generateEmbeddingBatch(texts);

            const docsWithEmbeddings: DocumentWithEmbedding[] = SAMPLE_DOCUMENTS.map((doc, i) => ({
                id: doc.id,
                text: doc.text,
                embedding: batchResult.embeddings[i].embedding,
            }));

            setIndexedDocs(docsWithEmbeddings);
            setIndexedCount(docsWithEmbeddings.length);
            setEmbeddingDimensions(batchResult.embeddings[0]?.embedding.length ?? 0);

            Alert.alert('Success', `Indexed ${docsWithEmbeddings.length} documents (${batchResult.totalProcessingTimeMs.toFixed(0)}ms)`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to index documents');
            Alert.alert('Error', err instanceof Error ? err.message : 'Failed to index documents');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSearch = async () => {
        if (!queryText.trim()) {
            Alert.alert('Error', 'Please enter a search query');
            return;
        }

        if (indexedDocs.length === 0) {
            Alert.alert('Error', 'Please index documents first');
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const queryResult = await generateEmbedding(queryText);

            // Calculate cosine similarity with all documents
            const searchResults: SearchResult[] = indexedDocs.map(doc => ({
                id: doc.id,
                text: doc.text,
                similarity: cosineSimilarity(queryResult.embedding, doc.embedding),
            }));

            // Sort by similarity descending
            searchResults.sort((a, b) => b.similarity - a.similarity);

            setResults(searchResults.slice(0, 5));

            if (searchResults.length === 0) {
                Alert.alert('Info', 'No matching results found');
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Search failed';
            Alert.alert('Search Error', errorMsg);
            setError(errorMsg);
        } finally {
            setIsLoading(false);
        }
    };

    const handleClear = () => {
        setIndexedDocs([]);
        setIndexedCount(0);
        setResults([]);
        setEmbeddingDimensions(0);
        Alert.alert('Success', 'Index cleared');
    };

    const loadSampleQuery = (index: number) => {
        setQueryText(SAMPLE_QUERIES[index]);
        setResults([]);
    };

    const getSimilarityColor = (similarity: number): string => {
        if (similarity >= 0.7) return '#4CAF50';
        if (similarity >= 0.4) return '#FF9800';
        return '#F44336';
    };

    return (
        <ScrollView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Semantic Search</Text>
                <Text style={styles.subtitle}>
                    Vector embeddings with NLEmbedding (iOS) / TFLite (Android)
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
                {isInitialized && (
                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>Indexed Documents:</Text>
                        <Text style={styles.statusValue}>{indexedCount}</Text>
                    </View>
                )}
            </View>

            {/* Initialize */}
            {!isInitialized && (
                <View style={styles.buttonContainer}>
                    <TouchableOpacity
                        style={[styles.button, styles.initButton]}
                        onPress={handleInitialize}
                        disabled={isLoading}
                    >
                        <Text style={styles.buttonText}>Initialize</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Index Documents */}
            {isInitialized && indexedCount === 0 && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Sample Documents</Text>
                    <View style={styles.documentsPreview}>
                        {SAMPLE_DOCUMENTS.slice(0, 3).map((doc) => (
                            <Text key={doc.id} style={styles.documentPreview} numberOfLines={2}>
                                {doc.text}
                            </Text>
                        ))}
                        <Text style={styles.moreText}>
                            ...and {SAMPLE_DOCUMENTS.length - 3} more
                        </Text>
                    </View>
                    <TouchableOpacity
                        style={[styles.button, styles.indexButton]}
                        onPress={handleIndexDocuments}
                        disabled={isLoading}
                    >
                        <Text style={styles.buttonText}>Index {SAMPLE_DOCUMENTS.length} Documents</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Search */}
            {isInitialized && indexedCount > 0 && (
                <>
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Sample Queries</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            {SAMPLE_QUERIES.map((q, index) => (
                                <TouchableOpacity
                                    key={index}
                                    style={styles.sampleButton}
                                    onPress={() => loadSampleQuery(index)}
                                >
                                    <Text style={styles.sampleButtonText} numberOfLines={1}>
                                        {q.substring(0, 20)}...
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Search Query</Text>
                        <TextInput
                            style={styles.textInput}
                            value={queryText}
                            onChangeText={setQueryText}
                            placeholder="Enter your search query..."
                            placeholderTextColor="#999"
                            multiline
                        />
                    </View>

                    <View style={styles.buttonRow}>
                        <TouchableOpacity
                            style={[styles.button, styles.searchButton]}
                            onPress={handleSearch}
                            disabled={isLoading}
                        >
                            <Text style={styles.buttonText}>Search</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.button, styles.clearButton]}
                            onPress={handleClear}
                            disabled={isLoading}
                        >
                            <Text style={styles.buttonText}>Clear</Text>
                        </TouchableOpacity>
                    </View>
                </>
            )}

            {isLoading && (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#2196F3" />
                    <Text style={styles.loadingText}>Processing...</Text>
                </View>
            )}

            {error && (
                <View style={styles.errorCard}>
                    <Text style={styles.errorText}>{error}</Text>
                </View>
            )}

            {/* Embedding Info */}
            {embeddingDimensions > 0 && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Embedding Info</Text>
                    <View style={styles.embeddingCard}>
                        <Text style={styles.embeddingInfo}>
                            Storage: In-Memory
                        </Text>
                        <Text style={styles.embeddingInfo}>
                            Embedding Dimensions: {embeddingDimensions}
                        </Text>
                        <Text style={styles.embeddingInfo}>
                            Documents: {indexedCount}
                        </Text>
                    </View>
                </View>
            )}

            {/* Results */}
            {results.length > 0 && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Search Results</Text>
                    {results.map((result, index) => (
                        <View key={result.id} style={styles.resultCard}>
                            <View style={styles.resultHeader}>
                                <Text style={styles.resultRank}>#{index + 1}</Text>
                                <View
                                    style={[
                                        styles.similarityBadge,
                                        { backgroundColor: getSimilarityColor(result.similarity) },
                                    ]}
                                >
                                    <Text style={styles.similarityText}>
                                        {(result.similarity * 100).toFixed(1)}%
                                    </Text>
                                </View>
                            </View>
                            <Text style={styles.resultText}>{result.text}</Text>
                        </View>
                    ))}
                </View>
            )}

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
        backgroundColor: '#2196F3',
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
        marginBottom: 8,
    },
    statusLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
    },
    statusValue: {
        fontSize: 16,
        fontWeight: '600',
        color: '#2196F3',
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
    documentsPreview: {
        backgroundColor: '#FFF',
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
    },
    documentPreview: {
        fontSize: 14,
        color: '#666',
        marginBottom: 8,
        fontStyle: 'italic',
    },
    moreText: {
        fontSize: 12,
        color: '#999',
        textAlign: 'center',
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
    initButton: {
        backgroundColor: '#2196F3',
    },
    indexButton: {
        backgroundColor: '#4CAF50',
    },
    searchButton: {
        backgroundColor: '#2196F3',
    },
    clearButton: {
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
    resultHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    resultRank: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#2196F3',
        marginRight: 12,
    },
    similarityBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    similarityText: {
        color: '#FFF',
        fontSize: 12,
        fontWeight: '600',
    },
    resultText: {
        fontSize: 14,
        color: '#333',
        lineHeight: 20,
    },
    footer: {
        height: 40,
    },
    embeddingCard: {
        backgroundColor: '#FFF',
        padding: 16,
        borderRadius: 12,
    },
    embeddingInfo: {
        fontSize: 14,
        color: '#666',
        marginBottom: 4,
    },
});
