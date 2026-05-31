<template>
  <div class="qa-view">
    <div class="qa-sidebar">
      <div class="sidebar-header">
        <h3>选择文档</h3>
      </div>
      <div class="document-list">
        <div
          v-for="doc in documents"
          :key="doc.document_id"
          class="document-item"
          :class="{ active: selectedDocId === doc.document_id }"
          @click="selectDocument(doc)"
        >
          <div class="doc-icon">
            <FileText :size="18" />
          </div>
          <div class="doc-info">
            <div class="doc-name" :title="doc.original_filename">
              {{ doc.original_filename }}
            </div>
            <div class="doc-meta">
              <span>{{ doc.file_type.toUpperCase() }}</span>
              <span>·</span>
              <span>{{ formatDate(doc.created_at) }}</span>
            </div>
          </div>
        </div>
        <div v-if="documents.length === 0 && !loading" class="empty-state">
          <p>暂无文档，请先上传文档</p>
        </div>
        <div v-if="loading" class="loading-state">
          <Loader2 :size="20" class="animate-spin" />
          <span>加载中...</span>
        </div>
      </div>
    </div>

    <div class="qa-main">
      <div class="qa-header">
        <div v-if="selectedDoc" class="selected-doc-info">
          <FileText :size="20" />
          <span class="doc-title">{{ selectedDoc.original_filename }}</span>
          <span class="doc-badge">{{ selectedDoc.file_type.toUpperCase() }}</span>
        </div>
        <div v-else class="no-doc-selected">
          <span>请从左侧选择一个文档开始问答</span>
        </div>
      </div>

      <div class="qa-content" ref="chatContainer">
        <div v-if="!selectedDoc" class="welcome-screen">
          <div class="welcome-icon">
            <MessageCircleQuestion :size="64" />
          </div>
          <h2>文档智能问答</h2>
          <p>选择左侧文档后，即可基于文档内容进行智能问答</p>
          <div class="example-questions">
            <h4>示例问题：</h4>
            <ul>
              <li>这篇文档主要讲了什么内容？</li>
              <li>文档中提到了哪些关键数据？</li>
              <li>请总结文档的核心要点</li>
            </ul>
          </div>
        </div>

        <div v-else class="messages-container">
          <div v-for="(msg, index) in messages" :key="index" class="message-wrapper">
            <div class="message user">
              <div class="message-avatar user-avatar">
                <User :size="18" />
              </div>
              <div class="message-content">
                <p>{{ msg.question }}</p>
              </div>
            </div>

            <div v-if="msg.answer" class="message assistant">
              <div class="message-avatar assistant-avatar">
                <Bot :size="18" />
              </div>
              <div class="message-content">
                <div v-if="msg.loading" class="loading-answer">
                  <Loader2 :size="16" class="animate-spin" />
                  <span>正在思考...</span>
                </div>
                <div v-else>
                  <p class="answer-text">{{ msg.answer.answer }}</p>
                  <div class="answer-meta">
                    <span class="confidence" :class="getConfidenceClass(msg.answer.confidence)">
                      可信度: {{ (msg.answer.confidence * 100).toFixed(0) }}%
                    </span>
                    <span v-if="msg.answer.response_time" class="response-time">
                      耗时: {{ msg.answer.response_time.toFixed(2) }}s
                    </span>
                  </div>

                  <div v-if="msg.answer.sources && msg.answer.sources.length > 0" class="sources-section">
                    <div class="sources-header" @click="toggleSources(index)">
                      <ChevronDown :size="16" :class="{ rotated: expandedSources.includes(index) }" />
                      <span>引用原文 ({{ msg.answer.sources.length }})</span>
                    </div>
                    <div v-show="expandedSources.includes(index)" class="sources-list">
                      <div
                        v-for="(source, sIdx) in msg.answer.sources"
                        :key="sIdx"
                        class="source-item"
                      >
                        <div class="source-header">
                          <BookOpen :size="14" />
                          <span v-if="source.page_number">第 {{ source.page_number }} 页</span>
                          <span v-else>文档内容</span>
                        </div>
                        <p class="source-text">{{ source.text }}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="selectedDoc" class="qa-input-area">
        <div class="input-wrapper">
          <textarea
            v-model="question"
            placeholder="输入您的问题，按 Enter 发送，Shift+Enter 换行..."
            @keydown="handleKeyDown"
            :disabled="isAsking"
            rows="1"
            ref="textareaRef"
          ></textarea>
          <button
            class="send-btn"
            @click="askQuestion"
            :disabled="!question.trim() || isAsking"
          >
            <Send :size="18" />
          </button>
        </div>
        <div class="input-tips">
          <span v-if="!llmEnabled" class="warning-tip">
            <AlertCircle :size="14" />
            未配置 LLM，使用关键词匹配模式
          </span>
          <span>支持基于文档内容的智能问答</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import {
  FileText,
  MessageCircleQuestion,
  User,
  Bot,
  Loader2,
  Send,
  ChevronDown,
  BookOpen,
  AlertCircle
} from 'lucide-vue-next'
import { api } from '../api'
import type { DocumentInfo } from '../types'

interface QAResponse {
  answer: string
  confidence: number
  sources: Array<{
    text: string
    page_number?: number
    start_index: number
    end_index: number
  }>
  can_answer: boolean
  response_time?: number
}

interface Message {
  question: string
  answer: QAResponse | null
  loading: boolean
}

const documents = ref<DocumentInfo[]>([])
const selectedDocId = ref<string>('')
const selectedDoc = ref<DocumentInfo | null>(null)
const loading = ref(false)
const isAsking = ref(false)
const question = ref('')
const messages = ref<Message[]>([])
const expandedSources = ref<number[]>([])
const llmEnabled = ref(true)

const chatContainer = ref<HTMLElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const fetchDocuments = async () => {
  loading.value = true
  try {
    const response = await api.getDocuments(0, 100)
    documents.value = response.documents || []
    const config = await api.getConfig()
    llmEnabled.value = config.llm_enabled
  } catch (error) {
    console.error('获取文档列表失败:', error)
  } finally {
    loading.value = false
  }
}

const selectDocument = (doc: DocumentInfo) => {
  selectedDocId.value = doc.document_id
  selectedDoc.value = doc
  messages.value = []
  expandedSources.value = []
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.focus()
    }
  })
}

const askQuestion = async () => {
  if (!question.value.trim() || isAsking.value || !selectedDocId.value) return

  const questionText = question.value.trim()
  question.value = ''

  const newMessage: Message = {
    question: questionText,
    answer: null,
    loading: true
  }
  messages.value.push(newMessage)
  isAsking.value = true

  scrollToBottom()

  try {
    const response = await api.askQuestion({
      document_id: selectedDocId.value,
      question: questionText
    })

    const msgIndex = messages.value.length - 1
    messages.value[msgIndex].answer = response
    messages.value[msgIndex].loading = false
  } catch (error) {
    console.error('提问失败:', error)
    const msgIndex = messages.value.length - 1
    messages.value[msgIndex].answer = {
      answer: '抱歉，回答问题时出现错误，请稍后重试。',
      confidence: 0,
      sources: [],
      can_answer: false
    }
    messages.value[msgIndex].loading = false
  } finally {
    isAsking.value = false
    scrollToBottom()
  }
}

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    askQuestion()
  }
}

const toggleSources = (index: number) => {
  const idx = expandedSources.value.indexOf(index)
  if (idx > -1) {
    expandedSources.value.splice(idx, 1)
  } else {
    expandedSources.value.push(index)
  }
}

const scrollToBottom = () => {
  nextTick(() => {
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    }
  })
}

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-CN')
}

const getConfidenceClass = (confidence: number) => {
  if (confidence >= 0.7) return 'high'
  if (confidence >= 0.4) return 'medium'
  return 'low'
}

onMounted(() => {
  fetchDocuments()
})
</script>

<style scoped>
.qa-view {
  display: flex;
  height: calc(100vh - 120px);
  background: #f8fafc;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.qa-sidebar {
  width: 320px;
  background: white;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 20px;
  border-bottom: 1px solid #e2e8f0;
}

.sidebar-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
}

.document-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.document-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 4px;
}

.document-item:hover {
  background: #f1f5f9;
}

.document-item.active {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
}

.doc-icon {
  color: #3b82f6;
  flex-shrink: 0;
  margin-top: 2px;
}

.doc-info {
  flex: 1;
  min-width: 0;
}

.doc-name {
  font-size: 14px;
  font-weight: 500;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.doc-meta {
  font-size: 12px;
  color: #64748b;
  margin-top: 4px;
  display: flex;
  gap: 6px;
}

.empty-state, .loading-state {
  text-align: center;
  padding: 40px 20px;
  color: #64748b;
  font-size: 14px;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.qa-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.qa-header {
  padding: 16px 24px;
  background: white;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.selected-doc-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.doc-title {
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
}

.doc-badge {
  background: #dbeafe;
  color: #1d4ed8;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.no-doc-selected {
  color: #64748b;
  font-size: 14px;
}

.qa-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.welcome-screen {
  text-align: center;
  padding: 80px 20px;
  color: #64748b;
}

.welcome-icon {
  color: #cbd5e1;
  margin-bottom: 24px;
}

.welcome-screen h2 {
  font-size: 24px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 12px;
}

.example-questions {
  max-width: 400px;
  margin: 40px auto 0;
  text-align: left;
  background: white;
  padding: 20px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
}

.example-questions h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #475569;
}

.example-questions ul {
  margin: 0;
  padding-left: 20px;
}

.example-questions li {
  padding: 6px 0;
  font-size: 14px;
  color: #64748b;
}

.messages-container {
  max-width: 900px;
  margin: 0 auto;
}

.message-wrapper {
  margin-bottom: 24px;
}

.message {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.message.user {
  flex-direction: row-reverse;
}

.message-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.user-avatar {
  background: #3b82f6;
  color: white;
}

.assistant-avatar {
  background: #10b981;
  color: white;
}

.message-content {
  max-width: calc(100% - 60px);
}

.message.user .message-content {
  text-align: right;
}

.message.user .message-content p {
  background: #3b82f6;
  color: white;
  display: inline-block;
  text-align: left;
}

.message-content p {
  margin: 0;
  padding: 12px 16px;
  background: white;
  border-radius: 12px;
  line-height: 1.6;
  border: 1px solid #e2e8f0;
  white-space: pre-wrap;
  word-break: break-word;
}

.loading-answer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: white;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  color: #64748b;
  font-size: 14px;
}

.answer-text {
  margin-bottom: 12px !important;
}

.answer-meta {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  font-size: 12px;
  padding: 0 4px;
}

.confidence {
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.confidence.high {
  background: #dcfce7;
  color: #166534;
}

.confidence.medium {
  background: #fef9c3;
  color: #854d0e;
}

.confidence.low {
  background: #fee2e2;
  color: #991b1b;
}

.response-time {
  color: #94a3b8;
}

.sources-section {
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  overflow: hidden;
}

.sources-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: #475569;
  background: #f1f5f9;
  user-select: none;
}

.sources-header .rotated {
  transform: rotate(180deg);
  transition: transform 0.2s;
}

.sources-list {
  padding: 12px;
}

.source-item {
  padding: 12px;
  background: white;
  border-radius: 6px;
  margin-bottom: 8px;
  border: 1px solid #e2e8f0;
}

.source-item:last-child {
  margin-bottom: 0;
}

.source-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: #3b82f6;
  margin-bottom: 6px;
}

.source-text {
  font-size: 13px;
  color: #475569;
  line-height: 1.5;
  margin: 0;
  padding: 0;
  background: none !important;
  border: none !important;
}

.qa-input-area {
  padding: 20px 24px;
  background: white;
  border-top: 1px solid #e2e8f0;
}

.input-wrapper {
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  gap: 12px;
  align-items: flex-end;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 8px 8px 8px 16px;
}

.input-wrapper textarea {
  flex: 1;
  border: none;
  background: transparent;
  resize: none;
  font-size: 14px;
  line-height: 1.5;
  outline: none;
  padding: 8px 0;
  max-height: 120px;
  font-family: inherit;
}

.input-wrapper textarea::placeholder {
  color: #94a3b8;
}

.send-btn {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  border: none;
  background: #3b82f6;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}

.send-btn:hover:not(:disabled) {
  background: #2563eb;
}

.send-btn:disabled {
  background: #cbd5e1;
  cursor: not-allowed;
}

.input-tips {
  max-width: 900px;
  margin: 8px auto 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #94a3b8;
}

.warning-tip {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #f59e0b;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
