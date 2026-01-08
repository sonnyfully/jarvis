import { config } from "dotenv"

// Load environment variables from .env file
config()

export type LLMProvider = "ollama" | "openai"

export interface JarvisConfig {
    dataDir: string
    llmProvider: LLMProvider
    // Ollama settings
    ollamaBaseUrl: string
    ollamaModel: string
    // OpenAI settings
    openaiApiKey?: string
    openaiModel?: string
    openaiBaseUrl?: string
    // General settings
    writeConfirmationRequired?: boolean
    logDir?: string
}

export function loadConfig(): JarvisConfig {
    // Determine provider from environment variable or default to ollama
    const provider = (process.env.LLM_PROVIDER || "ollama") as LLMProvider
    
    const config: JarvisConfig = {
        dataDir: process.env.DATA_DIR || "./data",
        llmProvider: provider,
        ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
        ollamaModel: process.env.OLLAMA_MODEL || "llama3.2:3b",
        writeConfirmationRequired: process.env.WRITE_CONFIRMATION_REQUIRED === "true",
        logDir: process.env.LOG_DIR || "./data/logs",
    }
    
    // Add OpenAI settings if provider is OpenAI
    if (provider === "openai") {
        if (process.env.OPENAI_API_KEY) {
            config.openaiApiKey = process.env.OPENAI_API_KEY
        }
        config.openaiModel = process.env.OPENAI_MODEL || "gpt-4o-mini"
        if (process.env.OPENAI_BASE_URL) {
            config.openaiBaseUrl = process.env.OPENAI_BASE_URL
        }
    }
    
    return config
}
