import type { Session } from '../types/session'
import { message } from 'antd'

export function exportToMarkdown(session: Session, messages: string[]): string {
  const timestamp = new Date().toLocaleString()

  let content = `# ${session.title}\n\n`
  content += `**项目路径**: ${session.projectPath}\n\n`
  content += `**创建时间**: ${new Date(session.createdAt).toLocaleString()}\n\n`
  content += `**最后活动**: ${new Date(session.lastActivityAt).toLocaleString()}\n\n`
  content += `**消息数量**: ${session.messageCount}\n\n`
  content += `---\n\n`

  if (messages.length === 0) {
    content += `*暂无消息记录*\n`
  } else {
    messages.forEach((msg, index) => {
      content += `## 消息 ${index + 1}\n\n${msg}\n\n`
    })
  }

  content += `\n---\n\n`
  content += `*导出时间: ${timestamp}*\n`
  content += `*由 智码 AICoder 导出*\n`

  return content
}

export function exportToHTML(session: Session, messages: string[]): string {
  const timestamp = new Date().toLocaleString()

  const messagesHTML = messages.length === 0
    ? '<p><em>暂无消息记录</em></p>'
    : messages.map((msg, index) => `
        <div class="message">
          <h3>消息 ${index + 1}</h3>
          <pre>${escapeHtml(msg)}</pre>
        </div>
      `).join('')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(session.title)} - 会话记录</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      line-height: 1.6;
      color: #333;
    }
    h1 { color: #1677ff; border-bottom: 2px solid #1677ff; padding-bottom: 10px; }
    h3 { color: #666; margin-top: 30px; }
    .meta { background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0; }
    .meta p { margin: 5px 0; }
    .message { margin: 20px 0; padding: 15px; background: #fafafa; border-radius: 8px; }
    .message pre {
      white-space: pre-wrap;
      word-wrap: break-word;
      background: #fff;
      padding: 15px;
      border-radius: 4px;
      border: 1px solid #e8e8e8;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e8e8e8;
      color: #999;
      font-size: 12px;
      text-align: center;
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(session.title)}</h1>

  <div class="meta">
    <p><strong>项目路径:</strong> ${escapeHtml(session.projectPath)}</p>
    <p><strong>创建时间:</strong> ${new Date(session.createdAt).toLocaleString()}</p>
    <p><strong>最后活动:</strong> ${new Date(session.lastActivityAt).toLocaleString()}</p>
    <p><strong>消息数量:</strong> ${session.messageCount}</p>
  </div>

  <hr>

  ${messagesHTML}

  <div class="footer">
    <p>导出时间: ${timestamp}</p>
    <p>由 智码 AICoder 导出</p>
  </div>
</body>
</html>`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// 使用 File System Access API 保存文件
async function saveFileWithPicker(
  content: string,
  suggestedName: string,
  mimeType: string
): Promise<string | null> {
  try {
    // @ts-ignore - File System Access API
    if (!window.showSaveFilePicker) {
      return null
    }

    const opts = {
      suggestedName,
      types: [
        {
          description: mimeType.includes('markdown') ? 'Markdown 文件' : 'HTML 文件',
          accept: {
            [mimeType]: mimeType.includes('markdown') ? ['.md'] : ['.html'],
          },
        },
      ],
    }

    // @ts-ignore
    const handle = await window.showSaveFilePicker(opts)
    const writable = await handle.createWritable()
    await writable.write(content)
    await writable.close()

    return handle.name
  } catch (err) {
    // 用户取消或API不支持
    console.log('Save picker error or cancelled:', err)
    return null
  }
}

// 备用：传统下载方式
function downloadFileFallback(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export async function saveExportFile(
  content: string,
  filename: string,
  mimeType: string
): Promise<{ success: boolean; method: 'picker' | 'download'; filename: string }> {
  // 首先尝试使用系统保存对话框
  const savedName = await saveFileWithPicker(content, filename, mimeType)

  if (savedName) {
    return { success: true, method: 'picker', filename: savedName }
  }

  // 回退到下载方式
  downloadFileFallback(content, filename, mimeType)
  return { success: true, method: 'download', filename }
}

// 统一的导出处理函数
export async function handleExportSession(
  session: Session,
  format: 'md' | 'html'
): Promise<void> {
  // 模拟消息数据（实际应从终端获取历史记录）
  const messages = [
    '用户: 你好，请帮我分析这个代码',
    'AI: 好的，让我分析一下...',
    'AI: 这段代码的主要问题是...',
  ]

  const safeTitle = session.title.replace(/[\\/:*?"<>|]/g, '_')
  const filename = format === 'md' ? `${safeTitle}.md` : `${safeTitle}.html`
  const mimeType = format === 'md' ? 'text/markdown' : 'text/html'

  try {
    const content = format === 'md'
      ? exportToMarkdown(session, messages)
      : exportToHTML(session, messages)

    const result = await saveExportFile(content, filename, mimeType)

    if (result.method === 'picker') {
      message.success(`已保存到: ${result.filename}`, 3)
    } else {
      message.success(`已导出: ${result.filename} (文件已保存到下载文件夹)`, 4)
    }
  } catch (err) {
    message.error('导出失败: ' + String(err))
  }
}
