'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useToast } from '@/presentation/context';
import { clientContainer } from '@/infrastructure/di/clientContainer';
import { TYPES } from '@/infrastructure/di/types';
import { IAuthService } from '@lemonade/core';
import { AuthForm } from '@/presentation/components/auth/AuthForm';

import { Page, Block, Button } from 'konsta/react';

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  useEffect(() => {
    if (!loading && user) {
      router.push('/garage');
    }
  }, [user, loading, router]);

  const handleLogin = async () => {
    try {
      const authService = clientContainer.get<IAuthService>(TYPES.AuthService);
      await authService.signInWithGoogle();
    } catch (error: unknown) {
      console.error("Login failed:", error); // Explicitly use error
      showToast('Login failed. Please try again.', 'error');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-yellow-400"></div>
      </div>
    );
  }

  return (
    <Page className="!bg-black">
      <div className="flex flex-col min-h-full justify-center pb-safe">

        {/* HEADER SECTION */}
        <Block className="text-center space-y-2 mb-8 mt-12">
          <h1 className="text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
            LEMONADE
          </h1>
          <p className="text-zinc-400 font-mono text-lg uppercase tracking-widest">
            Master Technician
          </p>
        </Block>

        {/* AUTH FORM SECTION */}
        <Block className="!px-4 !my-0">
          <AuthForm />
        </Block>

        {/* GOOGLE AUTH SECTION */}
        <Block className="mt-8">
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-zinc-800" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-black px-2 text-zinc-500">Or continue with</span>
            </div>
          </div>

          <Button
            large
            tonal
            onClick={handleLogin}
            className="google-sign-innative-hide !bg-zinc-900 !text-white border border-zinc-800 flex items-center justify-center gap-3 h-12"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Google
          </Button>
        </Block>

      </div>
    </Page>
  );
}

