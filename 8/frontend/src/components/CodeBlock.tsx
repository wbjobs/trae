import React, { useEffect, useRef, useState } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-php';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-swift';
import 'prismjs/components/prism-kotlin';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-markdown';
import { Copy, Check } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language: string;
  showCopy?: boolean;
  maxHeight?: string;
}

const languageMap: Record<string, string> = {
  python: 'python',
  javascript: 'javascript',
  typescript: 'typescript',
  java: 'java',
  cpp: 'cpp',
  c: 'c',
  csharp: 'csharp',
  go: 'go',
  rust: 'rust',
  php: 'php',
  ruby: 'ruby',
  swift: 'swift',
  kotlin: 'kotlin',
  sql: 'sql',
  bash: 'bash',
  html: 'markup',
  css: 'css',
  json: 'json',
  yaml: 'yaml',
  markdown: 'markdown',
};

export function CodeBlock({ code, language, showCopy = true, maxHeight }: CodeBlockProps) {
  const codeRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (codeRef.current) {
      Prism.highlightElement(codeRef.current);
    }
  }, [code, language]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const prismLang = languageMap[language] || 'plaintext';
  const preStyle = maxHeight ? { maxHeight } : undefined;

  return (
    <div className="relative group">
      {showCopy && (
        <button
          onClick={handleCopy}
          className="absolute right-3 top-3 p-2 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors opacity-0 group-hover:opacity-100 z-10"
          title="复制代码"
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
      )}
      <pre 
        className="bg-gray-900 rounded-lg overflow-auto"
        style={preStyle || { maxHeight: '24rem' }}
      >
        <code
          ref={codeRef}
          className={`language-${prismLang} text-sm leading-relaxed`}
        >
          {code}
        </code>
      </pre>
    </div>
  );
}

export default CodeBlock;
