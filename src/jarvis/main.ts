import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import { Orchestrator} from "./orchestrator/engine"
import { loadConfig } from "./config"
import { Ollamaclient } from "./llm/ollamaClient"
import { OpenAIClient } from "./llm/openaiClient"
import type { LLMClient } from "./llm/base"

function createLLMClient(config: ReturnType<typeof loadConfig>): LLMClient {
    if (config.llmProvider === "openai") {
        if (!config.openaiApiKey) {
            throw new Error(
                "OpenAI API key is required when using OpenAI provider. " +
                "Set OPENAI_API_KEY environment variable."
            )
        }
        return new OpenAIClient(
            config.openaiApiKey,
            config.openaiBaseUrl
        )
    } else {
        return new Ollamaclient(config.ollamaBaseUrl)
    }
}

async function main() {
    const config = loadConfig()
    const llmClient = createLLMClient(config)
    const orchestrator = new Orchestrator(config, llmClient)
    await orchestrator.initialize()
    const readline = createInterface({ input, output })

    const providerName = config.llmProvider === "openai" ? "OpenAI" : "Ollama"
    console.log(`Jarvis (${providerName}) running... - type 'exit' to quit\n`)

    try {
        while (true) {
            const userInput = await readline.question("> ")

            if (userInput.toLowerCase().trim() === "exit") {
                break
            }

            const response = await orchestrator.handleInput(userInput)
            console.log(response)
        }
    } finally {
        readline.close()
        await orchestrator.close()
    }
}

main().catch(err => {
    console.error("Fatal error:", err)
    process.exit(1)
})