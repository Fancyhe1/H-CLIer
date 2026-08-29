import { useState, useEffect, useCallback, useRef } from 'react'
import { Modal, Tree, Dropdown, message } from 'antd'
import type { MenuProps } from 'antd'
import { invoke } from '@tauri-apps/api/core'
import {
  FolderOutlined,
  FileOutlined,
  FileTextOutlined,
  FilePdfOutlined,
  FileImageOutlined,
  FileZipOutlined,
  CopyOutlined,
  FolderOpenFilled,
} from '@ant-design/icons'

interface FileEntry {
  name: string
  path: string
  is_dir: boolean
  size: number
  modified: number | null
}

interface TreeNode {
  key: string
  title: React.ReactNode
  path: string
  is_dir: boolean
  children?: TreeNode[]
  isLeaf?: boolean
  loaded?: boolean
}

interface ContextMenuState {
  path: string
  is_dir: boolean
  name: string
  x: number
  y: number
}

interface FileBrowserModalProps {
  visible: boolean
  onClose: () => void
  projectPath: string
  theme?: 'light' | 'dark'
}

function FileBrowserModal({ visible, onClose, projectPath }: FileBrowserModalProps) {
  const [treeData, setTreeData] = useState<TreeNode[]>([])
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const loadedKeysRef = useRef<Set<string>>(new Set())

  // 加载目录内容
  const loadDirectory = useCallback(async (path: string): Promise<TreeNode[]> => {
    try {
      const entries: FileEntry[] = await invoke('read_directory', { path })
      return entries.map(entry => ({
        key: entry.path,
        title: entry.name,
        path: entry.path,
        is_dir: entry.is_dir,
        isLeaf: !entry.is_dir,
        // 文件夹不预设 children，只有展开时才加载
      }))
    } catch (err) {
      console.error('读取目录失败:', err)
      return []
    }
  }, [])

  // 初始化加载根目录
  useEffect(() => {
    if (visible && projectPath) {
      loadDirectory(projectPath).then(nodes => {
        setTreeData(nodes)
        setExpandedKeys([projectPath])
        loadedKeysRef.current.add(projectPath)
      })
    }
  }, [visible, projectPath, loadDirectory])

  // 懒加载子目录
  const onLoadData = useCallback(async ({ key }: { key: React.Key }) => {
    // 如果已经加载过，直接返回
    if (loadedKeysRef.current.has(key as string)) {
      return
    }

    const childNodes = await loadDirectory(key as string)

    setTreeData(origin => {
      const updateTree = (nodes: TreeNode[]): TreeNode[] => {
        return nodes.map(node => {
          if (node.key === key) {
            return { ...node, children: childNodes, loaded: true }
          }
          if (node.children) {
            return { ...node, children: updateTree(node.children) }
          }
          return node
        })
      }
      return updateTree(origin)
    })

    loadedKeysRef.current.add(key as string)
    setExpandedKeys(prev => {
      if (!prev.includes(key as string)) {
        return [...prev, key as string]
      }
      return prev
    })
  }, [loadDirectory])

  // 复制路径到剪贴板
  const copyPath = useCallback(async (path: string) => {
    try {
      await navigator.clipboard.writeText(path)
      message.success('路径已复制')
    } catch {
      message.error('复制失败')
    }
    setContextMenu(null)
  }, [])

  // 在资源管理器中打开
  const openInExplorer = useCallback(async (path: string) => {
    console.log('[FileBrowser] 在资源管理器打开:', path)
    try {
      await invoke('open_in_explorer', { projectPath: path })
    } catch (err) {
      message.error('打开失败: ' + String(err))
    }
    setContextMenu(null)
  }, [])

  // 在系统中打开文件
  const openInSystem = useCallback(async (path: string) => {
    try {
      await invoke('open_file_in_system', { path })
    } catch (err) {
      message.error('打开失败: ' + String(err))
    }
    setContextMenu(null)
  }, [])

  // 右键菜单项
  const contextMenuItems: MenuProps['items'] = contextMenu ? [
    {
      key: 'copy',
      label: '复制路径',
      icon: <CopyOutlined />,
      onClick: () => copyPath(contextMenu.path),
    },
    {
      key: 'explorer',
      label: '在资源管理器打开',
      onClick: () => openInExplorer(contextMenu.path),
    },
    ...(contextMenu.is_dir ? [] : [
      { type: 'divider' as const },
      {
        key: 'open',
        label: '在系统中打开',
        onClick: () => openInSystem(contextMenu.path),
      },
    ]),
  ] : []

  // 获取文件图标
  const getFileIcon = (node: TreeNode) => {
    if (node.is_dir) {
      return expandedKeys.includes(node.key) ? (
        <FolderOpenFilled style={{ color: '#1677ff' }} />
      ) : (
        <FolderOutlined style={{ color: '#1677ff' }} />
      )
    }

    const name = node.title?.toString().toLowerCase() || ''
    if (name.endsWith('.pdf')) {
      return <FilePdfOutlined style={{ color: '#ff4d4f' }} />
    }
    if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp'].some(ext => name.endsWith(ext))) {
      return <FileImageOutlined style={{ color: '#52c41a' }} />
    }
    if (['.zip', '.rar', '.7z', '.tar', '.gz'].some(ext => name.endsWith(ext))) {
      return <FileZipOutlined style={{ color: '#faad14' }} />
    }
    if (['.md', '.txt', '.doc', '.docx'].some(ext => name.endsWith(ext))) {
      return <FileTextOutlined style={{ color: '#8c8c8c' }} />
    }
    return <FileOutlined style={{ color: '#8c8c8c' }} />
  }

  // 自定义树节点渲染
  const titleRender = (node: TreeNode) => (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 4 }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setContextMenu({
          path: node.path,
          is_dir: node.is_dir,
          name: node.title as string,
          x: e.clientX,
          y: e.clientY,
        })
      }}
    >
      {getFileIcon(node)}
      <span style={{ marginLeft: 4 }}>{node.title}</span>
    </div>
  )

  // 点击其他地方关闭右键菜单
  const handleClick = useCallback(() => {
    if (contextMenu) {
      setContextMenu(null)
    }
  }, [contextMenu])

  return (
    <Modal
      title="文件浏览器"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={600}
      styles={{ body: { height: 400, overflow: 'auto', padding: '8px' } }}
      afterOpenChange={(open) => {
        if (!open) {
          setContextMenu(null)
          loadedKeysRef.current.clear()
        }
      }}
    >
      <div style={{ fontSize: 12, color: '#888', marginBottom: 8, wordBreak: 'break-all' }}>
        当前项目: {projectPath}
      </div>
      <div onClick={handleClick}>
        <Tree
          showIcon
          showLine={{ showLeafIcon: false }}
          loadData={onLoadData}
          treeData={treeData}
          expandedKeys={expandedKeys}
          onExpand={(keys) => setExpandedKeys(keys as string[])}
          titleRender={titleRender}
          blockNode
        />
      </div>

      {/* 右键菜单 - 使用 Dropdown 的 overlay 定位到鼠标位置 */}
      {contextMenu && (
        <Dropdown
          menu={{ items: contextMenuItems }}
          open
          trigger={['contextMenu']}
          overlayStyle={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y }}
          onOpenChange={(open) => {
            if (!open) setContextMenu(null)
          }}
        >
          <div
            style={{
              position: 'fixed',
              left: contextMenu.x,
              top: contextMenu.y,
              width: 1,
              height: 1,
            }}
          />
        </Dropdown>
      )}
    </Modal>
  )
}

export default FileBrowserModal
