import { initializeApp } from 'firebase-admin/app';

// Initialize Firebase Admin globally
initializeApp();

// Export functions from modules
export * from './video';
export * from './payments';
