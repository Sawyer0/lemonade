# Pricing

<Note>
  This page shows **pricing information** to help you understand API costs. For **billing setup**, payment methods, and usage monitoring, visit the [Admin section](/getting-started/api-groups).
</Note>

## Search API Pricing

| API            | Price per 1K requests | Description                                    |
| -------------- | :-------------------: | ---------------------------------------------- |
| **Search API** |         \$5.00        | Raw web search results with advanced filtering |

<Note>
  **No token costs:** Search API charges per request only, with no additional token-based pricing.
</Note>

## Grounded LLM Pricing

<Info>
  **Total cost per query** = Token costs + Request fee (varies by search context size, applies to Sonar, Sonar Pro, Sonar Reasoning, and Sonar Reasoning Pro models only)
</Info>

<Tabs>
  <Tab title="Token Pricing">
    ## Token Pricing

    **Token pricing** is based on the number of tokens in your request and response.

    | Model                   | Input Tokens (\$/1M) | Output Tokens (\$/1M) | Citation Tokens (\$/1M) | Search Queries (\$/1K) | Reasoning Tokens (\$/1M) |
    | ----------------------- | :------------------: | :-------------------: | :---------------------: | :--------------------: | :----------------------: |
    | **Sonar**               |          \$1         |          \$1          |            -            |            -           |             -            |
    | **Sonar Pro**           |          \$3         |          \$15         |            -            |            -           |             -            |
    | **Sonar Reasoning**     |          \$1         |          \$5          |            -            |            -           |             -            |
    | **Sonar Reasoning Pro** |          \$2         |          \$8          |            -            |            -           |             -            |
    | **Sonar Deep Research** |          \$2         |          \$8          |           \$2           |           \$5          |            \$3           |
  </Tab>

  <Tab title="Request Pricing">
    ## Request Pricing by Search Context Size

    **Search context** determines how much web information is retrieved. Higher context = more comprehensive results. The following table shows the request fee for each model for every **1000 requests**.

    | Model                   | Low Context Size | Medium Context Size | High Context Size |
    | ----------------------- | :--------------: | :-----------------: | :---------------: |
    | **Sonar**               |        \$5       |         \$8         |        \$12       |
    | **Sonar Pro**           |        \$6       |         \$10        |        \$14       |
    | **Sonar Reasoning**     |        \$5       |         \$8         |        \$12       |
    | **Sonar Reasoning Pro** |        \$6       |         \$10        |        \$14       |

    <Note>
      * **Low**: (default) fastest, cheapest
      * **Medium**: Balanced cost/quality
      * **High**: Maximum search depth, best for research

      [Learn more about search context →](../guides/search-context-size-guide)
    </Note>
  </Tab>
</Tabs>

<AccordionGroup>
  <Accordion title="Token and Cost Glossary">
    ### Input Tokens

    The number of tokens in your prompt or message to the API. This includes:

    * Your question or instruction
    * Any context or examples you provide
    * System messages and formatting

    **Example:** "What is the weather in New York?" = \~8 input tokens

    ### Output Tokens

    The number of tokens in the API's response. This includes:

    * The generated answer or content
    * Any explanations or additional context
    * Search results and references

    **Example:** "The weather in New York is currently sunny with a temperature of 72°F." = \~15 output tokens

    ### Citation Tokens

    Tokens used specifically for generating search results and references in responses. Only applies to **Sonar Deep Research** model.

    **Example:** Including source links, reference numbers, and bibliographic information

    ### Search Context Size vs Context Window

    **Search context size** is *not* the same as the **context window**.

    * **Search context size**: How much web information is retrieved during search (affects request pricing)
    * **Context window**: Maximum tokens the model can process in one request (affects token limits)

    ### Search Queries

    The number of individual searches conducted by **Sonar Deep Research** during query processing. This is separate from your initial user query.

    * The model automatically determines how many searches are needed
    * You cannot control the exact number of search queries
    * The `reasoning_effort` parameter influences the number of searches performed
    * Only applies to **Sonar Deep Research** model

    ### Reasoning Tokens

    Tokens used for step-by-step logical reasoning and problem-solving. Only applies to **Sonar Deep Research** model.

    **Example:** Breaking down a complex math problem into sequential steps with explanations

    <Info>
      **Token Calculation:** 1 token ≈ 4 characters in English text. The exact count may vary based on language and content complexity.
    </Info>
  </Accordion>
</AccordionGroup>

## Cost Examples

<CardGroup cols={2}>
  <Card title="Sonar Web Search Example" icon="calculator">
    **Sonar** • 500 input + 200 output tokens

    <Tabs>
      <Tab title="Low">
        | Component     | Cost         |
        | ------------- | ------------ |
        | Input tokens  | \$0.0005     |
        | Output tokens | \$0.0002     |
        | Request fee   | \$0.005      |
        | **Total**     | **\$0.0057** |
      </Tab>

      <Tab title="Medium">
        | Component     | Cost         |
        | ------------- | ------------ |
        | Input tokens  | \$0.0005     |
        | Output tokens | \$0.0002     |
        | Request fee   | \$0.008      |
        | **Total**     | **\$0.0087** |
      </Tab>

      <Tab title="High">
        | Component     | Cost         |
        | ------------- | ------------ |
        | Input tokens  | \$0.0005     |
        | Output tokens | \$0.0002     |
        | Request fee   | \$0.012      |
        | **Total**     | **\$0.0127** |
      </Tab>
    </Tabs>
  </Card>

  <Card title="Deep Research Example" icon="chart-line">
    **Sonar Deep Research**

    <Tabs>
      <Tab title="Low">
        | Component                | Cost           |
        | ------------------------ | -------------- |
        | Input tokens (33)        | \$0.000066     |
        | Output tokens (7163)     | \$0.057304     |
        | Citation tokens (20016)  | \$0.040032     |
        | Reasoning tokens (73997) | \$0.221991     |
        | Search queries (18)      | \$0.09         |
        | **Total**                | **\$0.409393** |
      </Tab>

      <Tab title="Medium">
        | Component                 | Cost        |
        | ------------------------- | ----------- |
        | Input tokens (7)          | \$0.00      |
        | Output tokens (3847)      | \$0.031     |
        | Citation tokens (47293)   | \$0.095     |
        | Reasoning tokens (308156) | \$0.924     |
        | Search queries (28)       | \$0.14      |
        | **Total**                 | **\$1.190** |
      </Tab>

      <Tab title="High">
        | Component                 | Cost        |
        | ------------------------- | ----------- |
        | Input tokens (8)          | \$0.00      |
        | Output tokens (4435)      | \$0.035     |
        | Citation tokens (58196)   | \$0.116     |
        | Reasoning tokens (339594) | \$1.019     |
        | Search queries (30)       | \$0.15      |
        | **Total**                 | **\$1.320** |
      </Tab>
    </Tabs>
  </Card>
</CardGroup>

## Choosing the Right API

### Search API

| API            | Description                                    | Best For                                                                          |
| -------------- | ---------------------------------------------- | --------------------------------------------------------------------------------- |
| **Search API** | Raw web search results with advanced filtering | Custom search engines, research tools, competitive intelligence, news aggregation |

### Sonar Models (Chat Completions)

| Model                   | Description                                                    | Best For                                                         |
| ----------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Sonar**               | Lightweight, cost-effective search model                       | Quick facts, news updates, simple Q\&A, high-volume applications |
| **Sonar Pro**           | Advanced search with deeper content understanding              | Complex queries, competitive analysis, detailed research         |
| **Sonar Reasoning**     | Quick problem-solving with step-by-step logic and search       | Logic puzzles, math problems, transparent reasoning              |
| **Sonar Reasoning Pro** | Enhanced multi-step reasoning with web search                  | Complex problem-solving, research analysis, strategic planning   |
| **Sonar Deep Research** | Exhaustive research and detailed report generation with search | Academic research, market analysis, comprehensive reports        |

<Info>
  **Need help choosing?** Use Search API when you want raw data to process yourself. Use Sonar models when you want AI-generated answers with search grounding.
</Info>


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.perplexity.ai/llms.txt