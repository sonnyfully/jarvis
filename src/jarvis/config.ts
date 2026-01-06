export interface JarvisConfig {
    dataDir: string
    ollamaBaseUrl: string
    ollamaModel: string
}

export function loadConfig(): JarvisConfig {
    return {
        dataDir: "./data",
        ollamaBaseUrl: "http://localhost:11434",
        ollamaModel: "llama3.2:3b",
    }
}
