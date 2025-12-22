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
