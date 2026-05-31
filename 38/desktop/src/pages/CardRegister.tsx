import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CreditCard,
  User,
  Shield,
  Key,
  FileText,
  CheckCircle,
  XCircle,
  Loader2,
  Wifi,
  AlertTriangle,
} from 'lucide-react';
import { readNfcCard, isWebNfcSupported, detectCardType, formatUid, validateUid } from '@/utils/nfc';
import { authenticateMifare, writeCardToPn532, listNfcReaders } from '@/utils/tauri';
import { registerCard, getPermissionGroups } from '@/services/api';
import { NfcReader, NfcReadResult, PermissionGroup } from '@/types';
import clsx from 'clsx';

type Step = 'read' | 'info' | 'auth' | 'write' | 'complete';

export default function CardRegister() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('read');
  const [nfcSupported, setNfcSupported] = useState(true);
  const [readers, setReaders] = useState<NfcReader[]>([]);
  const [selectedReader, setSelectedReader] = useState('');
  const [reading, setReading] = useState(false);
  const [cardData, setCardData] = useState<NfcReadResult | null>(null);
  const [manualUid, setManualUid] = useState('');
  const [useManualInput, setUseManualInput] = useState(false);

  const [userName, setUserName] = useState('');
  const [description, setDescription] = useState('');
  const [permissionGroupId, setPermissionGroupId] = useState('');
  const [permissionGroups, setPermissionGroups] = useState<PermissionGroup[]>([]);

  const [keyA, setKeyA] = useState('FFFFFFFFFFFF');
  const [keyB, setKeyB] = useState('');
  const [authResult, setAuthResult] = useState<boolean | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [writeLoading, setWriteLoading] = useState(false);
  const [writeResult, setWriteResult] = useState<boolean | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setNfcSupported(isWebNfcSupported());
    loadReaders();
    loadPermissionGroups();
  }, []);

  const loadReaders = async () => {
    const readerList = await listNfcReaders();
    setReaders(readerList);
    if (readerList.length > 0) {
      setSelectedReader(readerList[0].name);
    }
  };

  const loadPermissionGroups = async () => {
    try {
      const groups = await getPermissionGroups();
      setPermissionGroups(groups);
      if (groups.length > 0) {
        setPermissionGroupId(groups[0].id);
      }
    } catch (error) {
      console.error('Failed to load permission groups:', error);
    }
  };

  const handleReadCard = async () => {
    setReading(true);
    setError('');
    try {
      const data = await readNfcCard();
      setCardData(data);
      setStep('info');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setReading(false);
    }
  };

  const handleManualInput = () => {
    if (!validateUid(manualUid)) {
      setError('请输入有效的UID（4字节或7字节十六进制）');
      return;
    }
    setCardData({
      uid: formatUid(manualUid),
      sak: '',
      atqa: '',
    });
    setStep('info');
  };

  const handleNextStep = () => {
    if (step === 'info') {
      if (!userName.trim()) {
        setError('请输入使用人姓名');
        return;
      }
      if (!permissionGroupId) {
        setError('请选择权限组');
        return;
      }
      setError('');
      setStep('auth');
    }
  };

  const handleAuthenticate = async () => {
    if (!cardData) return;
    setAuthLoading(true);
    setError('');

    try {
      const cleanUid = cardData.uid.replace(/:/g, '');
      const result = await authenticateMifare(3, 'A', keyA, cleanUid);
      setAuthResult(result);
      if (result) {
        setTimeout(() => setStep('write'), 1000);
      } else {
        setError('密钥认证失败，请检查密钥是否正确');
      }
    } catch (err: any) {
      setError(err.message);
      setAuthResult(false);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleWriteCard = async () => {
    if (!cardData) return;
    setWriteLoading(true);
    setError('');

    try {
      const result = await writeCardToPn532(cardData.uid, keyA, keyB);
      setWriteResult(result);

      if (result) {
        await registerCard({
          uid: cardData.uid,
          sak: cardData.sak,
          atqa: cardData.atqa,
          cardType: detectCardType(cardData.uid, cardData.sak),
          userName,
          permissionGroupId,
          description,
          keyA,
          keyB: keyB || undefined,
        });
        setTimeout(() => setStep('complete'), 1000);
      } else {
        setError('写入PN532失败，请检查设备连接');
      }
    } catch (err: any) {
      setError(err.message);
      setWriteResult(false);
    } finally {
      setWriteLoading(false);
    }
  };

  const handleComplete = () => {
    navigate('/cards');
  };

  const currentCardType = cardData ? detectCardType(cardData.uid, cardData.sak) : '';

  const steps = [
    { id: 'read', label: '读取卡片', icon: CreditCard },
    { id: 'info', label: '填写信息', icon: FileText },
    { id: 'auth', label: '密钥认证', icon: Key },
    { id: 'write', label: '写入设备', icon: Wifi },
    { id: 'complete', label: '完成', icon: CheckCircle },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === step);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <button
        onClick={() => navigate('/cards')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        返回卡片列表
      </button>

      <div className="card p-6">
        <div className="flex items-center justify-between mb-8">
          {steps.map((s, index) => {
            const Icon = s.icon;
            const isActive = s.id === step;
            const isCompleted = index < currentStepIndex;
            return (
              <div key={s.id} className="flex flex-col items-center flex-1">
                <div
                  className={clsx(
                    'w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-all',
                    isActive
                      ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/30'
                      : isCompleted
                      ? 'bg-success-500 text-white'
                      : 'bg-gray-100 text-gray-400'
                  )}
                >
                  {isCompleted ? <CheckCircle className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                </div>
                <span
                  className={clsx(
                    'text-xs font-medium',
                    isActive ? 'text-primary-600' : isCompleted ? 'text-success-600' : 'text-gray-400'
                  )}
                >
                  {s.label}
                </span>
                {index < steps.length - 1 && (
                  <div
                    className={clsx(
                      'h-0.5 w-full mt-2',
                      isCompleted ? 'bg-success-500' : 'bg-gray-200'
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-danger-50 border border-danger-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-danger-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-danger-800">操作失败</p>
              <p className="text-sm text-danger-600">{error}</p>
            </div>
          </div>
        )}

        {step === 'read' && (
          <div className="space-y-6">
            <div className="text-center py-8">
              {!nfcSupported && (
                <div className="mb-6 p-4 rounded-lg bg-warning-50 border border-warning-200 text-warning-700 text-sm">
                  <AlertTriangle className="w-5 h-5 inline mr-2" />
                  当前浏览器不支持Web NFC，请使用Chrome或Edge浏览器
                </div>
              )}

              {!useManualInput ? (
                <div className="space-y-6">
                  <div className="relative inline-flex">
                    <div className="w-32 h-32 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center">
                      <CreditCard className="w-12 h-12 text-primary-600" />
                    </div>
                    {reading && (
                      <>
                        <div className="absolute inset-0 rounded-full border-4 border-primary-400 animate-ripple" />
                        <div className="absolute inset-0 rounded-full border-4 border-primary-400 animate-ripple" style={{ animationDelay: '0.5s' }} />
                      </>
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">将门禁卡贴近读卡器</h3>
                    <p className="text-gray-500">请将实体门禁卡贴近NFC读卡器以读取卡片信息</p>
                  </div>
                  <button
                    onClick={handleReadCard}
                    disabled={reading || !nfcSupported}
                    className={clsx(
                      'btn-primary px-8 py-3',
                      (reading || !nfcSupported) && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {reading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        正在读取...
                      </span>
                    ) : (
                      '开始读卡'
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-4 max-w-md mx-auto">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      手动输入卡片UID
                    </label>
                    <input
                      type="text"
                      value={manualUid}
                      onChange={(e) => setManualUid(e.target.value.toUpperCase())}
                      placeholder="例如: 1A:2B:3C:4D 或 1A2B3C4D"
                      className="input-field font-mono text-center text-lg"
                      maxLength={23}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      支持4字节（8位）或7字节（14位）十六进制UID
                    </p>
                  </div>
                  <button onClick={handleManualInput} className="btn-primary w-full">
                    确认
                  </button>
                </div>
              )}

              <div className="pt-4">
                <button
                  onClick={() => setUseManualInput(!useManualInput)}
                  className="text-sm text-primary-600 hover:text-primary-700"
                >
                  {useManualInput ? '使用NFC读卡' : '手动输入UID'}
                </button>
              </div>
            </div>

            {readers.length > 0 && (
              <div className="p-4 rounded-lg bg-gray-50">
                <h4 className="text-sm font-medium text-gray-700 mb-3">可用读卡器</h4>
                <div className="space-y-2">
                  {readers.map((reader) => (
                    <div
                      key={reader.name}
                      className={clsx(
                        'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                        selectedReader === reader.name
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      )}
                      onClick={() => setSelectedReader(reader.name)}
                    >
                      <div
                        className={clsx(
                          'w-2 h-2 rounded-full',
                          reader.status === 'connected' ? 'bg-success-500' : 'bg-gray-400'
                        )}
                      />
                      <span className="text-sm text-gray-700">{reader.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'info' && cardData && (
          <div className="space-y-6">
            <div className="p-4 rounded-lg bg-primary-50 border border-primary-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <p className="font-mono text-primary-700 font-medium">{cardData.uid}</p>
                  <p className="text-sm text-primary-600">{currentCardType}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <User className="w-4 h-4 inline mr-1" />
                  使用人姓名 <span className="text-danger-500">*</span>
                </label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="请输入使用人姓名"
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Shield className="w-4 h-4 inline mr-1" />
                  权限组 <span className="text-danger-500">*</span>
                </label>
                <select
                  value={permissionGroupId}
                  onChange={(e) => setPermissionGroupId(e.target.value)}
                  className="input-field"
                >
                  {permissionGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <FileText className="w-4 h-4 inline mr-1" />
                  备注说明
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="可选：填写卡片用途、部门等信息"
                  rows={3}
                  className="input-field resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button onClick={() => setStep('read')} className="btn-secondary">
                上一步
              </button>
              <button onClick={handleNextStep} className="btn-primary">
                下一步
              </button>
            </div>
          </div>
        )}

        {step === 'auth' && (
          <div className="space-y-6">
            <div className="text-center py-4">
              <div
                className={clsx(
                  'w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center transition-all',
                  authResult === true
                    ? 'bg-success-100'
                    : authResult === false
                    ? 'bg-danger-100'
                    : 'bg-primary-100'
                )}
              >
                {authResult === true ? (
                  <CheckCircle className="w-10 h-10 text-success-600" />
                ) : authResult === false ? (
                  <XCircle className="w-10 h-10 text-danger-600" />
                ) : (
                  <Key className="w-10 h-10 text-primary-600" />
                )}
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Mifare 密钥认证</h3>
              <p className="text-gray-500">请输入卡片的密钥以进行认证</p>
            </div>

            <div className="space-y-4 max-w-md mx-auto">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  密钥 A (Key A)
                </label>
                <input
                  type="password"
                  value={keyA}
                  onChange={(e) => setKeyA(e.target.value.toUpperCase())}
                  placeholder="FFFFFFFFFFFF"
                  maxLength={12}
                  className="input-field font-mono"
                />
                <p className="text-xs text-gray-500 mt-1">默认密钥通常为 FFFFFFFFFFFF</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  密钥 B (Key B) <span className="text-gray-400 font-normal">可选</span>
                </label>
                <input
                  type="password"
                  value={keyB}
                  onChange={(e) => setKeyB(e.target.value.toUpperCase())}
                  placeholder="FFFFFFFFFFFF"
                  maxLength={12}
                  className="input-field font-mono"
                />
              </div>
            </div>

            {authResult === true && (
              <div className="p-4 rounded-lg bg-success-50 border border-success-200 text-success-700 text-center">
                <CheckCircle className="w-5 h-5 inline mr-2" />
                密钥认证成功！即将进入下一步...
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <button onClick={() => setStep('info')} className="btn-secondary">
                上一步
              </button>
              <button
                onClick={handleAuthenticate}
                disabled={authLoading || authResult === true}
                className={clsx(
                  'btn-primary',
                  (authLoading || authResult === true) && 'opacity-50 cursor-not-allowed'
                )}
              >
                {authLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    认证中...
                  </span>
                ) : (
                  '开始认证'
                )}
              </button>
            </div>
          </div>
        )}

        {step === 'write' && (
          <div className="space-y-6">
            <div className="text-center py-4">
              <div
                className={clsx(
                  'w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center transition-all relative',
                  writeResult === true
                    ? 'bg-success-100'
                    : writeResult === false
                    ? 'bg-danger-100'
                    : 'bg-primary-100'
                )}
              >
                {writeResult === true ? (
                  <CheckCircle className="w-10 h-10 text-success-600" />
                ) : writeResult === false ? (
                  <XCircle className="w-10 h-10 text-danger-600" />
                ) : writeLoading ? (
                  <Loader2 className="w-10 h-10 text-primary-600 animate-spin" />
                ) : (
                  <Wifi className="w-10 h-10 text-primary-600" />
                )}
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">写入PN532设备</h3>
              <p className="text-gray-500">将卡片信息写入PN532读卡器模拟卡</p>
            </div>

            <div className="p-4 rounded-lg bg-gray-50 max-w-md mx-auto">
              <h4 className="text-sm font-medium text-gray-700 mb-3">待写入信息</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">UID:</span>
                  <span className="font-mono text-gray-800">{cardData?.uid}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">使用人:</span>
                  <span className="text-gray-800">{userName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">权限组:</span>
                  <span className="text-gray-800">
                    {permissionGroups.find((g) => g.id === permissionGroupId)?.name}
                  </span>
                </div>
              </div>
            </div>

            {writeResult === true && (
              <div className="p-4 rounded-lg bg-success-50 border border-success-200 text-success-700 text-center">
                <CheckCircle className="w-5 h-5 inline mr-2" />
                写入成功！正在同步到服务端...
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <button onClick={() => setStep('auth')} className="btn-secondary">
                上一步
              </button>
              <button
                onClick={handleWriteCard}
                disabled={writeLoading || writeResult === true}
                className={clsx(
                  'btn-primary',
                  (writeLoading || writeResult === true) && 'opacity-50 cursor-not-allowed'
                )}
              >
                {writeLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    写入中...
                  </span>
                ) : (
                  '开始写入'
                )}
              </button>
            </div>
          </div>
        )}

        {step === 'complete' && (
          <div className="text-center py-12 space-y-6">
            <div className="w-24 h-24 rounded-full bg-success-100 mx-auto flex items-center justify-center">
              <CheckCircle className="w-12 h-12 text-success-600" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">卡片注册成功！</h3>
              <p className="text-gray-500">卡片已成功注册并写入PN532设备</p>
            </div>
            <div className="p-4 rounded-lg bg-gray-50 max-w-md mx-auto text-left">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">UID:</span>
                  <span className="font-mono text-primary-600">{cardData?.uid}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">使用人:</span>
                  <span className="text-gray-800">{userName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">卡片类型:</span>
                  <span className="text-gray-800">{currentCardType}</span>
                </div>
              </div>
            </div>
            <div className="flex justify-center gap-3 pt-4">
              <button
                onClick={() => {
                  setStep('read');
                  setCardData(null);
                  setUserName('');
                  setDescription('');
                  setKeyA('FFFFFFFFFFFF');
                  setKeyB('');
                  setAuthResult(null);
                  setWriteResult(null);
                  setError('');
                }}
                className="btn-secondary"
              >
                继续注册
              </button>
              <button onClick={handleComplete} className="btn-primary">
                返回列表
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
