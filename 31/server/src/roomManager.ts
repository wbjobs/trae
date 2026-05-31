import * as Y from 'yjs';
import { User, RoomState, CursorPosition, FrozenRange } from './types.js';
import { getLatestVersion, saveVersion } from './db.js';

const rooms = new Map<string, RoomState>();

export async function getOrCreateRoom(roomId: string, roomName: string = 'Untitled'): Promise<RoomState> {
  let room = rooms.get(roomId);
  
  if (!room) {
    const ydoc = new Y.Doc();
    
    const latestVersion = await getLatestVersion(roomId);
    if (latestVersion && latestVersion.yjs_state) {
      try {
        Y.applyUpdate(ydoc, latestVersion.yjs_state);
      } catch (e) {
        console.error('Failed to restore Yjs state:', e);
        const sheetText = ydoc.getText('sheet');
        sheetText.insert(0, latestVersion.content || 'T:Untitled\nK:C\nC D E F | G A B c\n');
      }
    } else {
      const sheetText = ydoc.getText('sheet');
      if (sheetText.length === 0) {
        sheetText.insert(0, `T:${roomName}\nK:C\nC D E F | G A B c |\nc B A G | F E D C |\n`);
      }
    }

    room = {
      id: roomId,
      name: roomName,
      users: new Map(),
      yjsDoc: ydoc,
      cursorStates: new Map(),
      maxLamportTime: 0,
      frozenRanges: [],
    };

    rooms.set(roomId, room);
  }

  return room;
}

export function getRoom(roomId: string): RoomState | undefined {
  return rooms.get(roomId);
}

export function addUserToRoom(roomId: string, user: User) {
  const room = rooms.get(roomId);
  if (room) {
    room.users.set(user.id, user);
  }
}

export function removeUserFromRoom(roomId: string, userId: string) {
  const room = rooms.get(roomId);
  if (room) {
    room.users.delete(userId);
    room.cursorStates.delete(userId);
    
    if (room.users.size === 0) {
      setTimeout(async () => {
        const currentRoom = rooms.get(roomId);
        if (currentRoom && currentRoom.users.size === 0) {
          const state = Y.encodeStateAsUpdate(currentRoom.yjsDoc);
          const content = currentRoom.yjsDoc.getText('sheet').toString();
          await saveVersion(roomId, content, Buffer.from(state), userId);
          rooms.delete(roomId);
          console.log(`Room ${roomId} cleaned up');
        }
      }, 60000);
    }
  }
}

export function updateCursor(
  roomId: string,
  position: CursorPosition
): { shouldBroadcast: boolean; resolvedPosition: CursorPosition } {
  const room = rooms.get(roomId);
  if (!room) {
    return { shouldBroadcast: false, resolvedPosition: position };
  }

  const { userId, lamportTime } = position;
  const existing = room.cursorStates.get(userId);

  if (lamportTime > room.maxLamportTime) {
    room.maxLamportTime = lamportTime;
  }

  if (!existing) {
    room.cursorStates.set(userId, position);
    return { shouldBroadcast: true, resolvedPosition: position };
  }

  if (lamportTime > existing.lamportTime) {
    room.cursorStates.set(userId, position);
    return { shouldBroadcast: true, resolvedPosition: position };
  } else if (lamportTime === existing.lamportTime) {
    if (userId > existing.userId) {
      room.cursorStates.set(userId, position);
      return { shouldBroadcast: true, resolvedPosition: position };
    } else {
      return { shouldBroadcast: false, resolvedPosition: existing };
    }
  } else {
    return { shouldBroadcast: false, resolvedPosition: existing };
  }
}

export function getCursorState(roomId: string, userId: string): CursorPosition | undefined {
  const room = rooms.get(roomId);
  return room?.cursorStates.get(userId);
}

export function getAllCursorStates(roomId: string): CursorPosition[] {
  const room = rooms.get(roomId);
  return room ? Array.from(room.cursorStates.values()) : [];
}

export function getRoomUsers(roomId: string): User[] {
  const room = rooms.get(roomId);
  return room ? Array.from(room.users.values()) : [];
}

export async function saveRoomState(roomId: string, userId: string) {
  const room = rooms.get(roomId);
  if (room) {
    const state = Y.encodeStateAsUpdate(room.yjsDoc);
    const content = room.yjsDoc.getText('sheet').toString();
    await saveVersion(roomId, content, Buffer.from(state), userId);
  }
}

export function addFrozenRange(
  roomId: string,
  range: Omit<FrozenRange, 'id' | 'lockedAt'
): { success: boolean; range?: FrozenRange; error?: string } {
  const room = rooms.get(roomId);
  if (!room) {
    return { success: false, error: 'Room not found' };
  }

  const overlaps = room.frozenRanges.some(r => 
    (range.startLine <= r.endLine && range.endLine >= r.startLine)
  );

  if (overlaps) {
    return { success: false, error: 'Range overlaps with existing frozen range' };
  }

  const newRange: FrozenRange = {
    ...range,
    id: `frozen-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    lockedAt: Date.now(),
  };

  room.frozenRanges.push(newRange);
  return { success: true, range: newRange };
}

export function removeFrozenRange(
  roomId: string,
  rangeId: string,
  userId: string
): { success: boolean; error?: string } {
  const room = rooms.get(roomId);
  if (!room) {
    return { success: false, error: 'Room not found' };
  }

  const rangeIndex = room.frozenRanges.findIndex(r => r.id === rangeId);
  if (rangeIndex === -1) {
    return { success: false, error: 'Frozen range not found' };
  }

  const range = room.frozenRanges[rangeIndex];
  if (range.lockedBy !== userId) {
    return { success: false, error: 'Only the locker can unlock this range' };
  }

  room.frozenRanges.splice(rangeIndex, 1);
  return { success: true };
}

export function getFrozenRanges(roomId: string): FrozenRange[] {
  const room = rooms.get(roomId);
  return room ? [...room.frozenRanges : [];
}

export function isRangeFrozen(
  roomId: string, lineIndex: number, barIndex: number
): { frozen: boolean; range?: FrozenRange } {
  const room = rooms.get(roomId);
  if (!room) {
    return { frozen: false };
  }

  const range = room.frozenRanges.find(r => 
    lineIndex >= r.startLine && lineIndex <= r.endLine
  );

  if (range) {
    return { frozen: true, range };
  }

  return { frozen: false };
}

export function canEditRange(
  roomId: string, lineIndex: number, barIndex: number, userId: string): boolean {
  const { frozen, range } = isRangeFrozen(roomId, lineIndex, barIndex);
  if (!frozen) return true;
  return range ? range.lockedBy === userId;
  return true;
}
