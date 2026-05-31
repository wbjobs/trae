import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import clsx from 'clsx';

export default function Login() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const serverAddress = useAuthStore((state) => state.serverAddress);
  const setServerAddress = useAuthStore((state) => state.setServerAddress);

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [tempServerAddress, setTempServerAddress] = useState(serverAddress);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(username, password);
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      setError(err.message || '登录失败，请检查用户名和密码');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveServerConfig = () => {
    setServerAddress(tempServerAddress);
    setShowServerConfig(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary-400/20 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-8 shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-white shadow-lg flex items-center justify-center mb-4">
              <Shield className="w-8 h-8 text-primary-600" />
            </div>
            <h1 className="text-2xl font-bold text-white">NFC门禁管理系统</h1>
            <p className="text-white/60 text-sm mt-1">请登录以继续</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {showServerConfig ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1.5">
                    服务端地址
                  </label>
                  <input
                    type="text"
                    value={tempServerAddress}
                    onChange={(e) => setTempServerAddress(e.target.value)}
                    placeholder="http://localhost:50051"
                    className="input-field bg-white/10 border-white/20 text-white placeholder-white/40"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowServerConfig(false)}
                    className="flex-1 btn-secondary bg-white/10 border-white/20 text-white hover:bg-white/20"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveServerConfig}
                    className="flex-1 btn-primary"
                  >
                    保存
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1.5">
                    用户名
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="请输入用户名"
                    className="input-field bg-white/10 border-white/20 text-white placeholder-white/40"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1.5">
                    密码
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="请输入密码"
                      className="input-field bg-white/10 border-white/20 text-white placeholder-white/40 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="p-3 rounded-lg bg-red-500/20 border border-red-400/30 text-red-200 text-sm">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className={clsx(
                    'w-full btn-primary py-3',
                    loading && 'opacity-70 cursor-not-allowed'
                  )}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      登录中...
                    </span>
                  ) : (
                    '登录'
                  )}
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setShowServerConfig(true)}
                    className="text-white/60 hover:text-white text-sm transition-colors"
                  >
                    配置服务端地址
                  </button>
                </div>
              </>
            )}
          </form>
        </div>

        <p className="text-center text-white/40 text-xs mt-6">
          当前服务端: {serverAddress}
        </p>
      </div>
    </div>
  );
}
