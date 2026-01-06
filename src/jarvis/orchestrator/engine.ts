import { JarvisConfig } from "../config"
import { Ollamaclient } from "../llm/ollamaClient"
import { buildSystemPrompt } from "./prompts"
import { Session } from "./session"
import { tools } from "../tools/registry"

export class Orchestrator {
    
    private session: Session
    private llm: Ollamaclient
    
    constructor(private config: JarvisConfig) {
        this.session = new Session(config)
        this.llm = new Ollamaclient(config.ollamaBaseUrl, config.ollamaModel)
    }
    async initialize() {
        this.session.addSystemMessage(await buildSystemPrompt(tools))
    }


    async handleInput(input: string): Promise<string> {
        this.session.addUserMessage(input)
        const response = await this.llm.chat(this.session.getMessages())
        this.session.addJarvisMessage(response)
        return response
    }
}