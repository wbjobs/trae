import React, { useState, useEffect } from 'react';
import { Search, Filter, X, Sparkles } from 'lucide-react';
import SnippetCard from '../components/SnippetCard';
import { snippetApi, userApi } from '../services/api';
import { SearchResult, LANGUAGE_OPTIONS, SearchQuery } from '../types';

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recommendations, setRecommendations] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [languageFilter, setLanguageFilter] = useState<string>('');
  const [topK, setTopK] = useState(10);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    loadRecommendations();
  }, []);

  const loadRecommendations = async () => {
    setRecommendationsLoading(true);
    try {
      const recs = await userApi.getRecommendations(5);
      setRecommendations(recs);
    } catch (error) {
      console.error('Failed to load recommendations:', error);
    } finally {
      setRecommendationsLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) return;

    setLoading(true);
    setHasSearched(true);
    try {
      const searchPayload: SearchQuery = {
        query: query.trim(),
        top_k: topK,
        language: languageFilter || undefined
      };

      const searchResults = await snippetApi.search(searchPayload);
      setResults(searchResults);
    } catch (error) {
      console.error('Search failed:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  const handleClearFilters = () => {
    setLanguageFilter('');
  };

  const hasFilters = languageFilter !== '';

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            代码片段语义搜索
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            使用自然语言描述你想要的代码功能，AI 将为你找到最相关的代码片段
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="例如：如何实现一个带超时的HTTP请求？"
                className="w-full pl-12 pr-24 py-4 text-lg border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              />
              <button
                onClick={handleSearch}
                disabled={loading || !query.trim()}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {loading ? '搜索中...' : '搜索'}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center space-x-2">
                <Filter size={18} className="text-gray-500" />
                <label className="text-sm text-gray-600">编程语言:</label>
                <select
                  value={languageFilter}
                  onChange={(e) => setLanguageFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                  <option value="">全部语言</option>
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center space-x-2">
                <label className="text-sm text-gray-600">返回数量:</label>
                <select
                  value={topK}
                  onChange={(e) => setTopK(Number(e.target.value))}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                  <option value={5}>5 个</option>
                  <option value={10}>10 个</option>
                  <option value={20}>20 个</option>
                </select>
              </div>

              {hasFilters && (
                <button
                  onClick={handleClearFilters}
                  className="flex items-center space-x-1 px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  <X size={16} />
                  <span>清除筛选</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {hasSearched && (
          <div className="mb-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">
                搜索结果
              </h2>
              <span className="text-sm text-gray-500">
                找到 {results.length} 个结果
              </span>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-48 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : results.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {results.map((result) => (
                  <SnippetCard key={result.id} snippet={result} />
                ))}
              </div>
            ) : (
              <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                <Search className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">未找到相关代码</h3>
                <p className="text-gray-500">尝试使用不同的关键词或清除筛选条件</p>
              </div>
            )}
          </div>
        )}

        {!hasSearched && (
          <div>
            <div className="flex items-center space-x-2 mb-6">
              <Sparkles className="h-6 w-6 text-amber-500" />
              <h2 className="text-xl font-semibold text-gray-900">
                为您推荐
              </h2>
            </div>

            {recommendationsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-48 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : recommendations.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recommendations.map((result) => (
                  <SnippetCard key={result.id} snippet={result} showReason />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                <Sparkles className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">暂无推荐</h3>
                <p className="text-gray-500">开始搜索和浏览代码片段，我们将为您提供个性化推荐</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default SearchPage;
