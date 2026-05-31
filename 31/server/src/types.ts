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

export interface WebRTCSignal {
  type: 'offer' | 'answer' | 'ice-candidate';
  from: string;
  to: string;
  data: any;
}

export interface RoomState {
  id: string;
  name: string;
  users: Map<string, User>;
  yjsDoc: any;
  cursorStates: Map<string, CursorPosition>;
  maxLamportTime: number;
  frozenRanges: FrozenRange[];
}

export interface SheetNote {
  pitch: string;
  duration: number;
  octave: number;
  accidental?: '#' | 'b' | 'n';
}

export interface ABCHeader {
  title?: string;
  key?: string;
  meter?: string;
  tempo?: number;
  composer?: string;
}
