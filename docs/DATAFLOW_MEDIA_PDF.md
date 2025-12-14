# Data Flow: Media Uploads

This document outlines the sequential data flow for handling media (Video/Audio) in the Lemonade MVP.

## The Problem
We need to handle large video files for analysis without:
1.  Overloading the Next.js server (Vercel limits).
2.  Adding latency to the "Eyes" of the AI.

## The Solution: "Direct-to-Cloud"

We use a "Sequential Thinking" approach to manage this lifecycle.

### Step 1: The Handshake (Client-Side)
**Goal:** bypass the Next.js middleware limit.

1.  **User Selects File**: User records a video or audio clip.
2.  **Request Signing**: Client calls `/api/upload/sign` with `filename` and `contentType`.
3.  **Authentication**: Server verifies Firebase Auth token.
4.  **Authorization**: Server checks if `userId` owns the session.
5.  **Generation**: Server uses `firebase-admin` (Storage) to generate a **Signed V4 URL** (Direct Write access for 15 mins).
6.  **Response**: Server returns `{ uploadUrl, publicUrl }`.

### Step 2: The Direct Upload (Client -> GCS)
**Goal:** get the heavy bits into google's brain.

1.  **Action**: Client uses `fetch(uploadUrl, { method: 'PUT', body: file })`.
2.  **Logic**: This bypasses our backend entirely. The bytes flow from the User's browser -> Google Cloud Storage bucket.
3.  **Result**: File is now at `gs://[bucket-name]/[session-id]/[filename]`.

### Step 3: The Trigger (Client -> specific Backend Service)
**Goal:** tell the brain the data is ready.

1.  **Client Signal**: Client calls `/api/analysis/trigger`.
2.  **Payload**: `{ sessionId, fileUrl, fileType }`.
3.  **Server Validation**: Server checks `fileUrl` domain matches our bucket (security).

### Step 4: Intelligent Processing

**Service**: `VideoAnalysisService` receiving the `gs://` URI.
**AI Request**: Calls `VertexAI` with the URI directly.
**Processing**: Gemini Flash (or Pro) watches the video from the bucket.
**Output**: Returns textual diagnosis.
**Transformation**: Diagnosis is stored as a standard Chat Message in `ChatRepository`.

## Summary Checklist

- [x] **Upload**: Direct-to-GCS via Signed URLs.
- [x] **Security**: Token validation before signing.
- [x] **Intelligence**: Pro Model used for "Heavy Reasoning" on video content.
