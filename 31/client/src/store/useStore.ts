import { create } from 'zustand';
import * as Y from 'yjs';
import { User, CursorPosition, ViewMode, ChatMessage, FrozenRange } from '../types';

interface EditorState {
  roomId: string | null;
  userName: string;
  currentUser: User | null;
  users: User[];
  cursors: Map<string, CursorPosition>;
  ydoc: Y.Doc | null;
  ytext: Y.Text | null;
  viewMode: ViewMode;
  isPlaying: boolean;
  showChat: boolean;
  chatMessages: ChatMessage[];
  playPosition: number;
  frozenRanges: FrozenRange[];
  selectionStart: { line: number; bar: number } | null;
  selectionEnd: { line: number; bar: number } | null;
  isSelecting: boolean;
  
  setRoomId: (id: string | null) => void;
  setUserName: (name: string) => void;
  setCurrentUser: (user: User | null) => void;
  setUsers: (users: User[]) => void;
  addUser: (user: User) => void;
  removeUser: (userId: string) => void;
  setYDoc: (doc: Y.Doc | null) => void;
  setYText: (text: Y.Text | null) => void;
  updateCursor: (userId: string, position: CursorPosition) => void;
  removeCursor: (userId: string) => void;
  setViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;
  setIsPlaying: (playing: boolean) => void;
  setShowChat: (show: boolean) => void;
  addChatMessage: (msg: ChatMessage) => void;
  setPlayPosition: (pos: number) => void;
  reset: () => void;
}

export const useStore = create<EditorState>((set) => ({
  roomId: null,
  userName: '',
  currentUser: null,
  users: [],
  cursors: new Map(),
  ydoc: null,
  ytext: null,
  viewMode: 'staff',
  isPlaying: false,
  showChat: false,
  chatMessages: [],
  playPosition: -1,
  frozenRanges: [],
  selectionStart: null,
  selectionEnd: null,
  isSelecting: false,

  setRoomId: (id) => set({ roomId: id }),
  setUserName: (name) => set({ userName: name }),
  setCurrentUser: (user) => set({ currentUser: user }),
  setUsers: (users) => set({ users }),
  addUser: (user) => set((state) => ({ users: [...state.users, user] })),
  removeUser: (userId) => set((state) => ({
    users: state.users.filter(u => u.id !== userId),
    cursors: new Map(Array.from(state.cursors.entries()).filter(([id]) => id !== userId)),
  })),
  setYDoc: (doc) => set({ ydoc: doc }),
  setYText: (text) => set({ ytext: text }),
  updateCursor: (userId, position) => set((state) => {
    const newCursors = new Map(state.cursors);
    newCursors.set(userId, position);
    return { cursors: newCursors };
  }),
  removeCursor: (userId) => set((state) => {
    const newCursors = new Map(state.cursors);
    newCursors.delete(userId);
    return { cursors: newCursors };
  }),
  setViewMode: (mode) => set({ viewMode: mode }),
  toggleViewMode: () => set((state) => ({ viewMode: state.viewMode === 'staff' ? 'jianpu' : 'staff' })),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setShowChat: (show) => set({ showChat: show }),
  addChatMessage: (msg) => set((state) => ({ chatMessages: [...state.chatMessages, msg] })),
  setPlayPosition: (pos) => set({ playPosition: pos }),
  
  addFrozenRange: (range: FrozenRange) => set((state) => ({
    frozenRanges: [...state.frozenRanges, range],
  })),
  removeFrozenRange: (rangeId: string) => set((state) => ({
    frozenRanges: state.frozenRanges.filter(r => r.id !== rangeId),
  })),
  setFrozenRanges: (ranges: FrozenRange[]) => set({ frozenRanges: ranges }),
  
  setSelectionStart: (pos: { line: number; bar: number } | null) => set({ selectionStart: pos }),
  setSelectionEnd: (pos: { line: number; bar: number } | null) => set({ selectionEnd: pos }),
  setIsSelecting: (selecting: boolean) => set({ isSelecting: selecting }),
  clearSelection: () => set({ selectionStart: null, selectionEnd: null, isSelecting: false }),
  
  reset: () => set({
    roomId: null,
    currentUser: null,
    users: [],
    cursors: new Map(),
    ydoc: null,
    ytext: null,
    isPlaying: false,
    chatMessages: [],
    playPosition: -1,
    frozenRanges: [],
    selectionStart: null,
    selectionEnd: null,
    isSelecting: false,
  }),
}));
