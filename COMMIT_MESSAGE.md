refactor: Major architectural overhaul - migrate to service-oriented design with enhanced mobile support

This commit represents a comprehensive refactoring of the Lemonade codebase, transitioning from a monolithic diagnostic service architecture to a modular, service-oriented design aligned with SOLID principles and the neuro-symbolic architecture pattern.

## Core Architecture Changes

### Service Layer Refactoring
- **Removed**: `DiagnosticService` - monolithic service replaced with specialized services
- **Added**: `MechanicReasoningService` - orchestrates AI reasoning workflows
- **Added**: `ChatService` - handles chat interactions and message processing
- **Added**: `SessionService` - manages diagnostic session lifecycle
- **Added**: `VideoAnalysisService` - processes video/audio analysis requests
- **Added**: `VoiceService` - handles voice command processing
- **Added**: `BillingService` - manages subscription and billing operations

### Infrastructure Improvements
- **Added**: `ApiClient` - centralized HTTP client with authentication handling
- **Added**: `EmbeddingService` - vector embedding generation for semantic search
- **Added**: `FirestoreVectorRepository` - vector storage and retrieval
- **Added**: `NHTSAService` - external API integration for recall checks
- **Added**: `ServerAuthService` - server-side authentication abstraction
- **Removed**: `middleware.ts` - authentication middleware consolidated into services

### UI/UX Enhancements

#### Mobile App (React Native)
- Integrated **Konsta UI** for native iOS/Android theming
- Enhanced VIN scanning with native bridge integration and manual fallback
- Improved session history with swipeable delete gestures
- Added VIN scanner component with barcode detection
- Refactored garage screen with improved vehicle cards
- Enhanced chat interface with native message bar components
- Added hybrid bridge for native-web communication

#### Web Application
- Migrated garage components to Konsta UI components
- Enhanced file upload with drag-and-drop support
- Improved session workspace with better chat streaming
- Removed video/voice UI components (moved to native layer)
- Updated authentication context with improved error handling

### Removed Features
- **Video/Voice UI Components**: `CameraWorkspace`, `VideoViewport`, `VoiceInput`, `SafetyOverlay`
  - These features moved to native React Native layer for better performance
- **Web Search Tool**: Removed `webSearch.ts` and related tests
- **VAD (Voice Activity Detection)**: Removed WASM files and worklet bundles
- **Diagnostic Service**: Replaced with specialized service layer
- **PWA Assets**: Removed manifest and icon files (handled by native app)

### API & Documentation
- **Added**: Comprehensive API documentation
  - `docs/BATCH-API.md` - Batch processing endpoints
  - `docs/EPHEMERAL-TOKENS.md` - Token management
  - `docs/FILES-API.md` - File upload and analysis
  - `docs/LIVE-SESSIONS.md` - Real-time session management
  - `docs/LONG-CONTEXT.md` - Context window handling
  - `docs/MODELS.md` - AI model configuration
  - `docs/VIDEO-UNDERSTANDING.md` - Video analysis pipeline

### Type System & Configuration
- Enhanced TypeScript path aliases (`@core/*`, `@infrastructure/*`, `@application/*`, `@presentation/*`)
- Updated `tsconfig.json` with improved module resolution
- Added new type definitions for AI services and neuro-symbolic contracts
- Improved error code definitions

### Dependency Updates
- Updated package dependencies across web and mobile
- Added Konsta UI and related mobile dependencies
- Updated Firebase SDK configurations
- Improved Cloud Functions configuration

### Code Quality Improvements
- Standardized error handling with `AppError` class
- Improved logging with structured logger interface
- Enhanced dependency injection container setup
- Better separation of concerns between layers
- Improved type safety across the codebase

## Breaking Changes
- `DiagnosticService` interface removed - use specialized services instead
- Video/voice UI components removed from web - use native app for these features
- Middleware authentication removed - handled by service layer
- Web search functionality removed

## Migration Notes
- Update imports from `DiagnosticService` to appropriate service (`ChatService`, `SessionService`, etc.)
- Video/voice features now require native app
- Authentication now handled through `ServerAuthService` on server, `AuthService` on client

## Files Changed
- 104 files modified
- 13,013 insertions(+)
- 16,897 deletions(-)
- Multiple new service implementations and infrastructure components
- Comprehensive mobile app enhancements

This refactoring establishes a solid foundation for scaling the application while maintaining clean architecture principles and improving the mobile user experience.

