jest.mock('@react-native-google-signin/google-signin', () => ({
    GoogleSignin: {
        configure: jest.fn(),
        hasPlayServices: jest.fn(() => Promise.resolve(true)),
        signIn: jest.fn(() => Promise.resolve({ user: { id: 'test-id' } })),
        signOut: jest.fn(() => Promise.resolve()),
        isSignedIn: jest.fn(() => Promise.resolve(true)),
        getTokens: jest.fn(() => Promise.resolve({ idToken: 'test-token' })),
    },
    statusCodes: {
        SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
        IN_PROGRESS: 'IN_PROGRESS',
        PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
    },
}));

// Silence the Expo Winter runtime error
jest.mock('expo/src/winter/runtime.native.ts', () => ({
    install: jest.fn(),
}), { virtual: true });

import 'react-native-gesture-handler/jestSetup';

jest.mock('react-native-reanimated', () => {
    const Reanimated = require('react-native-reanimated/mock');
    Reanimated.default.call = () => { };
    return Reanimated;
});

// Silence the warning: Animated: `useNativeDriver` is not supported because the native animated module is missing
// Silence the warning: Animated: `useNativeDriver` is not supported because the native animated module is missing

// Mock Firebase globally to prevent ESM import errors
jest.mock('firebase/app', () => ({
    initializeApp: jest.fn(),
    getApps: jest.fn(() => []),
    getApp: jest.fn(),
}));

jest.mock('firebase/auth', () => ({
    getAuth: jest.fn(),
    initializeAuth: jest.fn(),
    getReactNativePersistence: jest.fn(),
}));

jest.mock('firebase/firestore', () => {
    class MockTimestamp {
        constructor(seconds, nanoseconds) {
            this.seconds = seconds;
            this.nanoseconds = nanoseconds;
        }
        static fromDate = jest.fn((date) => new MockTimestamp(date.getTime() / 1000, 0));
        static now = jest.fn(() => new MockTimestamp(Date.now() / 1000, 0));
        toDate() { return new Date(this.seconds * 1000); }
    }
    return {
        getFirestore: jest.fn(),
        doc: jest.fn(),
        onSnapshot: jest.fn(),
        updateDoc: jest.fn(),
        arrayUnion: jest.fn(),
        collection: jest.fn(),
        getDoc: jest.fn(),
        Timestamp: MockTimestamp,
    };
});

jest.mock('firebase/storage', () => ({
    getStorage: jest.fn(),
    ref: jest.fn(),
    uploadBytesResumable: jest.fn(() => ({
        on: jest.fn((event, progress, error, success) => {
            if (success) success();
        }),
        snapshot: { ref: {} }
    })),
    getDownloadURL: jest.fn(() => Promise.resolve('https://mock-url.com')),
}));

jest.mock('expo-file-system', () => ({
    writeAsStringAsync: jest.fn(),
    readAsStringAsync: jest.fn(),
    deleteAsync: jest.fn(),
    moveAsync: jest.fn(),
    copyAsync: jest.fn(),
    makeDirectoryAsync: jest.fn(),
    getInfoAsync: jest.fn(() => Promise.resolve({ exists: true, isDirectory: true })),
    cacheDirectory: 'file:///cache/',
    documentDirectory: 'file:///document/',
    EncodingType: { Base64: 'base64', UTF8: 'utf8' },
}));

jest.mock('react-native-vision-camera', () => ({
    Camera: () => null,
    useCameraDevice: jest.fn(() => ({ id: 'test-device' })),
    useCameraPermission: jest.fn(() => ({ hasPermission: true, requestPermission: jest.fn() })),
    useFrameProcessor: jest.fn(),
    useCameraDevices: jest.fn(() => ([{ position: 'back' }])),
}));

jest.mock('vision-camera-resize-plugin', () => ({
    useResizePlugin: jest.fn(() => ({ resize: jest.fn() })),
}));

jest.mock('llama.rn', () => ({
    initLlama: jest.fn(() => Promise.resolve({
        completion: jest.fn(() => Promise.resolve({ text: 'part: state' })),
        release: jest.fn(),
    })),
    LlamaContext: jest.fn(),
}));

// Mock MobileLogger globally
jest.mock('./services/MobileLogger', () => ({
    MobileLogger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

// Mock LocalPerceptionContext globally for convenience (optional, but good for stability)
jest.mock('./context/LocalPerceptionContext', () => ({
    useLocalPerception: jest.fn(() => ({
        localPerception: {
            triageFrame: jest.fn(),
            isReady: jest.fn().mockReturnValue(true),
        }
    })),
}));
