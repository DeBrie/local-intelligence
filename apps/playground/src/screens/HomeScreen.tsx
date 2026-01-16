import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../app/App';

type HomeScreenProps = {
    navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

const features = [
    {
        id: 'core',
        title: 'Core',
        description: 'Device capabilities, model management, and cache',
        screen: 'CoreDemo' as const,
        available: true,
    },
    {
        id: 'pii',
        title: 'PII Redaction',
        description: 'Detect and redact personal information',
        screen: 'PIIDemo' as const,
        available: true,
    },
    {
        id: 'sentiment',
        title: 'Sentiment Analysis',
        description: 'Analyze text sentiment (positive/negative/neutral)',
        screen: 'SentimentDemo' as const,
        available: true,
    },
    {
        id: 'search',
        title: 'Semantic Search',
        description: 'Vector embeddings and similarity search',
        screen: 'SearchDemo' as const,
        available: false,
    },
    {
        id: 'chat',
        title: 'Chat',
        description: 'On-device LLM conversation',
        screen: 'ChatDemo' as const,
        available: false,
    },
];

export function HomeScreen({ navigation }: HomeScreenProps) {
    return (
        <ScrollView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>@debrie/local-intelligence</Text>
                <Text style={styles.subtitle}>On-Device AI Playground</Text>
            </View>

            <View style={styles.featuresContainer}>
                {features.map((feature) => (
                    <TouchableOpacity
                        key={feature.id}
                        style={[
                            styles.featureCard,
                            !feature.available && styles.featureCardDisabled,
                        ]}
                        onPress={() => {
                            if (feature.available) {
                                navigation.navigate(feature.screen);
                            }
                        }}
                        disabled={!feature.available}
                    >
                        <View style={styles.featureHeader}>
                            <Text style={styles.featureTitle}>{feature.title}</Text>
                            {!feature.available && (
                                <View style={styles.comingSoonBadge}>
                                    <Text style={styles.comingSoonText}>Coming Soon</Text>
                                </View>
                            )}
                        </View>
                        <Text style={styles.featureDescription}>{feature.description}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <View style={styles.footer}>
                <Text style={styles.footerText}>
                    Privacy-first AI • No cloud required
                </Text>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    header: {
        padding: 24,
        backgroundColor: '#1a1a2e',
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: '#ffffff',
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 16,
        color: '#a0a0a0',
    },
    featuresContainer: {
        padding: 16,
    },
    featureCard: {
        backgroundColor: '#ffffff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    featureCardDisabled: {
        opacity: 0.6,
    },
    featureHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    featureTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#1a1a2e',
    },
    featureDescription: {
        fontSize: 14,
        color: '#666666',
    },
    comingSoonBadge: {
        backgroundColor: '#e0e0e0',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    comingSoonText: {
        fontSize: 10,
        fontWeight: '600',
        color: '#666666',
    },
    footer: {
        padding: 24,
        alignItems: 'center',
    },
    footerText: {
        fontSize: 12,
        color: '#999999',
    },
});
