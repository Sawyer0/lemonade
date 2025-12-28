# Thinking | Generative AI on Vertex AI

Thinking models are trained to generate the "thinking process" the model goes through as part of its response. As a result, thinking models are capable of stronger reasoning capabilities in its responses than equivalent base models.

The thinking process is enabled by default. When you use Vertex AI Studio, you can view the full thinking process together with the model's generated response.

## Supported models

Thinking is supported in the following models:

* **Gemini 3 Flash preview**
* **Gemini 3 Pro preview**
* **Gemini 3 Pro Image preview**
* **Gemini 2.5 Pro**
* **Gemini 2.5 Flash preview**
* **Gemini 2.5 Flash-Lite preview**
* **Gemini 2.5 Flash**
* **Gemini 2.5 Flash-Lite**

## Use a thinking model

**Note:** Fine-tuning isn't supported when thinking is enabled.

To use thinking with a supported model, do the following:

### Console

1.  Open **Vertex AI Studio > Create prompt**.
2.  In the Model panel, click **Switch model** and select one of the supported models from the menu.
3.  *(Gemini 2.5 Flash only)* Thinking budget is set to **Auto** by default when the model is loaded. To turn thinking off, set Thinking budget to **Off**.
4.  (Optional) Give the model some detailed instructions on how the model should format its responses in the **System instructions** field.
5.  Enter a prompt in the **Write your prompt** field.
6.  Click **Run**.

Gemini returns a response after the response is generated. Depending on the complexity of the response, generation can take several seconds.

### Node.js

To use the Vertex AI SDK for Node.js:

1.  **Install the SDK:**
    ```bash
    npm install @google-cloud/vertexai
    ```

2.  **Run the code:**
    ```javascript
    const {VertexAI} = require('@google-cloud/vertexai');

    // Initialize Vertex with your Cloud project and location
    const vertex_ai = new VertexAI({
      project: 'your-project-id', 
      location: 'us-central1'
    });
    
    // Select a thinking model
    const model = 'gemini-2.5-pro';

    // Instantiate the model
    const generativeModel = vertex_ai.getGenerativeModel({
      model: model
    });

    async function generate() {
      const prompt = 'solve x^2 + 4x + 4 = 0';
      
      const resp = await generativeModel.generateContent(prompt);
      const content = resp.response.candidates[0].content.parts[0].text;
      
      console.log(content);
    }

    generate();
    ```

## View thought summaries

You can view thought summaries in Gemini 2.5 and newer models.

**Note:** Thought summarization is a best-effort feature. You aren't guaranteed to receive the thoughts section in the API response even if you set `includeThoughts: true`.

### Console
Thought summaries are enabled by default in Vertex AI Studio. You can see the model's summarized thought process by expanding the **Thoughts** panel.

### Node.js

To receive the thinking process in the API response, configure `thinkingConfig` within `generationConfig`:

```javascript
const {VertexAI} = require('@google-cloud/vertexai');

const vertex_ai = new VertexAI({
  project: 'your-project-id', 
  location: 'us-central1'
});

const generativeModel = vertex_ai.getGenerativeModel({
  model: 'gemini-2.5-pro',
  generationConfig: {
    thinkingConfig: {
      includeThoughts: true
    }
  }
});

async function generateWithThoughts() {
  const prompt = 'solve x^2 + 4x + 4 = 0';
  
  const result = await generativeModel.generateContent(prompt);
  const candidate = result.response.candidates[0];

  // Print the final response
  console.log("Response:\n", candidate.content.parts[0].text);

  // Iterate through parts to find and print thoughts (if available)
  // Note: The structure of the response may vary slightly depending on SDK version
  // but thoughts are typically returned as part of the candidate content or metadata.
  if (candidate.content.parts) {
      candidate.content.parts.forEach(part => {
          if (part.thought) { // Check if the part contains thoughts
              console.log("\nMy Thought Process:\n", part.text);
          }
      });
  }
}

generateWithThoughts();

```

## Prompting techniques

### Provide step-by-step instructions

If the initial attempt does not yield the expected result, refine your prompt by providing more explicit step-by-step instructions to guide Gemini through the problem-solving process.

**Example Prompt:**

> Step 1: Summarize the following article about quantum physics.
> Step 2: Translate the summary into Spanish.
> Step 3: Extract the key entities from the Spanish summary.
> Article: ... [Article Text] ...

### System instructions

When building an application where users will interact directly with the model, you may want to provide guidance for how Gemini's output and responses will sound and be formatted using System Instructions.

**Example:**

* **System Instruction:** You are a helpful and concise coding tutor. Always provide code examples and explain them briefly.
* **User Prompt:** Explain what is a closure in Javascript and give an example.

### Verification and reflection

Include specific verification steps in either the system instructions or your prompts directly. For example, ask Gemini to verify its sources, review its reasoning, identify potential errors, and check its final answer.

**Example Prompt:**

> Verify the following statement and provide your sources: The capital of Brazil is Rio de Janeiro.

### Making the best of long outputs

If you want your output to be particularly lengthy, you may want to provide more guidance in your prompt to constrain the amount of thinking needed to accomplish the task presented in the prompt. This lets you reserve more of the token output for your response.

**Example:** For a detailed report, you might specify sections and subsections in your prompt to guide Gemini's thinking and structure the output efficiently.

## Pricing

You are charged for the tokens that are generated during a model's thinking process. For some models, such as Gemini 3 Pro and Gemini 2.5 Pro, thinking is enabled by default and you are billed for these tokens.

For more information, see [Vertex AI pricing](https://cloud.google.com/vertex-ai/pricing). To learn how to manage costs, see Control the thinking budget.

## What's next?

* Try using a thinking model for yourself with the [Intro to Gemini 2.5 Flash notebook](https://www.google.com/search?q=https://github.com/GoogleCloudPlatform/generative-ai/blob/main/gemini/getting-started/intro_gemini_2_5_flash.ipynb).
* Open the [Vertex AI console](https://console.cloud.google.com/vertex-ai) and try prompting the model for yourself.

