# Analyze video files using the Gemini API

You can use the Gemini API to analyze video files. When you use the Vertex AI for Firebase SDK, you can make this request directly from your app.

With this capability, you can do things like:
* Caption and answer questions about videos.
* Summarize video content.
* Extract data from video feeds.

## Before you begin

If you haven't already, complete the [getting started guide](https://firebase.google.com/docs/ai-logic/get-started) for the Vertex AI for Firebase SDK.

This guide assumes you have already:
1.  Set up a new or existing Firebase project.
2.  Connected your app to Firebase.
3.  Added the Vertex AI for Firebase SDK to your app.
4.  Initialized the Vertex AI service and the Generative Model in your app.

> **Note:** For testing and iterating on your prompts, we recommend using [Vertex AI Studio](https://cloud.google.com/vertex-ai/generative-ai/docs/start/quickstarts/quickstart-multimodal).

---

## Analyze a video file

To analyze a video, you must provide the video data to the model. The Vertex AI for Firebase SDK allows you to provide this data in two ways:

1.  **Cloud Storage for Firebase (Recommended):** Upload the file to a Cloud Storage bucket and pass the `gs://` URI to the model. This is more efficient and allows for larger file sizes.
2.  **Inline Data:** Pass the video data directly as a base64-encoded string. This is suitable for very short or small video clips.

### Option 1: Using Cloud Storage for Firebase (Recommended)

This method is recommended for most use cases, especially for larger files.

#### 1. Upload the file
Ensure your video file is uploaded to your Cloud Storage for Firebase bucket.

#### 2. Include the file in your prompt
Use the SDK to create a reference to the file using its Storage URI (e.g., `gs://your-bucket/video.mp4`) and include it in your prompt generation request.

**Select your platform to see the code:**

#### **Swift**

```swift
import FirebaseVertexAI

// Initialize the Vertex AI service
let vertex = VertexAI.vertexAI()

// Initialize the generative model with a model that supports multimodal input
let model = vertex.generativeModel(modelName: "gemini-1.5-flash")

// Create the file reference
// Ideally, you would upload this file to Cloud Storage from your app,
// effectively getting the URL from the upload operation.
let videoFile = "gs://your-bucket-name/path/to/video.mp4"

let prompt = "What is happening in this video?"

// Generate content
let response = try await model.generateContent(videoFile, prompt)
if let text = response.text {
    print(text)
}

```

#### **Kotlin (Android)**

```kotlin
val vertexAI = Firebase.vertexAI
val model = vertexAI.generativeModel("gemini-1.5-flash")

// Create the file reference
val videoFile = "gs://your-bucket-name/path/to/video.mp4"

val prompt = "Describe this video."

// Generate content
// generateContent is a suspend function
val response = model.generateContent(
    content {
        fileData(videoFile, "video/mp4")
        text(prompt)
    }
)
print(response.text)

```

#### **Java (Android)**

```java
GenerativeModel gm = FirebaseVertexAI.getInstance()
        .getGenerativeModel("gemini-1.5-flash");

// Create the file reference
String videoFile = "gs://your-bucket-name/path/to/video.mp4";

Content content = new Content.Builder()
    .addFileData(videoFile, "video/mp4")
    .addText("Describe this video.")
    .build();

ListenableFuture<GenerateContentResponse> response = gm.generateContent(content);

Futures.addCallback(response, new FutureCallback<GenerateContentResponse>() {
    @Override
    public void onSuccess(GenerateContentResponse result) {
        System.out.println(result.getText());
    }
    @Override
    public void onFailure(Throwable t) {
        t.printStackTrace();
    }
}, executor);

```

#### **Web**

```javascript
import { getVertexAI, getGenerativeModel } from "firebase/vertexai";
import { initializeApp } from "firebase/app";

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Vertex AI
const vertexAI = getVertexAI(app);

// Initialize the generative model
const model = getGenerativeModel(vertexAI, { model: "gemini-1.5-flash" });

async function run() {
  const videoFile = {
    fileData: {
        fileUri: "gs://your-bucket-name/path/to/video.mp4",
        mimeType: "video/mp4"
    }
  };

  const prompt = "What is in this video?";

  const result = await model.generateContent([prompt, videoFile]);
  const response = result.response;
  console.log(response.text());
}

run();

```

#### **Flutter**

```dart
final model = FirebaseVertexAI.instance.generativeModel(
  model: 'gemini-1.5-flash',
);

final prompt = [
  Content.text('What is in this video?'),
  Content.fileData(
    'gs://your-bucket-name/path/to/video.mp4',
    mimeType: 'video/mp4',
  ),
];

final response = await model.generateContent(prompt);
print(response.text);

```

---

### Option 2: Using Inline Data

If you cannot use Cloud Storage, you can pass the video file directly as inline data (base64 encoded).

> **Important:** This method increases the size of the request payload and is subject to stricter size limits (usually 20MB).

#### **Swift**

```swift
import FirebaseVertexAI

let vertex = VertexAI.vertexAI()
let model = vertex.generativeModel(modelName: "gemini-1.5-flash")

// Load video data (assumes video exists in bundle for this example)
guard let videoURL = Bundle.main.url(forResource: "my_video", withExtension: "mp4"),
      let videoData = try? Data(contentsOf: videoURL) else { fatalError("Video not found") }

let prompt = "Analyze the movement in this video."

let response = try await model.generateContent(
    InlineDataPart(data: videoData, mimeType: "video/mp4"),
    prompt
)

print(response.text ?? "")

```

#### **Kotlin (Android)**

```kotlin
val vertexAI = Firebase.vertexAI
val model = vertexAI.generativeModel("gemini-1.5-flash")

// Assume you have the byte array of the video
val videoBytes: ByteArray = ... 

val prompt = "Analyze this video."

val response = model.generateContent(
    content {
        inlineData(videoBytes, "video/mp4")
        text(prompt)
    }
)
print(response.text)

```

#### **Web**

```javascript
import { getVertexAI, getGenerativeModel } from "firebase/vertexai";

// Helper function to convert File to Base64
async function fileToGenerativePart(file) {
  const base64EncodedDataPromise = new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(file);
  });
  return {
    inlineData: {
      data: await base64EncodedDataPromise,
      mimeType: file.type,
    },
  };
}

const vertexAI = getVertexAI(app);
const model = getGenerativeModel(vertexAI, { model: "gemini-1.5-flash" });

async function run() {
  const fileInputEl = document.querySelector("input[type=file]");
  const imagePart = await fileToGenerativePart(fileInputEl.files[0]);
  
  const prompt = "Describe what happens in this video.";
  
  const result = await model.generateContent([prompt, imagePart]);
  console.log(result.response.text());
}

```

---

## Supported Video Formats and Limitations

The Gemini models support the following video MIME types:

* `video/mp4`
* `video/mpeg`
* `video/mov`
* `video/avi`
* `video/x-flv`
* `video/mpg`
* `video/webm`
* `video/wmv`
* `video/3gpp`

### Constraints

* **Audio:** The model can analyze audio within the video file.
* **Token Usage:** Video files consume a significant number of tokens. Be aware of the token limits of the model you are using (e.g., Gemini 1.5 Flash vs Gemini 1.5 Pro).
* **Duration:** While specific limits depend on the model's context window, extremely long videos may exceed the token limit.

## Next steps

* Learn how to [count tokens](https://firebase.google.com/docs/ai-logic/count-tokens) to estimate costs and usage.
* Explore [chat prompts](https://firebase.google.com/docs/ai-logic/chat) to create conversational experiences.

```

By the way, to unlock the full functionality of all Apps, enable [Gemini Apps Activity](https://myactivity.google.com/product/gemini).

```