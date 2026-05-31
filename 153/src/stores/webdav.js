import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export const useWebDAVStore = defineStore('webdav', {
  state: () => ({
    servers: [],
    currentServer: null,
    currentPath: '/',
    files: [],
    loading: false,
    pathHistory: [],
    uploadQueue: [],
    downloadQueue: [],
    searchResults: [],
    contentSearchResults: [],
    localEdits: {},
    currentEdit: null,
  }),

  actions: {
    async loadServers() {
      try {
        this.servers = await invoke('list_servers')
        if (!this.currentServer && this.servers.length > 0) {
          this.currentServer = this.servers[0]
        }
      } catch (e) {
        console.error('加载服务器列表失败:', e)
      }
    },

    async addServer(serverInfo) {
      try {
        const id = await invoke('add_server', serverInfo)
        await this.loadServers()
        return id
      } catch (e) {
        console.error('添加服务器失败:', e)
        throw e
      }
    },

    async removeServer(id) {
      try {
        await invoke('remove_server', { id })
        if (this.currentServer?.id === id) {
          this.currentServer = null
          this.files = []
          this.currentPath = '/'
        }
        await this.loadServers()
      } catch (e) {
        console.error('删除服务器失败:', e)
        throw e
      }
    },

    async testConnection(serverInfo) {
      try {
        const result = await invoke('test_connection', serverInfo)
        return result
      } catch (e) {
        console.error('测试连接失败:', e)
        throw e
      }
    },

    async listFiles(path = '/') {
      if (!this.currentServer) return

      this.loading = true
      try {
        this.pathHistory.push(this.currentPath)
        this.currentPath = path
        this.files = await invoke('list_files', {
          serverId: this.currentServer.id,
          path
        })
      } catch (e) {
        console.error('获取文件列表失败:', e)
        this.files = []
      } finally {
        this.loading = false
      }
    },

    async refreshFiles() {
      if (!this.currentServer) return

      this.loading = true
      try {
        this.files = await invoke('list_files', {
          serverId: this.currentServer.id,
          path: this.currentPath
        })
      } catch (e) {
        console.error('刷新文件列表失败:', e)
      } finally {
        this.loading = false
      }
    },

    async goBack() {
      if (this.pathHistory.length > 0) {
        this.currentPath = this.pathHistory.pop()
        await this.listFiles(this.currentPath)
      }
    },

    async goToParent() {
      if (this.currentPath !== '/') {
        const parentPath = this.currentPath.substring(0, this.currentPath.lastIndexOf('/')) || '/'
        this.pathHistory.push(this.currentPath)
        this.currentPath = parentPath
        await this.listFiles(parentPath)
      }
    },

    async downloadFile(fileItem, localPath) {
      if (!this.currentServer) return

      try {
        const remotePath = fileItem.path
        await invoke('download_file', {
          serverId: this.currentServer.id,
          remotePath,
          localPath
        })
      } catch (e) {
        console.error('下载文件失败:', e)
        throw e
      }
    },

    async uploadFile(localPath, remotePath) {
      if (!this.currentServer) return

      try {
        await invoke('upload_file', {
          serverId: this.currentServer.id,
          localPath,
          remotePath
        })
        await this.refreshFiles()
      } catch (e) {
        console.error('上传文件失败:', e)
        throw e
      }
    },

    async uploadFileChunked(localPath, remotePath, chunkSize = 1024 * 1024) {
      if (!this.currentServer) return

      try {
        await invoke('upload_file_chunked', {
          serverId: this.currentServer.id,
          localPath,
          remotePath,
          chunkSize
        })
        await this.refreshFiles()
      } catch (e) {
        console.error('分片上传文件失败:', e)
        throw e
      }
    },

    async deleteFile(fileItem) {
      if (!this.currentServer) return

      try {
        await invoke('delete_file', {
          serverId: this.currentServer.id,
          path: fileItem.path
        })
        await this.refreshFiles()
      } catch (e) {
        console.error('删除文件失败:', e)
        throw e
      }
    },

    async createFolder(folderName) {
      if (!this.currentServer) return

      try {
        const folderPath = this.currentPath === '/'
          ? `/${folderName}`
          : `${this.currentPath}/${folderName}`

        await invoke('create_folder', {
          serverId: this.currentServer.id,
          path: folderPath
        })
        await this.refreshFiles()
      } catch (e) {
        console.error('创建文件夹失败:', e)
        throw e
      }
    },

    async renameFile(fileItem, newName) {
      if (!this.currentServer) return

      try {
        await invoke('rename_file', {
          serverId: this.currentServer.id,
          oldPath: fileItem.path,
          newName
        })
        await this.refreshFiles()
      } catch (e) {
        console.error('重命名失败:', e)
        throw e
      }
    },

    async searchFiles(query, serverId = null) {
      try {
        this.searchResults = await invoke('search_files', {
          serverId,
          query
        })
      } catch (e) {
        console.error('搜索文件失败:', e)
        this.searchResults = []
      }
    },

    async searchContent(query, serverId = null) {
      try {
        this.contentSearchResults = await invoke('search_content', {
          serverId,
          query
        })
      } catch (e) {
        console.error('内容搜索失败:', e)
        this.contentSearchResults = []
      }
    },

    async getFileContent(fileItem) {
      if (!this.currentServer) return null

      try {
        return await invoke('get_file_content', {
          serverId: this.currentServer.id,
          path: fileItem.path
        })
      } catch (e) {
        console.error('获取文件内容失败:', e)
        return null
      }
    },

    async startEdit(fileItem) {
      if (!this.currentServer) return null

      try {
        const edit = await invoke('start_edit', {
          serverId: this.currentServer.id,
          path: fileItem.path
        })
        this.currentEdit = edit
        this.localEdits[fileItem.path] = edit
        return edit
      } catch (e) {
        console.error('开始编辑失败:', e)
        throw e
      }
    },

    async saveEdit(content, originalEtag = null) {
      if (!this.currentServer || !this.currentEdit) return null

      try {
        const result = await invoke('save_edit', {
          serverId: this.currentServer.id,
          path: this.currentEdit.path,
          content,
          originalEtag
        })

        if (result.success) {
          this.currentEdit.isSynced = true
          this.currentEdit.originalEtag = result.localEtag
          this.localEdits[this.currentEdit.path] = { ...this.currentEdit }
        }

        return result
      } catch (e) {
        console.error('保存编辑失败:', e)
        throw e
      }
    },

    async forceSave(content) {
      if (!this.currentServer || !this.currentEdit) return null

      try {
        const result = await invoke('force_save', {
          serverId: this.currentServer.id,
          path: this.currentEdit.path,
          content
        })

        if (result.success) {
          this.currentEdit.isSynced = true
          this.currentEdit.originalEtag = result.localEtag
          this.localEdits[this.currentEdit.path] = { ...this.currentEdit }
        }

        return result
      } catch (e) {
        console.error('强制保存失败:', e)
        throw e
      }
    },

    async getRemoteContent(path) {
      if (!this.currentServer) return null

      try {
        return await invoke('get_remote_content', {
          serverId: this.currentServer.id,
          path
        })
      } catch (e) {
        console.error('获取远程内容失败:', e)
        return null
      }
    },

    async isEditable(filename) {
      try {
        return await invoke('is_editable', { name: filename })
      } catch (e) {
        console.error('检查文件是否可编辑失败:', e)
        return false
      }
    },

    setCurrentEdit(edit) {
      this.currentEdit = edit
    },

    clearCurrentEdit() {
      this.currentEdit = null
    },

    setCurrentServer(server) {
      this.currentServer = server
      this.currentPath = '/'
      this.pathHistory = []
      this.files = []
    },

    formatFileSize(bytes) {
      if (bytes === null || bytes === undefined) return '-'
      if (bytes === 0) return '0 B'

      const units = ['B', 'KB', 'MB', 'GB', 'TB']
      const k = 1024
      const i = Math.floor(Math.log(bytes) / Math.log(k))

      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + units[i]
    }
  }
})
