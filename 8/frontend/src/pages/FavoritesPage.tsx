import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Star, ExternalLink, Tag, Clock, Trash2 } from 'lucide-react';
import CodeBlock from '../components/CodeBlock';
import { userApi, snippetApi } from '../services/api';
import { FavoriteItem, LANGUAGE_OPTIONS } from '../types';

function getLanguageLabel(value: string): string {
  const option = LANGUAGE_OPTIONS.find(opt => opt.value === value);
  return option ? option.label : value;
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN');
  } catch {
    return dateStr;
  }
}

export function FavoritesPage() {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadFavorites();
  }, []);

  const loadFavorites = async () => {
    setLoading(true);
    try {
      const data = await userApi.getFavorites();
      setFavorites(data);
    } catch (error) {
      console.error('Failed to load favorites:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFavorite = async (snippetId: string) => {
    try {
      await snippetApi.toggleFavorite(snippetId);
      setFavorites(prev => prev.filter(f => f.code_snippet_id !== snippetId));
    } catch (error) {
      console.error('Failed to remove favorite:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 py-12">
          <div className="animate-pulse space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-40 bg-gray-200 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">我的收藏</h1>
          <p className="text-gray-600">
            您收藏的代码片段 ({favorites.length} 个)
          </p>
        </div>

        {favorites.length > 0 ? (
          <div className="space-y-4">
            {favorites.map((favorite) => {
              const snippet = favorite.snippet_data;
              if (!snippet) return null;

              const isExpanded = expandedId === snippet.id;

              return (
                <div
                  key={favorite.id}
                  className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-3 mb-2">
                          <Link
                            to={`/snippet/${snippet.id}`}
                            className="text-lg font-semibold text-gray-900 hover:text-blue-600 transition-colors"
                          >
                            {snippet.title || '未命名代码片段'}
                          </Link>
                          <Link
                            to={`/snippet/${snippet.id}`}
                            className="text-gray-400 hover:text-blue-500"
                          >
                            <ExternalLink size={16} />
                          </Link>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 mb-3">
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                            {getLanguageLabel(snippet.language)}
                          </span>
                          <span className="flex items-center">
                            <Clock size={14} className="mr-1" />
                            收藏于 {formatDate(favorite.created_at)}
                          </span>
                        </div>

                        {snippet.description && (
                          <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                            {snippet.description}
                          </p>
                        )}

                        {snippet.tags && snippet.tags.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-4">
                            {snippet.tags.slice(0, 5).map((tag, index) => (
                              <span
                                key={index}
                                className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded-full"
                              >
                                <Tag size={12} className="mr-1" />
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center space-x-4">
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : snippet.id)}
                            className="text-sm text-blue-600 hover:text-blue-800"
                          >
                            {isExpanded ? '收起代码' : '查看代码'}
                          </button>
                          <button
                            onClick={() => handleToggleFavorite(snippet.id)}
                            className="inline-flex items-center space-x-1 text-sm text-red-600 hover:text-red-800"
                          >
                            <Trash2 size={14} />
                            <span>取消收藏</span>
                          </button>
                        </div>
                      </div>

                      <Star
                        className="w-6 h-6 text-amber-500 flex-shrink-0"
                        fill="currentColor"
                      />
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-6 pb-6 border-t border-gray-100 pt-4">
                      <CodeBlock code={snippet.code} language={snippet.language} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
            <Star className="mx-auto h-16 w-16 text-gray-300 mb-4" />
            <h2 className="text-xl font-medium text-gray-900 mb-2">暂无收藏</h2>
            <p className="text-gray-500 mb-6">
              浏览代码片段并收藏您喜欢的内容
            </p>
            <Link
              to="/"
              className="inline-flex items-center space-x-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
            >
              <span>去搜索代码</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default FavoritesPage;
