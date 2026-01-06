export interface Tool {
    name: string
    description: string
}

export const tools: Tool[] = [
    {
        name: "notes,create",
        description: "Create a note",
    },
    {   name: "filesystem.read",
        description: "Read a file from the filesystem",
    }
]