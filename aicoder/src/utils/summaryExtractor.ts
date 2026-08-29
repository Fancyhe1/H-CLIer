import type { ChatMessage } from '../types/history'
import type { AIMemorySummary } from '../types/summary'

// 工具用途描述映射
const TOOL_DESCRIPTIONS: Record<string, string> = {
  Edit: '文件编辑',
  Write: '文件写入',
  Read: '文件读取',
  Bash: '命令执行',
  Grep: '内容搜索',
  Glob: '文件查找',
  Agent: '子任务代理',
  WebFetch: '网页获取',
  WebSearch: '网络搜索',
  NotebookEdit: 'Notebook编辑',
}

// 从toolInput中提取文件路径
function extractFilePath(input: Record<string, unknown> | undefined): string | null {
  if (!input) return null
  const path = input.file_path || input.path || input.pattern
  if (typeof path === 'string') return path
  return null
}

// 从toolInput中提取命令
function extractCommand(input: Record<string, unknown> | undefined): string | null {
  if (!input) return null
  const cmd = input.command
  if (typeof cmd === 'string') return cmd
  return null
}

// 截取文本前N个字符，保持完整性
function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + '...'
}

// 提取消息中的完整文本
function extractMessageText(msg: ChatMessage): string {
  return msg.content
    .filter(b => b.blockType === 'text' && b.text)
    .map(b => b.text!.trim())
    .join('\n')
    .trim()
}

// 从用户消息中提取讨论要点（完整内容）
function extractUserTopics(messages: ChatMessage[]): string[] {
  const topics: string[] = []
  for (const msg of messages) {
    if (msg.role !== 'user') continue
    const text = extractMessageText(msg)
    // 过滤掉太短的消息（如 "ok"、"yes"、"好" 等）
    if (text.length > 5) {
      topics.push(text)
    }
  }
  return topics
}

// 从tool_result中提取错误信息
function extractErrors(messages: ChatMessage[]): string[] {
  const errors: string[] = []
  for (const msg of messages) {
    for (const block of msg.content) {
      if (block.blockType === 'tool_result' && block.toolResult) {
        const result = block.toolResult
        // 检测错误关键词
        if (
          result.includes('Error') ||
          result.includes('error') ||
          result.includes('ERROR') ||
          result.includes('failed') ||
          result.includes('Failed') ||
          result.includes('FAILED') ||
          result.includes('Traceback') ||
          result.includes('panic') ||
          result.includes('exception')
        ) {
          // 提取错误行（去掉太长的堆栈）
          const lines = result.split('\n').filter(l => l.trim().length > 0)
          const errorLine = lines.find(l =>
            l.includes('Error') || l.includes('error') || l.includes('failed') ||
            l.includes('Traceback') || l.includes('panic')
          )
          if (errorLine) {
            errors.push(truncateText(errorLine.trim(), 120))
          }
        }
      }
    }
    if (errors.length >= 10) break
  }
  // 去重
  return [...new Set(errors)]
}

// 从文件路径中提取文件名
function getFileName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || path
}

// 按目录分组文件
function groupFiles(files: string[]): { dir: string; names: string[] }[] {
  const groups: Record<string, string[]> = {}
  for (const f of files) {
    const normalized = f.replace(/\\/g, '/')
    const lastSlash = normalized.lastIndexOf('/')
    const dir = lastSlash >= 0 ? normalized.slice(0, lastSlash) : '.'
    const name = getFileName(f)
    if (!groups[dir]) groups[dir] = []
    groups[dir].push(name)
  }
  return Object.entries(groups).map(([dir, names]) => ({ dir, names }))
}

// 生成详细概述
function generateOverview(messages: ChatMessage[], filesEdited: string[], commandsRun: string[]): string {
  const sentences: string[] = []

  // 1. 从所有用户消息中提取核心意图
  const userTexts = messages
    .filter(m => m.role === 'user')
    .map(m => extractMessageText(m))
    .filter(t => t.length > 5)

  if (userTexts.length > 0) {
    // 用第一条用户消息描述会话主题
    const firstTopic = userTexts[0].split('\n')[0]
    sentences.push(`本次会话围绕"${firstTopic}"展开`)

    // 如果有多轮对话，补充说明讨论了哪些问题
    if (userTexts.length > 1) {
      const topics = userTexts.slice(1, 4).map(t => t.split('\n')[0])
      if (topics.length > 0) {
        sentences.push(`后续讨论了${topics.map(t => `"${t}"`).join('、')}等内容`)
      }
    }
  }

  // 2. 描述文件修改情况
  if (filesEdited.length > 0) {
    const groups = groupFiles(filesEdited)
    if (groups.length === 1) {
      sentences.push(`修改了 ${groups[0].dir} 目录下的 ${groups[0].names.join('、')} 等 ${filesEdited.length} 个文件`)
    } else {
      const dirNames = groups.slice(0, 3).map(g => g.dir.split('/').pop() || g.dir)
      sentences.push(`修改了 ${filesEdited.length} 个文件，涉及 ${dirNames.join('、')} 等目录`)
    }
  }

  // 3. 描述命令执行情况
  if (commandsRun.length > 0) {
    // 识别关键命令类型
    const hasGit = commandsRun.some(c => c.startsWith('git '))
    const hasBuild = commandsRun.some(c => c.includes('build') || c.includes('cargo') || c.includes('npm'))
    const hasTest = commandsRun.some(c => c.includes('test'))
    const hasNpm = commandsRun.some(c => c.startsWith('npm '))

    const cmdParts: string[] = []
    if (hasGit) cmdParts.push('Git操作')
    if (hasBuild) cmdParts.push('构建编译')
    if (hasTest) cmdParts.push('测试')
    if (hasNpm && !hasBuild) cmdParts.push('npm操作')

    if (cmdParts.length > 0) {
      sentences.push(`执行了 ${commandsRun.length} 条命令，包括${cmdParts.join('、')}`)
    } else {
      sentences.push(`执行了 ${commandsRun.length} 条命令`)
    }
  }

  return sentences.length > 0 ? sentences.join('。') + '。' : '暂无会话内容'
}

/**
 * 从对话历史中提取AI记忆摘要
 */
export function extractAIMemorySummary(messages: ChatMessage[]): AIMemorySummary {
  const filesEditedSet = new Set<string>()
  const filesReadSet = new Set<string>()
  const commandsSet = new Set<string>()
  const toolCounts: Record<string, number> = {}

  for (const msg of messages) {
    for (const block of msg.content) {
      if (block.blockType !== 'tool_use') continue

      const toolName = block.toolName || 'unknown'
      toolCounts[toolName] = (toolCounts[toolName] || 0) + 1

      // 提取文件操作
      if (toolName === 'Edit' || toolName === 'Write' || toolName === 'NotebookEdit') {
        const filePath = extractFilePath(block.toolInput)
        if (filePath) filesEditedSet.add(filePath)
      } else if (toolName === 'Read') {
        const filePath = extractFilePath(block.toolInput)
        if (filePath) filesReadSet.add(filePath)
      } else if (toolName === 'Bash') {
        const cmd = extractCommand(block.toolInput)
        if (cmd) commandsSet.add(truncateText(cmd, 100))
      }
    }
  }

  // 构建工具统计
  const toolSummary = Object.entries(toolCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([tool, count]) => ({
      tool,
      count,
      description: TOOL_DESCRIPTIONS[tool] || tool,
    }))

  const filesEdited = [...filesEditedSet]
  const filesRead = [...filesReadSet]
  const commandsRun = [...commandsSet]

  return {
    overview: generateOverview(messages, filesEdited, commandsRun),
    filesEdited,
    filesRead,
    commandsRun,
    userTopics: extractUserTopics(messages),
    errorsEncountered: extractErrors(messages),
    toolSummary,
  }
}
