import { Ollamaclient } from "./ollamaClient"
import { JarvisConfig } from "../config"

export type LLMMode = "router" | "thinker"

export type GenerationParams = {
    temperature: number
    maxTokens: number
    topP?: number
    stop?: string[]
}

export function getModelForMode(config: JarvisConfig, mode: LLMMode): string {
    return mode === "router" ? config.ollamaModel : config.ollamaModel
}

export function getParamsForMode(mode: LLMMode): GenerationParams {
    if (mode === "router") {
        return {
            temperature: 0.1,
            maxTokens: 400,
            stop: ["\n\n"],
        }
    }
    return {
        temperature: 0.4,
        maxTokens: 1200,
    }
}

export async function runLLM(args: {
    config: JarvisConfig
    client: Ollamaclient
    mode: LLMMode
    messages: { role: "user" | "assistant" | "system", content: string }[]
}): Promise<{text: string; model: string}> {
    const model = getModelForMode(args.config, args.mode)
    const params = getParamsForMode(args.mode)

    const chatArgs: {
        model: string
        messages: { role: "user" | "assistant" | "system"; content: string }[]
        temperature: number
        maxTokens: number
        stop?: string[]
        topP?: number
    } = {
        model,
        messages: args.messages,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
    }
    
    if (params.stop !== undefined) {
        chatArgs.stop = params.stop
    }
    
    if (params.topP !== undefined) {
        chatArgs.topP = params.topP
    }

    const response = await args.client.chat(chatArgs)

    return {text: response, model}
}
