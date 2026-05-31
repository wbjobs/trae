import { ParsedABC, ABCHeader, SheetNote } from '../types';

const NOTE_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const JIANPU_MAP: Record<string, string> = {
  'C': '1', 'D': '2', 'E': '3', 'F': '4',
  'G': '5', 'A': '6', 'B': '7',
};

export function parseABC(content: string): ParsedABC {
  const lines = content.split('\n');
  const header: ABCHeader = {};
  const noteLines: SheetNote[][] = [];
  let inHeader = true;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.match(/^[A-Za-z]:/)) {
      inHeader = true;
      const match = trimmed.match(/^([A-Za-z]):\s*(.*)$/);
      if (match) {
        const [, key, value] = match;
        switch (key.toUpperCase()) {
          case 'T': header.title = value; break;
          case 'C': header.composer = value; break;
          case 'K': header.key = value; break;
          case 'M': header.meter = value; break;
          case 'Q': header.tempo = parseInt(value) || 120; break;
          case 'R': header.rhythm = value; break;
        }
      }
    } else {
      inHeader = false;
      const notes = parseNoteLine(trimmed);
      if (notes.length > 0) {
        noteLines.push(notes);
      }
    }
  }

  return { header, notes: noteLines, rawContent: content };
}

function parseNoteLine(line: string): SheetNote[] {
  const notes: SheetNote[] = [];
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (char === '|' || char === ' ' || char === '\t') {
      i++;
      continue;
    }

    if (char === 'z' || char === 'Z') {
      const duration = parseDuration(line, i + 1);
      notes.push({ pitch: 'C', duration: duration.value, octave: 4, isRest: true });
      i += duration.length + 1;
      continue;
    }

    if (char.match(/[A-Ga-g]/)) {
      const noteResult = parseNote(line, i);
      if (noteResult) {
        notes.push(noteResult.note);
        i += noteResult.length;
        continue;
      }
    }

    i++;
  }

  return notes;
}

interface NoteParseResult {
  note: SheetNote;
  length: number;
}

function parseNote(line: string, startIndex: number): NoteParseResult | null {
  let i = startIndex;
  const pitchChar = line[i];
  if (!pitchChar.match(/[A-Ga-g]/)) return null;

  const pitchName = pitchChar.toUpperCase();
  const isUpperCase = pitchChar === pitchName;
  const baseOctave = isUpperCase ? 4 : 5;

  i++;
  let accidental: '#' | 'b' | 'n' | undefined;

  if (line[i] === '^' || line[i] === '#') {
    accidental = '#';
    i++;
  } else if (line[i] === '_' || line[i] === 'b') {
    accidental = 'b';
    i++;
  } else if (line[i] === '=') {
    accidental = 'n';
    i++;
  }

  let octaveModifier = 0;
  while (line[i] === "'") {
    octaveModifier++;
    i++;
  }
  while (line[i] === ',') {
    octaveModifier--;
    i++;
  }

  const durationResult = parseDuration(line, i);
  let duration = durationResult.value;

  let dot = false;
  if (line[i + durationResult.length] === '>') {
    duration *= 1.5;
    dot = true;
    durationResult.length++;
  }

  const octave = baseOctave + octaveModifier;

  return {
    note: {
      pitch: pitchName,
      duration,
      octave,
      accidental,
      dot,
    },
    length: (i - startIndex) + durationResult.length,
  };
}

function parseDuration(line: string, startIndex: number): { value: number; length: number } {
  let numStr = '';
  let i = startIndex;

  while (i < line.length && line[i].match(/[0-9]/)) {
    numStr += line[i];
    i++;
  }

  if (i < line.length && line[i] === '/') {
    numStr += line[i];
    i++;
    while (i < line.length && line[i].match(/[0-9]/)) {
      numStr += line[i];
      i++;
    }
  }

  if (!numStr) {
    return { value: 1, length: 0 };
  }

  if (numStr.includes('/')) {
    const [num, den] = numStr.split('/');
    return { value: parseInt(num) / parseInt(den || '2'), length: numStr.length };
  }

  return { value: parseInt(numStr), length: numStr.length };
}

export function noteToMidi(note: SheetNote): number {
  const baseNotes: Record<string, number> = {
    'C': 0, 'D': 2, 'E': 4, 'F': 5,
    'G': 7, 'A': 9, 'B': 11,
  };

  let midi = (note.octave + 1) * 12 + baseNotes[note.pitch];
  
  if (note.accidental === '#') midi++;
  if (note.accidental === 'b') midi--;

  return midi;
}

export function noteToJianpu(note: SheetNote): string {
  if (note.isRest) return '0';
  
  let jianpu = JIANPU_MAP[note.pitch] || note.pitch;
  
  if (note.accidental === '#') {
    jianpu = '#' + jianpu;
  } else if (note.accidental === 'b') {
    jianpu = 'b' + jianpu;
  }

  return jianpu;
}

export function getOctaveDots(note: SheetNote): { above: number; below: number } {
  if (note.isRest) return { above: 0, below: 0 };
  
  const diff = note.octave - 5;
  if (diff > 0) return { above: diff, below: 0 };
  if (diff < 0) return { above: 0, below: Math.abs(diff) };
  return { above: 0, below: 0 };
}

export function getStaffPosition(note: SheetNote): number {
  const staffPositions: Record<string, number> = {
    'C': 0, 'D': 1, 'E': 2, 'F': 3,
    'G': 4, 'A': 5, 'B': 6,
  };

  const basePos = staffPositions[note.pitch];
  const octaveOffset = (note.octave - 4) * 7;
  
  return basePos + octaveOffset;
}
