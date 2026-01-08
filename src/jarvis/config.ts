export interface JarvisConfig {
    dataDir: string
    ollamaBaseUrl: string
    ollamaModel: string
    writeConfirmationRequired?: boolean
    logDir?: string
}

export function loadConfig(): JarvisConfig {
    return {
        dataDir: "./data",
        ollamaBaseUrl: "http://localhost:11434",
        ollamaModel: "llama3.2:3b",
        writeConfirmationRequired: false,
        logDir: "./data/logs",
    }
}
