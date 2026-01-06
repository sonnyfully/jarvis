import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import { Orchestrator} from "./orchestrator/engine"
import { loadConfig } from "./config"

async function main() {
    const config = loadConfig()
    const orchestrator = new Orchestrator(config)
    await orchestrator.initialize()
    const readline = createInterface({ input, output })

    console.log("Jarvis (local) running... - type 'exit' to quit\n")

    while (true) {
        const userInput = await readline.question("> ")

        if (userInput.toLowerCase().trim() === "exit") {
            break
        }

        const response = await orchestrator.handleInput(userInput)
        console.log(response)
    }

    readline.close()
}

main().catch(err => {
    console.error("Fatal error:", err)
    process.exit(1)
})