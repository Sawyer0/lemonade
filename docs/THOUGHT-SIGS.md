### Thought signatures

Thought signatures are encrypted tokens that preserve the model's reasoning state during multi-turn conversations, specifically when using function calling.
When a thinking model decides to call an external tool, it pauses its internal reasoning process. The thought signature acts as a "save state," allowing the model to resume its chain of thought seamlessly once you provide the function's result.
For more information, see [Thought signatures](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/thought-signatures).

#### Why are thought signatures important?
Without thought signatures, the model "forgets" its specific reasoning steps during the tool execution phase. Passing the signature back ensures:
- Context continuity: The model preserves the reason for why the tool was called.
- Complex reasoning: Enables multi-step tasks where the output of one
tool informs the reasoning for the next.

#### Where are thought signatures returned?
Gemini 3 Pro enforces stricter validation and updated handling on thought signatures which were originally introduced in Gemini 2.5. To ensure the model maintains context across multiple turns of a conversation, you must return the thought signatures in your subsequent requests.
- Model responses with a function call will always return a thought
signature.
- When there are parallel function calls, the first function call part
returned by the model response will have a thought signature.
- When there are sequential function calls (multi-step), each function call
will have a signature and clients are expected to pass signature back
- Model responses without a function call will return a thought signature
inside the last part returned by the model.

#### How to handle thought signatures?
There are two primary ways to handle thought signatures: automatically using the Gen AI SDKs or OpenAI API, or manually if you are interacting with the API directly.

##### Automated handling (recommended)
If you are using the Google Gen AI SDKs (Python, Node.js, Go, Java) or OpenAI Chat Completions API, and utilizing the standard chat history features or appending the full model response, thought_signatures are handled automatically. You don't need to make any changes to your code.

```
thought_signatures
```


###### Manual function calling example
When using the Gen AI SDK, thought signatures are handled automatically by appending the full model response in sequential model requests:

```
from google import genai from google.genai import types client = genai.Client() # 1. Define your tool get_weather_declaration = types.FunctionDeclaration( name="get_weather", description="Gets the current weather temperature for a given location.", parameters={ "type": "object", "properties": {"location": {"type": "string"}}, "required": ["location"], }, ) get_weather_tool = types.Tool(function_declarations=[get_weather_declaration]) # 2. Send a message that triggers the tool prompt = "What's the weather like in London?" response = client.models.generate_content( model="gemini-3-pro-preview", contents=prompt, config=types.GenerateContentConfig( tools=[get_weather_tool], thinking_config=types.ThinkingConfig(include_thoughts=True) ), ) # 4. Handle the function call function_call = response.function_calls[0] location = function_call.args["location"] print(f"Model wants to call: {function_call.name}") # Execute your tool (e.g., call an API) # (This is a mock response for the example) print(f"Calling external tool for: {location}") function_response_data = { "location": location, "temperature": "30C", } # 5. Send the tool's result back # Append this turn's messages to history for a final response. # The `content` object automatically attaches the required thought_signature behind the scenes. history = [ types.Content(role="user", parts=[types.Part(text=prompt)]), response.candidates[0].content, # Signature preserved here types.Content( role="tool", parts=[ types.Part.from_function_response( name=function_call.name, response=function_response_data, ) ], ) ] response_2 = client.models.generate_content( model="gemini-3-pro-preview", contents=history, config=types.GenerateContentConfig( tools=[get_weather_tool], thinking_config=types.ThinkingConfig(include_thoughts=True) ), ) # 6. Get the final, natural-language answer print(f"\nFinal model response: {response_2.text}")
```