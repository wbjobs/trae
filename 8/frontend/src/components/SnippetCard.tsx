import React from 'react';
import { Link } from 'react-router-dom';
import { Star, ExternalLink, Tag } from 'lucide-react';
import { SearchResult } from '../types';
import { LANGUAGE_OPTIONS } from '../types';

interface SnippetCardProps {
  snippet: SearchResult;
  showReason?: boolean;
}

function getLanguageLabel(value: string): string {
  const option = LANGUAGE_OPTIONS.find(opt => opt.value === value);
  return option ? option.label : value;
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN');
  } catch {
    return dateStr;
  }
}

export function SnippetCard({ snippet, showReason = false }: SnippetCardProps) {
  const similarityPercent = Math.round(snippet.similarity * 100);

  return (
    <Link
      to={`/snippet/${snippet.id}`}
      className="block bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all overflow-hidden group"
    >
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
              {snippet.title || '未命名代码片段'}
            </h3>
            <div className="flex items-center space-x-3 mt-1 text-sm text-gray-500">
              <span className="px-2 py-0.5 bg-gray-100 rounded-full text-xs font-medium">
                {getLanguageLabel(snippet.language)}
              </span>
              <span>{formatDate(snippet.created_at)}</span>
              {snippet.similarity !== undefined && (
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    similarityPercent >= 80
                      ? 'bg-green-100 text-green-700'
                      : similarityPercent >= 60
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {similarityPercent}% 匹配
                </span>
              )}
            </div>
          </div>
          <ExternalLink className="w-5 h-5 text-gray-400 group-hover:text-blue-500 flex-shrink-0" />
        </div>

        {showReason && snippet.reason && (
          <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800 flex items-center">
              <Star className="w-4 h-4 mr-1" />
              {snippet.reason}
            </p>
          </div>
        )}

        {snippet.description && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-2">
            {snippet.description}
          </p>
        )}

        {snippet.tags && snippet.tags.length > 0 && (
          <div className="flex items-center flex-wrap gap-2">
            {snippet.tags.slice(0, 5).map((tag, index) => (
              <span
                key={index}
                className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded-full"
              >
                <Tag className="w-3 h-3 mr-1" />
                {tag}
              </span>
            ))}
            {snippet.tags.length > 5 && (
              <span className="text-xs text-gray-500">+{snippet.tags.length - 5}</span>
            )}
          </div>
        )}
      </div>

      <div className="bg-gray-50 px-5 py-3 border-t border-gray-100">
        <pre className="text-xs text-gray-600 font-mono line-clamp-3 whitespace-pre-wrap break-words">
          {snippet.code}
        </pre>
      </div>
    </Link>
  );
}

export default SnippetCard;
