export function highlightText(text: string, query: string): string {
  if (!query || !text) return text

  const searchTerms = query.split(/\s+/).filter(t => t.trim())
  if (searchTerms.length === 0) return text

  let result = text
  const usedPositions: Set<number> = new Set()

  for (const term of searchTerms) {
    const regex = new RegExp(`(${escapeRegExp(term)})`, 'gi')
    result = result.replace(regex, (match, p1, offset) => {
      if (usedPositions.has(offset)) return match
      usedPositions.add(offset)
      return `<span class="highlight">${p1}</span>`
    })
  }

  return result
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function getPreviewText(content: string, query: string, maxLength: number = 200): string {
  if (!content) return ''
  if (!query) return content.slice(0, maxLength) + (content.length > maxLength ? '...' : '')

  const searchTerms = query.split(/\s+/).filter(t => t.trim())
  if (searchTerms.length === 0) return content.slice(0, maxLength) + '...'

  let bestPosition = -1
  let bestScore = 0

  for (const term of searchTerms) {
    const lowerContent = content.toLowerCase()
    const lowerTerm = term.toLowerCase()
    let position = lowerContent.indexOf(lowerTerm)
    
    while (position !== -1) {
      const score = calculateScore(content, position, term)
      if (score > bestScore) {
        bestScore = score
        bestPosition = position
      }
      position = lowerContent.indexOf(lowerTerm, position + 1)
    }
  }

  if (bestPosition === -1) {
    return content.slice(0, maxLength) + (content.length > maxLength ? '...' : '')
  }

  const start = Math.max(0, bestPosition - Math.floor(maxLength / 3))
  const end = Math.min(content.length, start + maxLength)
  
  let preview = content.slice(start, end)
  if (start > 0) preview = '...' + preview
  if (end < content.length) preview = preview + '...'

  return preview
}

function calculateScore(content: string, position: number, term: string): number {
  let score = 1

  const beforeChar = position > 0 ? content[position - 1] : ' '
  const afterChar = position + term.length < content.length ? content[position + term.length] : ' '
  
  if (!/[a-zA-Z0-9\u4e00-\u9fa5]/.test(beforeChar)) score += 2
  if (!/[a-zA-Z0-9\u4e00-\u9fa5]/.test(afterChar)) score += 2

  return score
}
