import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

/**
 * Model IDs live in exactly one place: packages/core/src/config/models.ts.
 * Writing one of these strings anywhere else fails the lint, so a model
 * change is one edit in that file. The two retired previews are banned too,
 * so nobody re-adds a model that is already gone or shutting down.
 */
const BANNED_MODEL_IDS = [
    'gemini-3.8-live',
    'grok-voice-3.0',
    'nova-3',
    'sonic-3',
    'gemini-live-2.5-flash-native-audio',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'text-embedding-004',
    'gemini-2.5-flash-preview-tts',
    'gemini-2.5-flash-native-audio-preview-09-2025',
    'gemini-2.5-flash-native-audio-preview-12-2025',
];

const eslintConfig = defineConfig([
    ...nextVitals,
    ...nextTs,
    // Override default ignores of eslint-config-next.
    globalIgnores([
        // Default ignores of eslint-config-next:
        '.next/**',
        'out/**',
        'build/**',
        'next-env.d.ts',
        'functions/lib/**',
        'packages/core/dist/**',
        'packages/infrastructure/dist/**',
        'packages/core/src/**/*.d.ts',
        'public/**',
        'coverage/**',
        'playwright-report/**',
        'test-results/**',
    ]),
    {
        rules: {
            '@typescript-eslint/no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
            ],
        },
    },
    {
        // Model IDs live in packages/core/src/config/models.ts and nowhere else.
        // (This file is ignored here because the banned list itself is written in it.)
        files: ['**/*.{ts,tsx,mts,cts,js,mjs,cjs}'],
        ignores: ['**/packages/core/src/config/models.ts', 'eslint.config.mjs'],
        rules: {
            'no-restricted-syntax': [
                'error',
                ...BANNED_MODEL_IDS.map((model) => ({
                    selector: `Literal[value='${model}']`,
                    message: `Model ID '${model}' must be imported from '@lemonade/core' (packages/core/src/config/models.ts), not written inline.`,
                })),
            ],
        },
    },
    {
        // jest.mock factories are hoisted above imports, so they must use require().
        files: ['mobile/**/__tests__/**/*.{ts,tsx}'],
        rules: {
            '@typescript-eslint/no-require-imports': 'off',
        },
    },
    {
        files: ['**/*.cjs', '**/*.js', '**/jest.config.js', '**/jest.setup.js', '**/metro.config.js'],
        rules: {
            '@typescript-eslint/no-require-imports': 'off',
            '@typescript-eslint/no-var-requires': 'off',
        },
    },
]);

export default eslintConfig;
