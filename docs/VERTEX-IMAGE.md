# Image understanding

The Gemini models are multimodal, meaning they can process image content effectively. You can send image data to the model and ask questions about the visual content, request descriptions, or extract specific data.

## Before you begin

This guide assumes you have already:
1.  Selected or created a Google Cloud project.
2.  Enabled the Vertex AI API.
3.  Installed the Vertex AI SDK for your preferred language.

> **Note:** For a quick interactive experience without writing code, try [Vertex AI Studio](https://console.cloud.google.com/vertex-ai/studio).

---

## Send an image understanding request

To analyze an image, you provide the image file to the model along with a text prompt.

**Best Practice:** You can provide images as inline data (base64 encoded) or via Google Cloud Storage (GCS). For production applications or larger files, using GCS (`gs://` URIs) is recommended.

**Select your platform to see the code:**

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

async function analyzeImage() {
  const imagePart = {
    fileData: {
      fileUri: 'gs://cloud-samples-data/generative-ai/image/scones.jpg',
      mimeType: 'image/jpeg',
    },
  };

  const textPart = {
    text: 'What is shown in this image?'
  };

  const request = {
    contents: [{role: 'user', parts: [imagePart, textPart]}],
  };

  const result = await generativeModel.generateContent(request);
  const response = result.response;
  console.log('Response: ', JSON.stringify(response));
}

analyzeImage();

```

#### **Python**

```python
import vertexai
from vertexai.generative_models import GenerativeModel, Part

# TODO(developer): Update Project ID and Location
vertexai.init(project="your-project-id", location="us-central1")

model = GenerativeModel("gemini-1.5-flash-001")

# Reference the image from Cloud Storage
image_file = Part.from_uri(
    uri="gs://cloud-samples-data/generative-ai/image/scones.jpg",
    mime_type="image/jpeg"
)

# The prompt to accompany the image
prompt = "What is shown in this image?"

response = model.generate_content([image_file, prompt])

print(response.text)

```

#### **Java**

```java
import com.google.cloud.vertexai.VertexAI;
import com.google.cloud.vertexai.api.GenerateContentResponse;
import com.google.cloud.vertexai.generativeai.ContentMaker;
import com.google.cloud.vertexai.generativeai.GenerativeModel;
import com.google.cloud.vertexai.generativeai.PartMaker;

public class ImageInput {
  public static void main(String[] args) throws Exception {
    // TODO(developer): Replace these variables before running the sample.
    String projectId = "your-project-id";
    String location = "us-central1";
    String modelName = "gemini-1.5-flash-001";

    try (VertexAI vertexAI = new VertexAI(projectId, location)) {
      GenerativeModel model = new GenerativeModel(modelName, vertexAI);

      String imageUri = "gs://cloud-samples-data/generative-ai/image/scones.jpg";
      String prompt = "What is shown in this image?";

      GenerateContentResponse response = model.generateContent(
          ContentMaker.fromMultiModalData(
              PartMaker.fromMimeTypeAndData("image/jpeg", imageUri),
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

func analyzeImage(w io.Writer, projectID, location, modelName string) error {
	ctx := context.Background()
	client, err := genai.NewClient(ctx, projectID, location)
	if err != nil {
		return fmt.Errorf("unable to create client: %w", err)
	}
	defer client.Close()

	model := client.GenerativeModel(modelName)

	// Given an image file URL
	part := genai.FileData{
		MIMEType: "image/jpeg",
		FileURI:  "gs://cloud-samples-data/generative-ai/image/scones.jpg",
	}

	res, err := model.GenerateContent(ctx, part, genai.Text("What is shown in this image?"))
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
            "mimeType": "image/jpeg",
            "fileUri": "gs://cloud-samples-data/generative-ai/image/scones.jpg"
          }
        },
        {
          "text": "What is shown in this image?"
        }
      ]
    }
  }'

```

---

## Supported image formats

The Gemini models support the following image MIME types:

* `image/png`
* `image/jpeg`
* `image/webp`
* `image/heic`
* `image/heif`

## Limitations and Quotas

* **Token Limits:** Images consume a specific number of tokens (typically 258 tokens per image for Gemini 1.5 models), which counts against the model's context window.
* **Inline Data Size:** When sending base64 images directly (Inline Data), the total request size is limited (typically 20MB). For larger files or batches, use Cloud Storage (`gs://`).
* **Resolution:** Models may downsample extremely high-resolution images, but generally support standard web resolutions effectively.

## Next steps

* Learn about [Multimodal prompting strategies](https://www.google.com/search?q=https://cloud.google.com/vertex-ai/generative-ai/docs/learn/prompts/multimodal-prompt-strategies).
* Explore [Safety settings](https://www.google.com/search?q=https://cloud.google.com/vertex-ai/generative-ai/docs/learn/safety-settings) to configure content filtering.

```

By the way, to unlock the full functionality of all Apps, enable [Gemini Apps Activity](https://myactivity.google.com/product/gemini).

```