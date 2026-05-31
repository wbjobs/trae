let commonWords: Set<string> | null = null

const MAX_SEGMENT_LENGTH = 500000

function initCommonWords() {
  if (commonWords) return
  
  commonWords = new Set([
    '的', '了', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
    '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看',
    '好', '自己', '这', '那', '里', '来', '他', '她', '它', '们', '这个', '那个',
    '什么', '怎么', '为什么', '如何', '可以', '可能', '应该', '需要', '因为',
    '所以', '但是', '如果', '虽然', '而且', '或者', '以及', '等等', '一些',
    '这样', '那样', '已经', '正在', '将要', '不是', '还是', '就是', '只是',
    '然后', '最后', '首先', '其次', '另外', '同时', '目前', '现在', '以前',
    '以后', '之间', '其中', '例如', '比如', '通过', '对于', '关于', '根据',
    '因此', '然而', '而且', '此外', '特别', '非常', '比较', '更加', '最',
    '所有', '任何', '每个', '各个', '不同', '相同', '其他', '其它', '许多',
    '多少', '几个', '第一', '第二', '第三', '主要', '重要', '基本', '一般'
  ])
}

export function segmentText(text: string): string {
  initCommonWords()
  
  if (!text) return ''
  
  if (text.length > MAX_SEGMENT_LENGTH) {
    text = text.slice(0, MAX_SEGMENT_LENGTH)
  }
  
  const result: string[] = []
  const resultSet = new Set<string>()
  let i = 0
  let buffer = ''
  
  while (i < text.length) {
    const char = text[i]
    
    if (/[a-zA-Z0-9_]/.test(char)) {
      let j = i + 1
      while (j < text.length && /[a-zA-Z0-9_]/.test(text[j])) {
        j++
      }
      const word = text.slice(i, j).toLowerCase()
      if (word.length > 0 && !resultSet.has(word)) {
        resultSet.add(word)
        buffer += word + ' '
      }
      i = j
    } else if (/[\u4e00-\u9fa5]/.test(char)) {
      let matched = false
      
      for (let len = Math.min(4, text.length - i); len >= 2; len--) {
        const candidate = text.slice(i, i + len)
        if (isChineseWord(candidate) && !resultSet.has(candidate)) {
          resultSet.add(candidate)
          buffer += candidate + ' '
          i += len
          matched = true
          break
        }
      }
      
      if (!matched) {
        if (!resultSet.has(char)) {
          resultSet.add(char)
          buffer += char + ' '
        }
        i++
      }
    } else {
      i++
    }
    
    if (buffer.length > 10000) {
      result.push(buffer)
      buffer = ''
    }
  }
  
  if (buffer.length > 0) {
    result.push(buffer)
  }
  
  return result.join('')
}

function isChineseWord(text: string): boolean {
  if (!text || text.length < 2) return false
  if (!/^[\u4e00-\u9fa5]+$/.test(text)) return false
  if (commonWords?.has(text)) return true
  return true
}

export function simpleSegment(text: string): string {
  if (!text) return ''
  
  if (text.length > MAX_SEGMENT_LENGTH) {
    text = text.slice(0, MAX_SEGMENT_LENGTH)
  }
  
  const result: string[] = []
  const resultSet = new Set<string>()
  let i = 0
  
  while (i < text.length) {
    const char = text[i]
    
    if (/[a-zA-Z0-9_]/.test(char)) {
      let j = i + 1
      while (j < text.length && /[a-zA-Z0-9_]/.test(text[j])) {
        j++
      }
      const word = text.slice(i, j)
      if (!resultSet.has(word)) {
        resultSet.add(word)
        result.push(word)
      }
      i = j
    } else if (/[\u4e00-\u9fa5]/.test(char)) {
      if (!resultSet.has(char)) {
        resultSet.add(char)
        result.push(char)
      }
      if (i + 1 < text.length && /[\u4e00-\u9fa5]/.test(text[i + 1])) {
        const bigram = text.slice(i, i + 2)
        if (!resultSet.has(bigram)) {
          resultSet.add(bigram)
          result.push(bigram)
        }
      }
      if (i + 2 < text.length && /[\u4e00-\u9fa5]/.test(text[i + 2])) {
        const trigram = text.slice(i, i + 3)
        if (!resultSet.has(trigram)) {
          resultSet.add(trigram)
          result.push(trigram)
        }
      }
      i++
    } else {
      i++
    }
  }
  
  return result.join(' ')
}
