export interface ContentBlock {
  blockType: 'text' | 'thinking' | 'tool_use' | 'tool_result'
  text?: string
  thinking?: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolUseId?: string
  toolResult?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  timestamp: string
  content: ContentBlock[]
}
