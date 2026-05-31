import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Star,
  MessageSquare,
  Send,
  Tag,
  Clock,
  Code2,
  Sparkles,
  Trash2,
  AlertTriangle,
  History,
  Edit2,
  GitCompare,
  X,
  ChevronRight
} from 'lucide-react';
import CodeBlock from '../components/CodeBlock';
import SnippetCard from '../components/SnippetCard';
import { snippetApi } from '../services/api';
import { CodeSnippet, SearchResult, Comment, LANGUAGE_OPTIONS, CodeSnippetVersion } from '../types';

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

export function SnippetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [snippet, setSnippet] = useState<CodeSnippet | null>(null);
  const [similarSnippets, setSimilarSnippets] = useState<SearchResult[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [versions, setVersions] = useState<CodeSnippetVersion[]>([]);
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showVersionCompare, setShowVersionCompare] = useState(false);
  const [compareVersion1, setCompareVersion1] = useState<number | null>(null);
  const [compareVersion2, setCompareVersion2] = useState<number | null>(null);
  const [compareDiff, setCompareDiff] = useState<any>(null);
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');

  useEffect(() => {
    if (id) {
      loadSnippet(id);
    }
  }, [id]);

  const loadSnippet = async (snippetId: string) => {
    setLoading(true);
    try {
      const [snippetData, similarData, commentsData, favoriteData, versionsData] = await Promise.all([
        snippetApi.get(snippetId),
        snippetApi.getSimilar(snippetId, 5),
        snippetApi.getComments(snippetId),
        snippetApi.checkFavorite(snippetId),
        snippetApi.getVersions(snippetId).catch(() => [])
      ]);

      setSnippet(snippetData);
      setSimilarSnippets(similarData);
      setComments(commentsData);
      setIsFavorite(favoriteData.is_favorite);
      setVersions(versionsData);
    } catch (error) {
      console.error('Failed to load snippet:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFavorite = async () => {
    if (!id) return;

    try {
      const result = await snippetApi.toggleFavorite(id);
      setIsFavorite(result.is_favorite);
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !commentText.trim()) return;

    setSubmittingComment(true);
    try {
      const newComment = await snippetApi.addComment(id, commentText.trim());
      setComments(prev => [newComment, ...prev]);
      setCommentText('');
    } catch (error) {
      console.error('Failed to add comment:', error);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;

    try {
      await snippetApi.delete(id);
      navigate('/');
    } catch (error) {
      console.error('Failed to delete snippet:', error);
      alert('删除失败，请重试');
    }
  };

  const handleCompare = async () => {
    if (!id || compareVersion1 === null || compareVersion2 === null) return;

    setLoadingCompare(true);
    try {
      const diff = await snippetApi.compareVersions(id, compareVersion1, compareVersion2);
      setCompareDiff(diff);
      setShowVersionCompare(true);
    } catch (error) {
      console.error('Failed to compare versions:', error);
    } finally {
      setLoadingCompare(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 py-12">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/4" />
            <div className="h-64 bg-gray-200 rounded-xl" />
            <div className="h-32 bg-gray-200 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!snippet) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Code2 className="mx-auto h-16 w-16 text-gray-300 mb-4" />
          <h2 className="text-xl font-medium text-gray-900 mb-2">代码片段不存在</h2>
          <button
            onClick={() => navigate('/')}
            className="text-blue-600 hover:text-blue-800"
          >
            返回搜索页面
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft size={20} />
          <span>返回</span>
        </button>

        <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-8">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                  {snippet.title || '未命名代码片段'}
                </h1>
                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                  <span className="inline-flex items-center px-3 py-1 bg-blue-50 text-blue-700 rounded-full font-medium">
                    {getLanguageLabel(snippet.language)}
                  </span>
                  <span className="flex items-center">
                    <Clock size={14} className="mr-1" />
                    {formatDate(snippet.created_at)}
                  </span>
                  {versions.length > 1 && (
                    <span className="flex items-center">
                      <History size={14} className="mr-1" />
                      {versions.length} 个版本
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-2 ml-4">
                <button
                  onClick={() => navigate(`/edit/${id}`)}
                  className="inline-flex items-center space-x-1 px-4 py-2 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                >
                  <Edit2 size={18} />
                  <span>编辑</span>
                </button>

                <button
                  onClick={handleToggleFavorite}
                  className={`inline-flex items-center space-x-1 px-4 py-2 rounded-lg transition-colors ${
                    isFavorite
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Star size={18} fill={isFavorite ? 'currentColor' : 'none'} />
                  <span>{isFavorite ? '已收藏' : '收藏'}</span>
                </button>

                {versions.length > 1 && (
                  <button
                    onClick={() => setShowVersionHistory(true)}
                    className="inline-flex items-center space-x-1 px-4 py-2 rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
                  >
                    <History size={18} />
                    <span>历史版本</span>
                  </button>
                )}

                <button
                  onClick={() => setDeleteConfirm(true)}
                  className="inline-flex items-center space-x-1 px-4 py-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                >
                  <Trash2 size={18} />
                  <span>删除</span>
                </button>
              </div>
            </div>

            {snippet.description && (
              <p className="mt-4 text-gray-600 leading-relaxed">
                {snippet.description}
              </p>
            )}

            {snippet.tags && snippet.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {snippet.tags.map((tag, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-3 py-1 text-sm font-medium text-blue-700 bg-blue-50 rounded-full"
                  >
                    <Tag size={14} className="mr-1" />
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="p-6">
            <CodeBlock code={snippet.code} language={snippet.language} />
          </div>
        </div>

        {deleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 max-w-md mx-4">
              <div className="flex items-center text-amber-600 mb-4">
                <AlertTriangle size={24} className="mr-2" />
                <h3 className="text-lg font-semibold">确认删除</h3>
              </div>
              <p className="text-gray-600 mb-6">
                确定要删除这段代码片段吗？此操作无法撤销。
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setDeleteConfirm(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  取消
                </button>
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        )}

        {showVersionHistory && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[80vh] flex flex-col">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-xl font-semibold text-gray-900 flex items-center">
                  <History className="w-5 h-5 mr-2" />
                  版本历史
                </h3>
                <button
                  onClick={() => setShowVersionHistory(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-auto p-6">
                {versions.length > 1 ? (
                  <>
                    <div className="mb-6 p-4 bg-blue-50 rounded-xl">
                      <h4 className="text-sm font-medium text-blue-900 mb-3">版本对比</h4>
                      <div className="flex items-center space-x-3">
                        <select
                          value={compareVersion1 ?? ''}
                          onChange={(e) => setCompareVersion1(e.target.value ? Number(e.target.value) : null)}
                          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg"
                        >
                          <option value="">选择版本 1</option>
                          {versions.map((v) => (
                            <option key={v.version_number} value={v.version_number}>
                              v{v.version_number} - {v.change_note || '无说明'}
                            </option>
                          ))}
                        </select>
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                        <select
                          value={compareVersion2 ?? ''}
                          onChange={(e) => setCompareVersion2(e.target.value ? Number(e.target.value) : null)}
                          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg"
                        >
                          <option value="">选择版本 2</option>
                          {versions.map((v) => (
                            <option key={v.version_number} value={v.version_number}>
                              v{v.version_number} - {v.change_note || '无说明'}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={handleCompare}
                          disabled={compareVersion1 === null || compareVersion2 === null || loadingCompare}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center"
                        >
                          <GitCompare size={18} className="mr-2" />
                          {loadingCompare ? '对比中...' : '对比'}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {versions.map((version, index) => (
                        <div
                          key={version.id}
                          className={`p-4 rounded-xl border-2 transition-all ${
                            version.version_number === versions.length - 1
                              ? 'border-green-200 bg-green-50'
                              : 'border-gray-100 bg-gray-50'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-3 mb-2">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  version.version_number === versions.length - 1
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}>
                                  v{version.version_number}
                                  {version.version_number === versions.length - 1 && ' (当前)'}
                                </span>
                                <span className="text-sm text-gray-500">
                                  {formatDate(version.created_at)}
                                </span>
                              </div>
                              {version.change_note && (
                                <p className="text-sm text-gray-700 mb-3">
                                  {version.change_note}
                                </p>
                              )}
                              {version.auto_tags && version.auto_tags.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {version.auto_tags.map((tag, idx) => (
                                    <span
                                      key={idx}
                                      className="px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-12">
                    <History className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                    <p className="text-gray-500">暂无历史版本</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {showVersionCompare && compareDiff && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-6xl w-full max-h-[80vh] flex flex-col">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-xl font-semibold text-gray-900 flex items-center">
                  <GitCompare className="w-5 h-5 mr-2" />
                  版本对比: v{compareDiff.version1} → v{compareDiff.version2}
                </h3>
                <button
                  onClick={() => setShowVersionCompare(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-auto p-6">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-3">
                      版本 {compareDiff.version1}
                    </h4>
                    <CodeBlock
                      code={compareDiff.content1}
                      language={snippet?.language || 'text'}
                      maxHeight="300px"
                    />
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-3">
                      版本 {compareDiff.version2}
                    </h4>
                    <CodeBlock
                      code={compareDiff.content2}
                      language={snippet?.language || 'text'}
                      maxHeight="300px"
                    />
                  </div>
                </div>

                {compareDiff.statistics && (
                  <div className="mt-6 p-4 bg-gray-50 rounded-xl">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">变更统计</h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-gray-900">
                          {compareDiff.statistics.lines_added}
                        </div>
                        <div className="text-xs text-green-600">新增行</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-gray-900">
                          {compareDiff.statistics.lines_removed}
                        </div>
                        <div className="text-xs text-red-600">删除行</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-gray-900">
                          {compareDiff.statistics.lines_modified}
                        </div>
                        <div className="text-xs text-yellow-600">修改行</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {similarSnippets.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center space-x-2 mb-4">
              <Sparkles className="h-6 w-6 text-blue-500" />
              <h2 className="text-xl font-semibold text-gray-900">相似代码片段</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {similarSnippets.map((snippet) => (
                <SnippetCard key={snippet.id} snippet={snippet} />
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center space-x-2">
              <MessageSquare className="h-6 w-6 text-gray-500" />
              <h2 className="text-xl font-semibold text-gray-900">评论 ({comments.length})</h2>
            </div>
          </div>

          <div className="p-6">
            <form onSubmit={handleSubmitComment} className="mb-6">
              <div className="flex space-x-3">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="写下您的评论..."
                  rows={3}
                  className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
                />
              </div>
              <div className="flex justify-end mt-3">
                <button
                  type="submit"
                  disabled={submittingComment || !commentText.trim()}
                  className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  <Send size={16} />
                  <span>{submittingComment ? '发送中...' : '发送评论'}</span>
                </button>
              </div>
            </form>

            {comments.length > 0 ? (
              <div className="space-y-4">
                {comments.map((comment) => (
                  <div key={comment.id} className="p-4 bg-gray-50 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">
                        {comment.user_id}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatDate(comment.created_at)}
                      </span>
                    </div>
                    <p className="text-gray-600">{comment.content}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <MessageSquare className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                <p className="text-gray-500">暂无评论，来发表第一条评论吧！</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SnippetDetailPage;
