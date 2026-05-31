export interface User {
  id: string;
  name: string;
  color: string;
  roomId: string;
}

export interface CursorPosition {
  userId: string;
  x: number;
  y: number;
  lineIndex: number;
  charIndex: number;
  lamportTime: number;
}

export interface FrozenRange {
  id: string;
  startLine: number;
  startBar: number;
  endLine: number;
  endBar: number;
  lockedBy: string;
  lockedByName: string;
  lockedAt: number;
}

export interface SheetNote {
  pitch: string;
  duration: number;
  octave: number;
  accidental?: '#' | 'b' | 'n';
  isRest?: boolean;
  dot?: boolean;
}

export interface ABCHeader {
  title?: string;
  key?: string;
  meter?: string;
  tempo?: number;
  composer?: string;
  rhythm?: string;
}

export interface ParsedABC {
  header: ABCHeader;
  notes: SheetNote[][];
  rawContent: string;
}

export type ViewMode = 'staff' | 'jianpu';

export interface WebRTCSignal {
  type: 'offer' | 'answer' | 'ice-candidate';
  from: string;
  to: string;
  data: any;
}

export interface ChatMessage {
  userId: string;
  userName: string;
  message: string;
  timestamp: number;
}

export interface VersionHistory {
  id: number;
  content: string;
  created_at: string;
  created_by: string;
}
