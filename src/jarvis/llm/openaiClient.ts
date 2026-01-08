import type { LLMMessage, LLMClient } from "./base"

export class OpenAIClient implements LLMClient {
  private apiKey: string
  private baseUrl: string

  constructor(apiKey: string, baseUrl: string = "https://api.openai.com/v1") {
    this.apiKey = apiKey
    this.baseUrl = baseUrl
  }

  async chat(args: {
    model: string
    messages: LLMMessage[]
    temperature: number
    maxTokens: number
    stop?: string[]
    topP?: number
  }): Promise<string> {
    // Determine which parameter name to use based on model
    // Newer models (o1, o3, o1-preview, etc.) use max_completion_tokens
    // Older models (gpt-3.5, gpt-4, gpt-4o, etc.) use max_tokens
    // Some newer gpt-4o variants may also require max_completion_tokens
    const useMaxCompletionTokens = 
      args.model.startsWith("o1") || 
      args.model.startsWith("o3") ||
      args.model.includes("o1-") ||
      args.model.includes("o3-")
    
    const requestBody: Record<string, unknown> = {
      model: args.model,
      messages: args.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      }),
      temperature: args.temperature,
    }

    // Use the correct parameter name based on model
    if (useMaxCompletionTokens) {
      requestBody.max_completion_tokens = args.maxTokens
    } else {
      requestBody.max_tokens = args.maxTokens
    }

    if (args.stop !== undefined && args.stop.length > 0) {
      requestBody.stop = args.stop
    }

    if (args.topP !== undefined) {
      requestBody.top_p = args.topP
    }

    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      })
    } catch (error) {
      const err = error as Error & { code?: string }
      if (err.code === "ECONNREFUSED" || err.message.includes("fetch failed")) {
        throw new Error(
          `Cannot connect to OpenAI API at ${this.baseUrl}. ` +
          `Check your internet connection and API key.`
        )
      }
      throw error
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error")
      let errorMessage = `OpenAI API error (${response.status}): ${errorText}`
      
      if (response.status === 401) {
        errorMessage += "\nInvalid API key. Check your OPENAI_API_KEY environment variable."
      } else if (response.status === 429) {
        errorMessage += "\nRate limit exceeded. Please try again later."
      } else if (response.status === 404) {
        errorMessage += `\nModel "${args.model}" not found. Check that the model name is correct.`
      }
      
      throw new Error(errorMessage)
    }

    const data = await response.json()
    
    // OpenAI response structure: { choices: [{ message: { content: "..." } }] }
    if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
      throw new Error(
        `Invalid response from OpenAI: no choices in response. ` +
        `Response: ${JSON.stringify(data).substring(0, 200)}`
      )
    }

    const content = data.choices[0]?.message?.content
    
    if (!content || typeof content !== "string" || content.trim().length === 0) {
      throw new Error(
        `Invalid response from OpenAI: empty or missing message content. ` +
        `Response: ${JSON.stringify(data).substring(0, 200)}`
      )
    }
    
    return content
  }
}
