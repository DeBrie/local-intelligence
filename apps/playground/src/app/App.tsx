import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HomeScreen, CoreDemoScreen, PIIDemoScreen, SentimentDemoScreen } from '../screens';

export type RootStackParamList = {
    Home: undefined;
    CoreDemo: undefined;
    PIIDemo: undefined;
    SentimentDemo: undefined;
    SearchDemo: undefined;
    ChatDemo: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function App() {
    return (
        <SafeAreaProvider>
            <NavigationContainer>
                <Stack.Navigator
                    initialRouteName="Home"
                    screenOptions={{
                        headerStyle: {
                            backgroundColor: '#1a1a2e',
                        },
                        headerTintColor: '#ffffff',
                        headerTitleStyle: {
                            fontWeight: '600',
                        },
                    }}
                >
                    <Stack.Screen
                        name="Home"
                        component={HomeScreen}
                        options={{ title: 'Local Intelligence' }}
                    />
                    <Stack.Screen
                        name="CoreDemo"
                        component={CoreDemoScreen}
                        options={{ title: 'Core Demo' }}
                    />
                    <Stack.Screen
                        name="PIIDemo"
                        component={PIIDemoScreen}
                        options={{ title: 'PII Redaction' }}
                    />
                    <Stack.Screen
                        name="SentimentDemo"
                        component={SentimentDemoScreen}
                        options={{ title: 'Sentiment Analysis' }}
                    />
                </Stack.Navigator>
            </NavigationContainer>
        </SafeAreaProvider>
    );
}

export default App;
