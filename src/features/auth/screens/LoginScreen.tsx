import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import ApiService from '../../shared/services/apiService';
import { useAuth } from '../providers/AuthProvider';

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0f172a',
    },
    bgBlueGlow: {
        position: 'absolute',
        left: -96,
        top: 56,
        width: 224,
        height: 224,
        borderRadius: 112,
        backgroundColor: 'rgba(59, 130, 246, 0.3)',
    },
    bgCyanGlow: {
        position: 'absolute',
        right: -80,
        bottom: 80,
        width: 256,
        height: 256,
        borderRadius: 128,
        backgroundColor: 'rgba(34, 211, 238, 0.2)',
    },
    contentWrapper: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    card: {
        overflow: 'hidden',
        borderRadius: 32,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        paddingHorizontal: 20,
        paddingVertical: 32,
    },
    header: {
        marginBottom: 32,
    },
    badge: {
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        color: '#1d4ed8',
    },
    title: {
        marginTop: 8,
        fontSize: 30,
        fontWeight: '900',
        color: '#0f172a',
    },
    subtitle: {
        marginTop: 8,
        fontSize: 14,
        lineHeight: 21,
        color: '#475569',
    },
    inputGroup: {
        gap: 12,
    },
    input: {
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#cbd5e1',
        backgroundColor: '#f1f5f9',
        paddingHorizontal: 16,
        paddingVertical: 16,
        fontSize: 16,
        color: '#0f172a',
    },
    loginButton: {
        marginTop: 8,
        borderRadius: 16,
        backgroundColor: '#2563eb',
        paddingHorizontal: 16,
        paddingVertical: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loginButtonText: {
        textAlign: 'center',
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
    footer: {
        marginTop: 24,
        textAlign: 'center',
        fontSize: 12,
        lineHeight: 18,
        color: '#94a3b8',
    },
});

function LoginScreen(): React.JSX.Element {
    const { signIn } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    async function handleLogin(): Promise<void> {
        if (!username.trim() || !password.trim()) {
            Alert.alert('Validation', 'Please fill in all fields');
            return;
        }

        setLoading(true);
        try {
            const response = await ApiService.login(username, password);

            if (!response.token || !response.user) {
                Alert.alert('Error', response.message || 'Login failed');
                return;
            }

            // Restrict mobile login to Admin and Staff roles only
            const role = (response.user.Role || '').toString().toLowerCase();
            const allowedByRole = role === 'admin' || role === 'staff';
            const allowedById = typeof response.user.UserRoleID === 'number' && (response.user.UserRoleID === 1 || response.user.UserRoleID === 2);

            if (!allowedByRole && !allowedById) {
                Alert.alert('Access denied', "This mobile app is restricted to Administrator and Staff users only.");
                return;
            }

            await signIn(response.user, response.token);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Login failed';
            Alert.alert('Login Error', message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.bgBlueGlow} />
            <View style={styles.bgCyanGlow} />

            <View style={styles.contentWrapper}>
                <View style={styles.card}>
                    <View style={styles.header}>
                        <Text style={styles.badge}>GSO Mobile</Text>
                        <Text style={styles.title}>Inventory Scanner</Text>
                        <Text style={styles.subtitle}>
                            Offline QR capture for RPCPPE and RPCSEP with secure sync when connectivity
                            returns.
                        </Text>
                    </View>

                    <View style={styles.inputGroup}>
                        <TextInput
                            style={styles.input}
                            placeholder="Username"
                            placeholderTextColor="#94a3b8"
                            value={username}
                            onChangeText={setUsername}
                            editable={!loading}
                            autoCapitalize="none"
                        />

                        <TextInput
                            style={styles.input}
                            placeholder="Password"
                            placeholderTextColor="#94a3b8"
                            value={password}
                            onChangeText={setPassword}
                            editable={!loading}
                            secureTextEntry
                        />

                        <TouchableOpacity
                            style={styles.loginButton}
                            onPress={() => void handleLogin()}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.loginButtonText}>Login</Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.footer}>
                        Designed for unstable networks, and local queue persistence.
                    </Text>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

export default LoginScreen;
