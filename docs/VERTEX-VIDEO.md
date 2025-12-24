# Vertex Video understanding

The Gemini models are multimodal, meaning they can process video content effectively. You can send video data to the model and ask questions about the content, request summaries, or extract specific data.

## Before you begin

This guide assumes you have already:
1.  Selected or created a Google Cloud project.
2.  Enabled the Vertex AI API.
3.  Installed the Vertex AI SDK for your preferred language.

> **Note:** For a quick interactive experience without writing code, try [Vertex AI Studio](https://console.cloud.google.com/vertex-ai/studio).

---

## Send a video understanding request

To analyze a video, you provide the video file to the model along with a text prompt.

**Best Practice:** For video files, it is highly recommended to use Google Cloud Storage (GCS). You upload the file to a GCS bucket and pass the `gs://` URI to the model.

**Select your platform to see the code:**

#### **Python**

```python
import vertexai
from vertexai.generative_models import GenerativeModel, Part

# TODO(developer): Update Project ID and Location
vertexai.init(project="your-project-id", location="us-central1")

model = GenerativeModel("gemini-1.5-flash-001")

# The prompt to accompany the video
prompt = "What is happening in this video?"

# Reference the video file from Cloud Storage
# Supported MIME types: video/mp4, video/mpeg, video/mov, video/avi, etc.
video_file = Part.from_uri(
    uri="gs://cloud-samples-data/video/animals.mp4",
    mime_type="video/mp4"
)

response = model.generate_content([video_file, prompt])

print(response.text)

```

#### **Node.js**

```javascript
const {VertexAI} = require('@google-cloud/vertexai');

// Initialize Vertex with your Cloud project and location
const vertex_ai = new VertexAI({project: 'your-project-id', location: 'us-central1'});
const model = 'gemini-1.5-flash-001';

// Instantiate the model
const generativeModel = vertex_ai.preview.getGenerativeModel({
  model: model,
  generationConfig: {
    'maxOutputTokens': 2048,
    'temperature': 0.4,
    'topP': 1,
  },
});

async function analyzeVideo() {
  const filePart = {
    fileData: {
      fileUri: 'gs://cloud-samples-data/video/animals.mp4',
      mimeType: 'video/mp4',
    },
  };

  const textPart = {
    text: 'Describe the animals in this video.'
  };

  const request = {
    contents: [{role: 'user', parts: [filePart, textPart]}],
  };

  const result = await generativeModel.generateContent(request);
  const response = result.response;
  console.log('Response: ', JSON.stringify(response));
}

analyzeVideo();

```

#### **Java**

```java
import com.google.cloud.vertexai.VertexAI;
import com.google.cloud.vertexai.api.GenerateContentResponse;
import com.google.cloud.vertexai.generativeai.ContentMaker;
import com.google.cloud.vertexai.generativeai.GenerativeModel;
import com.google.cloud.vertexai.generativeai.PartMaker;

public class VideoInput {
  public static void main(String[] args) throws Exception {
    // TODO(developer): Replace these variables before running the sample.
    String projectId = "your-project-id";
    String location = "us-central1";
    String modelName = "gemini-1.5-flash-001";

    try (VertexAI vertexAI = new VertexAI(projectId, location)) {
      GenerativeModel model = new GenerativeModel(modelName, vertexAI);

      String videoUri = "gs://cloud-samples-data/video/animals.mp4";
      String prompt = "What is in this video?";

      GenerateContentResponse response = model.generateContent(
          ContentMaker.fromMultiModalData(
              PartMaker.fromMimeTypeAndData("video/mp4", videoUri),
              prompt
          ));

      System.out.println(response.getCandidates(0).getContent().getParts(0).getText());
    }
  }
}

```

#### **Go**

```go
import (
	"context"
	"fmt"
	"io"

	"[cloud.google.com/go/vertexai/genai](https://cloud.google.com/go/vertexai/genai)"
)

func analyzeVideo(w io.Writer, projectID, location, modelName string) error {
	ctx := context.Background()
	client, err := genai.NewClient(ctx, projectID, location)
	if err != nil {
		return fmt.Errorf("unable to create client: %w", err)
	}
	defer client.Close()

	model := client.GenerativeModel(modelName)

	// Given a video file URL
	part := genai.FileData{
		MIMEType: "video/mp4",
		FileURI:  "gs://cloud-samples-data/video/animals.mp4",
	}

	res, err := model.GenerateContent(ctx, part, genai.Text("Describe this video."))
	if err != nil {
		return fmt.Errorf("generate content: %w", err)
	}

	fmt.Fprintf(w, "generated response: %s\n", res.Candidates[0].Content.Parts[0])
	return nil
}

```

#### **REST**

```bash
# TODO(Developer): authenticate before running
# gcloud auth print-access-token

curl -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  [https://us-central1-aiplatform.googleapis.com/v1/projects/YOUR_PROJECT_ID/locations/us-central1/publishers/google/models/gemini-1.5-flash-001:generateContent](https://us-central1-aiplatform.googleapis.com/v1/projects/YOUR_PROJECT_ID/locations/us-central1/publishers/google/models/gemini-1.5-flash-001:generateContent) \
  -d '{
    "contents": {
      "role": "user",
      "parts": [
        {
          "fileData": {
            "mimeType": "video/mp4",
            "fileUri": "gs://cloud-samples-data/video/animals.mp4"
          }
        },
        {
          "text": "What is happening in this video?"
        }
      ]
    }
  }'

```

---

## Supported video formats

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

## Limitations and Quotas

* **Audio:** The model processes the audio track of the video as well.
* **Token Limits:** Video input counts towards the model's token limit. The number of tokens used depends on the video duration and the frame sampling rate of the model.
* **GCS Only:** For the Python, Java, Node.js, and Go SDKs, reading video files directly from your local file system (Inline Data) is generally restricted by size limits. Using Cloud Storage (`gs://`) is the recommended approach for video.

## Next steps

* Learn about [Multimodal prompting strategies](https://www.google.com/search?q=https://cloud.google.com/vertex-ai/generative-ai/docs/learn/prompts/multimodal-prompt-strategies).
* Explore [Safety settings](https://www.google.com/search?q=https://cloud.google.com/vertex-ai/generative-ai/docs/learn/safety-settings) to configure content filtering.

```

By the way, to unlock the full functionality of all Apps, enable [Gemini Apps Activity](https://myactivity.google.com/product/gemini).

```