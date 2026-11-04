'use client';
import { useState } from 'react';
import { List, ListInput, Button, Block } from 'konsta/react';
import { clientContainer } from '@/infrastructure/di/clientContainer';
import { TYPES } from '@/infrastructure/di/types';
import { IAuthService, ILogger } from '@lemonade/core';
import { useToast } from '@/presentation/context/ToastContext';
import { User, Mail, Lock } from 'lucide-react';

interface AuthFormProps {
    onSuccess?: () => void;
}

export function AuthForm({ onSuccess }: AuthFormProps) {
    const [mode, setMode] = useState<'login' | 'signup'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [loading, setLoading] = useState(false);

    const { showToast } = useToast();

    const handleSubmit = async () => {
        if (!email || !password) {
            showToast('Please fill in all fields', 'error');
            return;
        }

        if (mode === 'signup' && !username) {
            showToast('Please enter a username', 'error');
            return;
        }

        setLoading(true);
        try {
            const authService = clientContainer.get<IAuthService>(TYPES.AuthService);
            // const logger = clientContainer.get<ILogger>(TYPES.Logger);

            if (mode === 'signup') {
                await authService.signUpWithEmail(email, password, username);
                showToast('Account created successfully!', 'success');
            } else {
                await authService.signInWithEmail(email, password);
                showToast('Welcome back!', 'success');
            }

            if (onSuccess) onSuccess();
        } catch (error: unknown) {
            const logger = clientContainer.get<ILogger>(TYPES.Logger);
            logger.error('Authentication failed', error);
            let msg = 'Authentication failed';

            // Safe type casting for Firebase error codes
            const firebaseError = error as { code?: string };

            if (firebaseError.code === 'auth/email-already-in-use') msg = 'Email already in use';
            if (firebaseError.code === 'auth/invalid-credential') msg = 'Invalid email or password';
            if (firebaseError.code === 'auth/weak-password') msg = 'Password should be at least 6 characters';
            showToast(msg, 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full max-w-md mx-auto">
            <List
                strong
                inset
                className="!bg-zinc-900/50 !m-0 border border-zinc-800 backdrop-blur-sm rounded-2xl overflow-hidden"
            >
                <div className="p-4 text-center border-b border-zinc-800/50 mb-2">
                    <h2 className="text-xl font-bold text-white">
                        {mode === 'login' ? 'Master Access' : 'New Technician'}
                    </h2>
                    <p className="text-zinc-500 text-sm">
                        {mode === 'login' ? 'Enter credentials to continue' : 'Create profile to start diagnosing'}
                    </p>
                </div>

                <ListInput
                    label="Email"
                    type="email"
                    placeholder="tech@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    media={<Mail className="w-5 h-5 text-zinc-500" />}
                    inputClassName="!text-white placeholder:text-zinc-600"
                    className="!bg-transparent"
                />

                {mode === 'signup' && (
                    <ListInput
                        label="Username"
                        type="text"
                        placeholder="MasterTech_01"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        media={<User className="w-5 h-5 text-zinc-500" />}
                        inputClassName="!text-white placeholder:text-zinc-600"
                        className="!bg-transparent"
                    />
                )}

                <ListInput
                    label="Password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    media={<Lock className="w-5 h-5 text-zinc-500" />}
                    inputClassName="!text-white placeholder:text-zinc-600"
                    className="!bg-transparent"
                />
            </List>

            <Block className="!px-0 !mt-6 space-y-3">
                <Button
                    large
                    raised
                    onClick={handleSubmit}
                    disabled={loading}
                    className="bg-gradient-to-r from-yellow-500 to-orange-500 !text-black font-bold h-12"
                >
                    {loading ? 'Processing...' : mode === 'login' ? 'Grant Access' : 'Register Profile'}
                </Button>

                <Button
                    clear
                    onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                    className="!text-zinc-400 normal-case"
                >
                    {mode === 'login' ? 'New here? Create Account' : 'Already have access? Log In'}
                </Button>
            </Block>
        </div>
    );
}
