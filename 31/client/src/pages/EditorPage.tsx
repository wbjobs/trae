import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as Y from 'yjs';
import { useStore } from '../store/useStore';
import { socketManager } from '../utils/socket';
import { parseABC } from '../utils/abcParser';
import { SheetRenderer } from '../utils/sheetRenderer';
import { midiPlayer } from '../utils/midiPlayer';
import { User, CursorPosition, ChatMessage, FrozenRange } from '../types';

export default function EditorPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<SheetRenderer | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const ytextRef = useRef<Y.Text | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | null>(null);
  
  const {
    userName,
    currentUser,
    users,
    cursors,
    viewMode,
    isPlaying,
    showChat,
    chatMessages,
    playPosition,
    frozenRanges,
    selectionStart,
    selectionEnd,
    isSelecting,
    setCurrentUser,
    setUsers,
    addUser,
    removeUser,
    setYDoc,
    setYText,
    updateCursor,
    removeCursor,
    toggleViewMode,
    setIsPlaying,
    setShowChat,
    addChatMessage,
    setPlayPosition,
    addFrozenRange,
    removeFrozenRange,
    setFrozenRanges,
    setSelectionStart,
    setSelectionEnd,
    setIsSelecting,
    clearSelection,
    reset,
  } = useStore();

  const [connected, setConnected] = useState(false);
  const [content, setContent] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [showABCReference, setShowABCReference] = useState(false);

  useEffect(() => {
    if (!roomId || !userName) {
      navigate('/');
      return;
    }

    socketManager.connect();

    const ydoc = new Y.Doc();
    const ytext = ydoc.getText('sheet');
    ydocRef.current = ydoc;
    ytextRef.current = ytext;
    setYDoc(ydoc);
    setYText(ytext);

    ytext.observe(() => {
      const newContent = ytext.toString();
      setContent(newContent);
    });

    const onConnected = () => {
      setConnected(true);
      socketManager.joinRoom(roomId!, userName, ydoc);
    };

    const onUserJoined = (data: { 
      user: User; 
      users: User[]; 
      yjsState?: Uint8Array; 
      cursorStates?: CursorPosition[];
      frozenRanges?: FrozenRange[];
    }) => {
      if (data.user.id === socketManager.getSocketId()) {
        setCurrentUser(data.user);
        if (data.cursorStates && rendererRef.current) {
          data.cursorStates.forEach(pos => {
            const user = data.users.find(u => u.id === pos.userId);
            if (user) {
              updateCursor(pos.userId, pos);
              rendererRef.current?.updateCursor(
                pos.userId,
                pos.x,
                pos.y,
                user.color,
                user.name
              );
            }
          });
        }
        if (data.frozenRanges) {
          setFrozenRanges(data.frozenRanges);
          rendererRef.current?.setFrozenRanges(data.frozenRanges);
        }
      } else {
        addUser(data.user);
      }
      setUsers(data.users);
    };

    const onUserLeft = (data: { userId: string; users: User[] }) => {
      removeUser(data.userId);
      removeCursor(data.userId);
      setUsers(data.users);
    };

    const onCursorMove = (position: CursorPosition) => {
      updateCursor(position.userId, position);
      const user = users.find(u => u.id === position.userId);
      if (user && rendererRef.current) {
        rendererRef.current.updateCursor(
          position.userId,
          position.x,
          position.y,
          user.color,
          user.name
        );
      }
    };

    const onChatMessage = (msg: ChatMessage) => {
      addChatMessage(msg);
    };

    const onVersionSaved = () => {
      console.log('Version saved');
    };

    const onError = (err: any) => {
      console.error('Socket error:', err);
    };

    const onCursorRejected = (data: { received: CursorPosition; resolved: CursorPosition; reason: string }) => {
      console.log('Cursor rejected, syncing with resolved position:', data);
      updateCursor(data.resolved.userId, data.resolved);
      const user = users.find(u => u.id === data.resolved.userId);
      if (user && rendererRef.current) {
        rendererRef.current.updateCursor(
          data.resolved.userId,
          data.resolved.x,
          data.resolved.y,
          user.color,
          user.name
        );
      }
    };

    const onFreezeSuccess = (data: { range: FrozenRange }) => {
      addFrozenRange(data.range);
      rendererRef.current?.addFrozenRange(data.range);
      clearSelection();
      alert('冻结成功！只有您可以解锁此区域。');
    };

    const onFreezeError = (data: { error: string }) => {
      alert(`冻结失败: ${data.error}`);
    };

    const onUnfreezeSuccess = (data: { rangeId: string }) => {
      removeFrozenRange(data.rangeId);
      rendererRef.current?.removeFrozenRange(data.rangeId);
    };

    const onUnfreezeError = (data: { error: string }) => {
      alert(`解锁失败: ${data.error}`);
    };

    const onRangeFrozen = (data: { range: FrozenRange }) => {
      addFrozenRange(data.range);
      rendererRef.current?.addFrozenRange(data.range);
    };

    const onRangeUnfrozen = (data: { rangeId: string }) => {
      removeFrozenRange(data.rangeId);
      rendererRef.current?.removeFrozenRange(data.rangeId);
    };

    socketManager.on('connected', onConnected);
    socketManager.on('user-joined', onUserJoined);
    socketManager.on('user-left', onUserLeft);
    socketManager.on('cursor-move', onCursorMove);
    socketManager.on('cursor-rejected', onCursorRejected);
    socketManager.on('chat-message', onChatMessage);
    socketManager.on('version-saved', onVersionSaved);
    socketManager.on('error', onError);
    socketManager.on('freeze-success', onFreezeSuccess);
    socketManager.on('freeze-error', onFreezeError);
    socketManager.on('unfreeze-success', onUnfreezeSuccess);
    socketManager.on('unfreeze-error', onUnfreezeError);
    socketManager.on('range-frozen', onRangeFrozen);
    socketManager.on('range-unfrozen', onRangeUnfrozen);

    return () => {
      socketManager.off('connected', onConnected);
      socketManager.off('user-joined', onUserJoined);
      socketManager.off('user-left', onUserLeft);
      socketManager.off('cursor-move', onCursorMove);
      socketManager.off('cursor-rejected', onCursorRejected);
      socketManager.off('chat-message', onChatMessage);
      socketManager.off('version-saved', onVersionSaved);
      socketManager.off('error', onError);
      socketManager.off('freeze-success', onFreezeSuccess);
      socketManager.off('freeze-error', onFreezeError);
      socketManager.off('unfreeze-success', onUnfreezeSuccess);
      socketManager.off('unfreeze-error', onUnfreezeError);
      socketManager.off('range-frozen', onRangeFrozen);
      socketManager.off('range-unfrozen', onRangeUnfrozen);
      socketManager.leaveRoom();
      ydoc.destroy();
      rendererRef.current?.destroy();
      midiPlayer.stop();
      reset();
    };
  }, [roomId, userName, navigate]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const renderer = new SheetRenderer(canvasRef.current);
    rendererRef.current = renderer;
    renderer.setViewMode(viewMode);

    return () => {
      renderer.destroy();
    };
  }, []);

  useEffect(() => {
    if (rendererRef.current && content) {
      const parsed = parseABC(content);
      rendererRef.current.setParsedABC(parsed);
    }
  }, [content]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setViewMode(viewMode);
    }
  }, [viewMode]);

  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setContent(newValue);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(() => {
      if (ytextRef.current) {
        ytextRef.current.delete(0, ytextRef.current.length);
        ytextRef.current.insert(0, newValue);
      }
    }, 100);
  }, []);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!rendererRef.current || !roomId) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    socketManager.sendCursor({
      x,
      y,
      lineIndex: 0,
      charIndex: 0,
    });

    if (isSelecting && selectionStart) {
      const lineHeight = 120;
      const topMargin = 80;
      const currentLine = Math.max(0, Math.floor((y - topMargin) / lineHeight));
      
      const startLine = Math.min(selectionStart.line, currentLine);
      const endLine = Math.max(selectionStart.line, currentLine);
      
      setSelectionEnd({ line: endLine, bar: 0 });
      rendererRef.current.showSelection(startLine, endLine);
    }
  }, [roomId, isSelecting, selectionStart]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!rendererRef.current) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const y = e.clientY - rect.top;
    const lineHeight = 120;
    const topMargin = 80;
    const lineIndex = Math.max(0, Math.floor((y - topMargin) / lineHeight));

    if (e.shiftKey) {
      setIsSelecting(true);
      setSelectionStart({ line: lineIndex, bar: 0 });
      setSelectionEnd({ line: lineIndex, bar: 0 });
      rendererRef.current.showSelection(lineIndex, lineIndex);
    }
  }, []);

  const handleCanvasMouseUp = useCallback(() => {
    if (isSelecting) {
      setIsSelecting(false);
    }
  }, [isSelecting]);

  const handleFreeze = useCallback(() => {
    if (!selectionStart || !selectionEnd) {
      alert('请先按住Shift键并拖动鼠标选择要冻结的行');
      return;
    }

    const startLine = Math.min(selectionStart.line, selectionEnd.line);
    const endLine = Math.max(selectionStart.line, selectionEnd.line);

    socketManager.freezeRange({
      startLine,
      startBar: 0,
      endLine,
      endBar: 0,
    });
  }, [selectionStart, selectionEnd]);

  const handleUnfreeze = useCallback((rangeId: string) => {
    socketManager.unfreezeRange(rangeId);
  }, []);

  const handleClearSelection = useCallback(() => {
    clearSelection();
    rendererRef.current?.clearSelection();
  }, [clearSelection]);

  const handlePlay = async () => {
    if (!content) return;
    
    const parsed = parseABC(content);
    const allNotes = parsed.notes.flat();
    
    if (allNotes.length === 0) return;

    midiPlayer.setTempo(parsed.header.tempo || 120);
    setIsPlaying(true);
    
    await midiPlayer.playNotes(allNotes, (index) => {
      setPlayPosition(index);
      let total = 0;
      for (let i = 0; i < parsed.notes.length; i++) {
        if (index < total + parsed.notes[i].length) {
          const noteIdx = index - total;
          rendererRef.current?.highlightNote(i, noteIdx);
          break;
        }
        total += parsed.notes[i].length;
      }
    });

    setIsPlaying(false);
    setPlayPosition(-1);
    rendererRef.current?.clearHighlight();
  };

  const handleStop = () => {
    midiPlayer.stop();
    setIsPlaying(false);
    setPlayPosition(-1);
    rendererRef.current?.clearHighlight();
  };

  const handleSave = () => {
    if (currentUser) {
      socketManager.saveVersion(currentUser.id);
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    const message = chatInputRef.current?.value.trim();
    if (!message || !userName) return;
    
    socketManager.sendChatMessage(message, userName);
    if (chatInputRef.current) {
      chatInputRef.current.value = '';
    }
  };

  const loadHistory = async () => {
    try {
      const response = await fetch(`/api/rooms/${roomId}/history`);
      const data = await response.json();
      setHistory(data);
      setShowHistory(true);
    } catch (e) {
      console.error('Failed to load history:', e);
    }
  };

  const copyRoomId = () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId);
      alert('房间ID已复制到剪贴板');
    }
  };

  const abcQuickReference = [
    { symbol: 'T:', desc: '标题' },
    { symbol: 'C:', desc: '作曲家' },
    { symbol: 'K:', desc: '调号 (如 C, G, Dm)' },
    { symbol: 'M:', desc: '拍号 (如 4/4, 3/4)' },
    { symbol: 'Q:', desc: '速度 (如 120)' },
    { symbol: 'C D E F', desc: '四分音符' },
    { symbol: 'c d e f', desc: '高八度音符' },
    { symbol: 'C, D,', desc: '低八度音符' },
    { symbol: 'C2 D2', desc: '二分音符' },
    { symbol: 'C/2 D/2', desc: '八分音符' },
    { symbol: 'z', desc: '休止符' },
    { symbol: '|', desc: '小节线' },
  ];

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <button style={styles.backButton} onClick={() => navigate('/')}>
            ← 返回
          </button>
          <h1 style={styles.title}>🎵 协同乐谱编辑器</h1>
        </div>
        
        <div style={styles.headerRight}>
          <div style={styles.roomInfo} onClick={copyRoomId} title="点击复制房间ID">
            房间: {roomId}
          </div>
          <div style={styles.userBadge}>
            <span style={styles.userDot} />
            {userName}
          </div>
        </div>
      </div>

      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          <button 
            style={styles.toolButton}
            onClick={toggleViewMode}
          >
            {viewMode === 'staff' ? '🎼 五线谱' : '🎵 简谱'}
          </button>
          <button 
            style={styles.toolButton}
            onClick={isPlaying ? handleStop : handlePlay}
          >
            {isPlaying ? '⏹ 停止' : '▶ 播放'}
          </button>
          <button style={styles.toolButton} onClick={handleSave}>
            💾 保存版本
          </button>
          <button style={styles.toolButton} onClick={loadHistory}>
            📜 历史记录
          </button>
          <button style={styles.toolButton} onClick={() => setShowABCReference(!showABCReference)}>
            📖 ABC参考
          </button>
          <button 
            style={{...styles.toolButton, background: selectionStart ? '#27ae60' : '#f0f0f0'}}
            onClick={handleFreeze}
            title="按住Shift键拖动鼠标选择要冻结的行"
          >
            🔒 冻结选中区域
          </button>
          {selectionStart && (
            <button style={styles.toolButton} onClick={handleClearSelection}>
              ❌ 取消选择
            </button>
          )}
        </div>
        
        <div style={styles.toolbarRight}>
          <div style={styles.usersContainer}>
            {users.map((user) => (
              <div 
                key={user.id} 
                style={{
                  ...styles.userAvatar,
                  backgroundColor: user.color,
                }}
                title={user.name}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
            ))}
          </div>
          <button 
            style={styles.toolButton}
            onClick={() => setShowChat(!showChat)}
          >
            💬 {showChat ? '关闭聊天' : '聊天'}
          </button>
        </div>
      </div>

      <div style={styles.mainContent}>
        <div style={styles.editorPanel}>
          <div style={styles.panelHeader}>
            <span style={styles.panelTitle}>ABC记谱法</span>
          </div>
          <textarea
            ref={textareaRef}
            style={styles.textarea}
            value={content}
            onChange={handleContentChange}
            placeholder="在这里输入ABC记谱法..."
            spellCheck={false}
          />
          
          {showABCReference && (
            <div style={styles.referencePanel}>
              <h4 style={styles.referenceTitle}>ABC记谱法快速参考</h4>
              <div style={styles.referenceGrid}>
                {abcQuickReference.map((item, i) => (
                  <div key={i} style={styles.referenceItem}>
                    <code style={styles.referenceCode}>{item.symbol}</code>
                    <span style={styles.referenceDesc}>{item.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={styles.canvasPanel}>
          <div style={styles.panelHeader}>
            <span style={styles.panelTitle}>
              {viewMode === 'staff' ? '五线谱视图' : '简谱视图'}
            </span>
            {!connected && <span style={styles.statusBadge}>连接中...</span>}
            {connected && <span style={{...styles.statusBadge, background: '#27ae60'}}>已连接</span>}
          </div>
          <div 
            style={styles.canvasContainer}
            onMouseMove={handleCanvasMouseMove}
            onMouseDown={handleCanvasMouseDown}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
          >
            <canvas ref={canvasRef} />
          </div>
          
          {frozenRanges.length > 0 && (
            <div style={styles.frozenPanel}>
              <div style={styles.panelHeader}>
                <span style={styles.panelTitle}>🔒 已冻结区域</span>
              </div>
              <div style={styles.frozenList}>
                {frozenRanges.map((range) => (
                  <div key={range.id} style={styles.frozenItem}>
                    <div style={styles.frozenInfo}>
                      <span style={styles.frozenRangeText}>
                        第 {range.startLine + 1} - {range.endLine + 1} 行
                      </span>
                      <span style={styles.frozenBy}>
                        锁定者: {range.lockedByName}
                      </span>
                    </div>
                    {currentUser && range.lockedBy === currentUser.id && (
                      <button 
                        style={styles.unfreezeButton}
                        onClick={() => handleUnfreeze(range.id)}
                      >
                        解锁
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {showChat && (
          <div style={styles.chatPanel}>
            <div style={styles.panelHeader}>
              <span style={styles.panelTitle}>聊天室</span>
              <button 
                style={styles.closeButton}
                onClick={() => setShowChat(false)}
              >
                ×
              </button>
            </div>
            <div style={styles.chatMessages}>
              {chatMessages.map((msg, i) => (
                <div key={i} style={styles.chatMessage}>
                  <span style={styles.chatUser}>{msg.userName}:</span>
                  <span style={styles.chatText}>{msg.message}</span>
                </div>
              ))}
            </div>
            <form onSubmit={handleSendChat} style={styles.chatInputContainer}>
              <input
                ref={chatInputRef}
                style={styles.chatInput}
                placeholder="输入消息..."
              />
              <button type="submit" style={styles.sendButton}>
                发送
              </button>
            </form>
          </div>
        )}
      </div>

      {showHistory && (
        <div style={styles.modalOverlay} onClick={() => setShowHistory(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3>版本历史</h3>
              <button style={styles.closeButton} onClick={() => setShowHistory(false)}>
                ×
              </button>
            </div>
            <div style={styles.modalContent}>
              {history.length === 0 ? (
                <p style={styles.emptyText}>暂无历史记录</p>
              ) : (
                history.map((item: any, i: number) => (
                  <div key={i} style={styles.historyItem}>
                    <div style={styles.historyInfo}>
                      <span style={styles.historyDate}>
                        {new Date(item.created_at).toLocaleString()}
                      </span>
                      <span style={styles.historyUser}>
                        保存者: {item.created_by}
                      </span>
                    </div>
                    <div style={styles.historyPreview}>
                      {item.content.substring(0, 100)}...
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    background: '#f0f2f5',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 24px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  backButton: {
    background: 'rgba(255,255,255,0.2)',
    color: 'white',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  title: {
    fontSize: '20px',
    fontWeight: '600',
    margin: 0,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  roomInfo: {
    background: 'rgba(255,255,255,0.2)',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '13px',
    cursor: 'pointer',
    fontFamily: 'monospace',
  },
  userBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'rgba(255,255,255,0.2)',
    padding: '6px 12px',
    borderRadius: '20px',
    fontSize: '14px',
  },
  userDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#2ecc71',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 24px',
    background: 'white',
    borderBottom: '1px solid #e0e0e0',
  },
  toolbarLeft: {
    display: 'flex',
    gap: '8px',
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  toolButton: {
    padding: '8px 16px',
    background: '#f0f0f0',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'background 0.2s',
  },
  usersContainer: {
    display: 'flex',
    gap: '-8px',
  },
  userAvatar: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    fontSize: '14px',
    fontWeight: '600',
    marginLeft: '-8px',
    border: '2px solid white',
  },
  mainContent: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  editorPanel: {
    width: '350px',
    display: 'flex',
    flexDirection: 'column' as const,
    background: 'white',
    borderRight: '1px solid #e0e0e0',
  },
  canvasPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  chatPanel: {
    width: '300px',
    display: 'flex',
    flexDirection: 'column' as const,
    background: 'white',
    borderLeft: '1px solid #e0e0e0',
  },
  panelHeader: {
    padding: '12px 16px',
    background: '#fafafa',
    borderBottom: '1px solid #e0e0e0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  panelTitle: {
    fontWeight: '600',
    color: '#333',
    fontSize: '14px',
  },
  statusBadge: {
    padding: '3px 8px',
    background: '#f39c12',
    color: 'white',
    borderRadius: '4px',
    fontSize: '11px',
  },
  textarea: {
    flex: 1,
    padding: '16px',
    border: 'none',
    outline: 'none',
    resize: 'none',
    fontFamily: 'monospace',
    fontSize: '13px',
    lineHeight: '1.6',
    background: '#fafafa',
  },
  canvasContainer: {
    flex: 1,
    overflow: 'auto',
    background: '#f5f5f5',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '20px',
  },
  referencePanel: {
    borderTop: '1px solid #e0e0e0',
    padding: '12px',
    background: '#fafafa',
  },
  referenceTitle: {
    margin: '0 0 8px 0',
    fontSize: '13px',
    color: '#555',
  },
  referenceGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '6px',
  },
  referenceItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
  },
  referenceCode: {
    background: '#e0e0e0',
    padding: '2px 6px',
    borderRadius: '3px',
    fontFamily: 'monospace',
  },
  referenceDesc: {
    color: '#666',
  },
  chatMessages: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '12px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  chatMessage: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  chatUser: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#667eea',
  },
  chatText: {
    fontSize: '13px',
    color: '#333',
    background: '#f0f2f5',
    padding: '6px 10px',
    borderRadius: '8px',
    maxWidth: '100%',
    wordBreak: 'break-word' as const,
  },
  chatInputContainer: {
    display: 'flex',
    padding: '12px',
    borderTop: '1px solid #e0e0e0',
    gap: '8px',
  },
  chatInput: {
    flex: 1,
    padding: '8px 12px',
    border: '1px solid #e0e0e0',
    borderRadius: '6px',
    outline: 'none',
    fontSize: '13px',
  },
  sendButton: {
    padding: '8px 16px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer',
    color: '#999',
    padding: '0 4px',
  },
  modalOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: 'white',
    borderRadius: '12px',
    width: '500px',
    maxHeight: '70vh',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  modalHeader: {
    padding: '16px 20px',
    borderBottom: '1px solid #e0e0e0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalContent: {
    padding: '16px 20px',
    overflowY: 'auto' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  historyItem: {
    padding: '12px',
    background: '#f8f9fa',
    borderRadius: '8px',
  },
  historyInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '6px',
  },
  historyDate: {
    fontSize: '13px',
    color: '#666',
  },
  historyUser: {
    fontSize: '12px',
    color: '#999',
  },
  historyPreview: {
    fontSize: '12px',
    color: '#555',
    fontFamily: 'monospace',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  emptyText: {
    textAlign: 'center' as const,
    color: '#999',
    padding: '20px',
  },
  frozenPanel: {
    position: 'absolute' as const,
    right: '20px',
    top: '80px',
    width: '200px',
    background: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    zIndex: 10,
  },
  frozenList: {
    padding: '8px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  frozenItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px',
    background: '#f8f9fa',
    borderRadius: '6px',
  },
  frozenInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  frozenRangeText: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#333',
  },
  frozenBy: {
    fontSize: '11px',
    color: '#888',
  },
  unfreezeButton: {
    padding: '4px 10px',
    background: '#e74c3c',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '12px',
    cursor: 'pointer',
  },
};
