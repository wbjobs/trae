import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Upload, CheckCircle, FileText, Tag, Code2, Save, Sparkles, RefreshCw, Plus, X } from 'lucide-react';
import { snippetApi } from '../services/api';
import { LANGUAGE_OPTIONS, CreateSnippetPayload, UpdateSnippetPayload, AutoTagPreview } from '../types';
import CodeBlock from '../components/CodeBlock';

export function UploadPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;

  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('python');
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [manualTags, setManualTags] = useState<string[]>([]);
  const [changeNote, setChangeNote] = useState('');
  const [includeAutoTags, setIncludeAutoTags] = useState(true);

  const [loading, setLoading] = useState(false);
  const [loadingSnippet, setLoadingSnippet] = useState(false);
  const [previewingTags, setPreviewingTags] = useState(false);
  const [autoTagPreview, setAutoTagPreview] = useState<AutoTagPreview | null>(null);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isEditMode && id) {
      loadSnippetForEdit(id);
    }
  }, [isEditMode, id]);

  const loadSnippetForEdit = async (snippetId: string) => {
    setLoadingSnippet(true);
    try {
      const snippet = await snippetApi.get(snippetId);
      setTitle(snippet.title || '');
      setCode(snippet.code);
      setLanguage(snippet.language);
      setDescription(snippet.description || '');
      setManualTags(snippet.tags || []);
    } catch (err) {
      console.error('Failed to load snippet:', err);
      setError('加载代码片段失败');
    } finally {
      setLoadingSnippet(false);
    }
  };

  const previewAutoTags = useCallback(async () => {
    if (!code.trim()) return;

    setPreviewingTags(true);
    try {
      const payload: CreateSnippetPayload = {
        title: title.trim() || undefined,
        code: code,
        language,
        description: description.trim() || undefined,
        tags: manualTags
      };

      const result = await snippetApi.previewTags(payload);
      setAutoTagPreview(result);
    } catch (err) {
      console.error('Failed to preview tags:', err);
    } finally {
      setPreviewingTags(false);
    }
  }, [code, title, language, description, manualTags]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (code.trim()) {
        previewAutoTags();
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [code, title, language, description, manualTags, previewAutoTags]);

  const handleAddTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !manualTags.includes(trimmed)) {
      setManualTags([...manualTags, trimmed]);
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setManualTags(manualTags.filter(t => t !== tagToRemove));
  };

  const handleAddAutoTag = (tag: string) => {
    if (!manualTags.includes(tag)) {
      setManualTags([...manualTags, tag]);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const input = (e.target as HTMLInputElement).value;
      if (input) {
        handleAddTag(input);
        setTagsInput('');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!code.trim()) {
      setError('请输入代码内容');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      if (isEditMode && id) {
        const payload: UpdateSnippetPayload = {
          title: title.trim() || undefined,
          code: code,
          language,
          description: description.trim() || undefined,
          tags: manualTags,
          change_note: changeNote.trim() || undefined
        };

        const result = await snippetApi.update(id, payload, includeAutoTags);
        setSuccess(true);

        setTimeout(() => {
          navigate(`/snippet/${result.id}`);
        }, 1500);
      } else {
        const payload: CreateSnippetPayload = {
          title: title.trim() || undefined,
          code: code,
          language,
          description: description.trim() || undefined,
          tags: manualTags
        };

        const result = await snippetApi.create(payload, includeAutoTags);
        setSuccess(true);

        setTimeout(() => {
          navigate(`/snippet/${result.id}`);
        }, 1500);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || '上传失败，请重试');
      console.error('Upload failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCode(content);

      const ext = file.name.split('.').pop()?.toLowerCase();
      const extToLang: Record<string, string> = {
        py: 'python',
        js: 'javascript',
        ts: 'typescript',
        java: 'java',
        cpp: 'cpp',
        c: 'c',
        cs: 'csharp',
        go: 'go',
        rs: 'rust',
        php: 'php',
        rb: 'ruby',
        swift: 'swift',
        kt: 'kotlin',
        sql: 'sql',
        sh: 'bash',
        html: 'html',
        css: 'css',
        json: 'json',
        yaml: 'yaml',
        yml: 'yaml',
        md: 'markdown'
      };

      if (ext && extToLang[ext]) {
        setLanguage(extToLang[ext]);
      }
    };
    reader.readAsText(file);
  };

  if (loadingSnippet) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/4" />
            <div className="h-64 bg-gray-200 rounded-xl" />
            <div className="h-32 bg-gray-200 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {isEditMode ? '编辑代码片段' : '上传代码片段'}
          </h1>
          <p className="text-gray-600">
            {isEditMode ? '修改代码并保存新版本' : '分享您的代码片段，帮助他人快速找到解决方案'}
          </p>
        </div>

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center">
            <CheckCircle className="w-6 h-6 text-green-500 mr-3" />
            <span className="text-green-700 font-medium">
              {isEditMode ? '代码片段更新成功！正在跳转...' : '代码片段上传成功！正在跳转...'}
            </span>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg overflow-hidden">
              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <FileText className="inline w-4 h-4 mr-1" />
                    标题（可选）
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="例如：Python 带超时的 HTTP 请求"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Code2 className="inline w-4 h-4 mr-1" />
                    代码内容 *
                  </label>
                  {!isEditMode && (
                    <div className="mb-3">
                      <label className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                        <Upload className="w-4 h-4 mr-2" />
                        从文件上传
                        <input
                          type="file"
                          onChange={handleFileUpload}
                          className="hidden"
                          accept=".py,.js,.ts,.java,.cpp,.c,.cs,.go,.rs,.php,.rb,.swift,.kt,.sql,.sh,.html,.css,.json,.yaml,.yml,.md,.txt"
                        />
                      </label>
                    </div>
                  )}
                  <textarea
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="在此粘贴或输入您的代码..."
                    rows={14}
                    className="w-full px-4 py-3 font-mono text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-y"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      编程语言
                    </label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    >
                      {LANGUAGE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <Sparkles className="inline w-4 h-4 mr-1 text-blue-500" />
                      启用自动标签
                    </label>
                    <label className="flex items-center mt-2">
                      <input
                        type="checkbox"
                        checked={includeAutoTags}
                        onChange={(e) => setIncludeAutoTags(e.target.checked)}
                        className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm text-gray-600">
                        保存时自动添加推荐标签
                      </span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Tag className="inline w-4 h-4 mr-1" />
                    标签
                  </label>
                  <div className="flex items-center space-x-2 mb-3">
                    <input
                      type="text"
                      value={tagsInput}
                      onChange={(e) => setTagsInput(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="输入标签后按回车添加"
                      className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (tagsInput) {
                          handleAddTag(tagsInput);
                          setTagsInput('');
                        }
                      }}
                      className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                  {manualTags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {manualTags.map((tag, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-3 py-1 text-sm font-medium text-blue-700 bg-blue-50 rounded-full"
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="ml-2 hover:text-blue-900"
                          >
                            <X size={14} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {isEditMode && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      修改说明（可选）
                    </label>
                    <input
                      type="text"
                      value={changeNote}
                      onChange={(e) => setChangeNote(e.target.value)}
                      placeholder="描述这次修改的内容，例如：修复了超时处理的bug"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    描述（可选）
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="描述这段代码的功能、用途或注意事项..."
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-y"
                  />
                </div>
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => navigate(-1)}
                    className="px-6 py-2.5 text-gray-600 hover:text-gray-800 font-medium"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !code.trim()}
                    className="flex items-center space-x-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    <Save className="w-5 h-5" />
                    <span>
                      {loading ? '正在处理...' : isEditMode ? '保存修改' : '保存代码片段'}
                    </span>
                  </button>
                </div>
              </div>
            </form>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <Sparkles className="w-5 h-5 mr-2 text-blue-500" />
                  推荐标签
                </h3>
                <button
                  type="button"
                  onClick={previewAutoTags}
                  disabled={previewingTags || !code.trim()}
                  className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400 disabled:cursor-not-allowed flex items-center"
                >
                  {previewingTags && <RefreshCw className="w-4 h-4 mr-1 animate-spin" />}
                  刷新
                </button>
              </div>

              {autoTagPreview && autoTagPreview.suggested_tags.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {autoTagPreview.suggested_tags.map((tag, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => handleAddAutoTag(tag)}
                        disabled={manualTags.includes(tag)}
                        className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                          manualTags.includes(tag)
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-amber-50 text-amber-700 hover:bg-amber-100 cursor-pointer'
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>

                  {autoTagPreview.keywords.length > 0 && (
                    <div className="pt-3 border-t border-gray-100">
                      <p className="text-xs text-gray-500 mb-2">提取的关键词：</p>
                      <div className="flex flex-wrap gap-1">
                        {autoTagPreview.keywords.slice(0, 15).map((keyword, index) => (
                          <span
                            key={index}
                            className="px-2 py-0.5 text-xs text-gray-500 bg-gray-100 rounded"
                          >
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  {code.trim()
                    ? '输入代码后将自动生成推荐标签'
                    : '请先输入代码以获取推荐标签'}
                </p>
              )}
            </div>

            {code.trim() && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">代码预览</h3>
                <CodeBlock code={code} language={language} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default UploadPage;
