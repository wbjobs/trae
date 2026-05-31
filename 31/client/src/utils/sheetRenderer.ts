import { fabric } from 'fabric';
import { SheetNote, ParsedABC, ViewMode, FrozenRange } from '../types';
import { getStaffPosition, noteToJianpu, getOctaveDots } from './abcParser';

const STAFF_LINE_SPACING = 10;
const NOTE_WIDTH = 30;
const NOTE_HEIGHT = 20;
const LINE_HEIGHT = 120;
const LEFT_MARGIN = 60;
const TOP_MARGIN = 80;
const NOTES_PER_LINE = 12;

export class SheetRenderer {
  private canvas: fabric.Canvas;
  private parsedABC: ParsedABC | null = null;
  private viewMode: ViewMode = 'staff';
  private noteObjects: fabric.Object[][] = [];
  private highlightedNoteIndex: number = -1;
  private cursorObjects: Map<string, fabric.Object> = new Map();
  private frozenRanges: FrozenRange[] = [];
  private frozenOverlayObjects: fabric.Object[] = [];
  private selectionOverlay: fabric.Object | null = null;

  constructor(canvasElement: HTMLCanvasElement) {
    this.canvas = new fabric.Canvas(canvasElement, {
      width: 1200,
      height: 800,
      backgroundColor: '#fafafa',
      selection: false,
    });
  }

  setViewMode(mode: ViewMode) {
    this.viewMode = mode;
    this.render();
  }

  setParsedABC(parsed: ParsedABC) {
    this.parsedABC = parsed;
    this.render();
  }

  setFrozenRanges(ranges: FrozenRange[]) {
    this.frozenRanges = ranges;
    this.renderFrozenOverlays();
  }

  addFrozenRange(range: FrozenRange) {
    this.frozenRanges.push(range);
    this.renderFrozenOverlays();
  }

  removeFrozenRange(rangeId: string) {
    this.frozenRanges = this.frozenRanges.filter(r => r.id !== rangeId);
    this.renderFrozenOverlays();
  }

  highlightNote(lineIndex: number, noteIndex: number) {
    this.clearHighlight();
    if (this.noteObjects[lineIndex] && this.noteObjects[lineIndex][noteIndex]) {
      const noteObj = this.noteObjects[lineIndex][noteIndex];
      noteObj.set('fill', '#ff6b6b');
      this.highlightedNoteIndex = noteIndex;
      this.canvas.renderAll();
    }
  }

  clearHighlight() {
    for (const line of this.noteObjects) {
      for (const note of line) {
        note.set('fill', '#333');
      }
    }
    this.highlightedNoteIndex = -1;
    this.canvas.renderAll();
  }

  updateCursor(userId: string, x: number, y: number, color: string, name: string) {
    this.removeCursor(userId);
    
    const cursorGroup = new fabric.Group([
      new fabric.Line([x, y - 30, x, y + 10], {
        stroke: color,
        strokeWidth: 2,
        selectable: false,
      }),
      new fabric.Text(name, {
        left: x + 5,
        top: y - 45,
        fontSize: 12,
        fill: color,
        selectable: false,
      }),
    ], {
      selectable: false,
      evented: false,
    });

    this.canvas.add(cursorGroup);
    this.cursorObjects.set(userId, cursorGroup);
    this.canvas.renderAll();
  }

  removeCursor(userId: string) {
    const cursor = this.cursorObjects.get(userId);
    if (cursor) {
      this.canvas.remove(cursor);
      this.cursorObjects.delete(userId);
      this.canvas.renderAll();
    }
  }

  showSelection(startLine: number, endLine: number) {
    this.clearSelection();
    
    if (!this.parsedABC) return;

    const y1 = TOP_MARGIN + startLine * LINE_HEIGHT - 10;
    const y2 = TOP_MARGIN + (endLine + 1) * LINE_HEIGHT - 20;
    const height = y2 - y1;

    const rect = new fabric.Rect({
      left: LEFT_MARGIN + 40,
      top: y1,
      width: 1020,
      height: height,
      fill: 'rgba(102, 126, 234, 0.15)',
      stroke: '#667eea',
      strokeWidth: 2,
      strokeDashArray: [5, 5],
      selectable: false,
      evented: false,
    });

    this.canvas.add(rect);
    this.selectionOverlay = rect;
    this.canvas.renderAll();
  }

  clearSelection() {
    if (this.selectionOverlay) {
      this.canvas.remove(this.selectionOverlay);
      this.selectionOverlay = null;
      this.canvas.renderAll();
    }
  }

  private renderFrozenOverlays() {
    this.frozenOverlayObjects.forEach(obj => this.canvas.remove(obj));
    this.frozenOverlayObjects = [];

    if (!this.parsedABC) return;

    this.frozenRanges.forEach(range => {
      const y1 = TOP_MARGIN + range.startLine * LINE_HEIGHT - 10;
      const y2 = TOP_MARGIN + (range.endLine + 1) * LINE_HEIGHT - 20;
      const height = y2 - y1;

      const overlay = new fabric.Group([
        new fabric.Rect({
          left: LEFT_MARGIN + 40,
          top: y1,
          width: 1020,
          height: height,
          fill: 'rgba(128, 128, 128, 0.2)',
          stroke: '#888',
          strokeWidth: 1,
          selectable: false,
          evented: false,
        }),
        new fabric.Text(`🔒 ${range.lockedByName}`, {
          left: LEFT_MARGIN + 50,
          top: y1 + 5,
          fontSize: 12,
          fill: '#666',
          selectable: false,
          evented: false,
        }),
      ], {
        selectable: false,
        evented: false,
      });

      this.canvas.add(overlay);
      this.frozenOverlayObjects.push(overlay);
    });

    this.canvas.renderAll();
  }

  private clearCanvas() {
    this.canvas.clear();
    this.canvas.backgroundColor = '#fafafa';
    this.noteObjects = [];
    this.cursorObjects.clear();
  }

  render() {
    this.clearCanvas();
    if (!this.parsedABC) return;

    this.renderHeader();

    if (this.viewMode === 'staff') {
      this.renderStaffView();
    } else {
      this.renderJianpuView();
    }

    this.renderFrozenOverlays();
  }

  private renderHeader() {
    const header = this.parsedABC!.header;
    let y = 30;

    if (header.title) {
      const title = new fabric.Text(header.title, {
        left: LEFT_MARGIN,
        top: y,
        fontSize: 24,
        fontWeight: 'bold',
        fill: '#333',
        selectable: false,
      });
      this.canvas.add(title);
      y += 35;
    }

    if (header.composer) {
      const composer = new fabric.Text(header.composer, {
        left: LEFT_MARGIN,
        top: y,
        fontSize: 14,
        fill: '#666',
        selectable: false,
      });
      this.canvas.add(composer);
      y += 25;
    }

    const infoParts: string[] = [];
    if (header.key) infoParts.push(`调: ${header.key}`);
    if (header.meter) infoParts.push(`拍: ${header.meter}`);
    if (header.tempo) infoParts.push(`速度: ${header.tempo}`);
    
    if (infoParts.length > 0) {
      const info = new fabric.Text(infoParts.join('  '), {
        left: LEFT_MARGIN,
        top: y,
        fontSize: 14,
        fill: '#666',
        selectable: false,
      });
      this.canvas.add(info);
    }
  }

  private renderStaffView() {
    const lines = this.parsedABC!.notes;

    lines.forEach((notes, lineIndex) => {
      const y = TOP_MARGIN + lineIndex * LINE_HEIGHT;
      this.drawStaffLines(y);
      this.drawClef(y);
      this.drawKeySignature(y);
      this.renderStaffNotes(notes, lineIndex, y);
    });
  }

  private drawStaffLines(y: number) {
    for (let i = 0; i < 5; i++) {
      const lineY = y + i * STAFF_LINE_SPACING;
      const line = new fabric.Line([LEFT_MARGIN, lineY, 1100, lineY], {
        stroke: '#333',
        strokeWidth: 1,
        selectable: false,
      });
      this.canvas.add(line);
    }
  }

  private drawClef(y: number) {
    const clef = new fabric.Text('𝄞', {
      left: LEFT_MARGIN - 40,
      top: y - 25,
      fontSize: 60,
      fill: '#333',
      selectable: false,
    });
    this.canvas.add(clef);
  }

  private drawKeySignature(y: number) {
    const key = this.parsedABC!.header.key;
    if (!key) return;

    if (key.includes('#')) {
      const sharp = new fabric.Text('♯', {
        left: LEFT_MARGIN + 10,
        top: y,
        fontSize: 24,
        fill: '#333',
        selectable: false,
      });
      this.canvas.add(sharp);
    } else if (key.includes('b')) {
      const flat = new fabric.Text('♭', {
        left: LEFT_MARGIN + 10,
        top: y,
        fontSize: 24,
        fill: '#333',
        selectable: false,
      });
      this.canvas.add(flat);
    }
  }

  private renderStaffNotes(notes: SheetNote[], lineIndex: number, y: number) {
    const lineNotes: fabric.Object[] = [];
    const middleC = y + 4 * STAFF_LINE_SPACING;

    notes.forEach((note, noteIndex) => {
      const x = LEFT_MARGIN + 60 + noteIndex * NOTE_WIDTH;
      
      if (note.isRest) {
        const rest = this.createRest(x, y + 2 * STAFF_LINE_SPACING, note.duration);
        this.canvas.add(rest);
        lineNotes.push(rest);
        return;
      }

      const staffPos = getStaffPosition(note);
      const noteY = middleC - staffPos * (STAFF_LINE_SPACING / 2);

      if (staffPos <= 0) {
        for (let i = 0; i >= staffPos; i -= 2) {
          const ledgerY = middleC - i * (STAFF_LINE_SPACING / 2);
          const ledgerLine = new fabric.Line([x - 10, ledgerY, x + 20, ledgerY], {
            stroke: '#333',
            strokeWidth: 1,
            selectable: false,
          });
          this.canvas.add(ledgerLine);
        }
      } else if (staffPos >= 12) {
        for (let i = 12; i <= staffPos; i += 2) {
          const ledgerY = middleC - i * (STAFF_LINE_SPACING / 2);
          const ledgerLine = new fabric.Line([x - 10, ledgerY, x + 20, ledgerY], {
            stroke: '#333',
            strokeWidth: 1,
            selectable: false,
          });
          this.canvas.add(ledgerLine);
        }
      }

      if (note.accidental) {
        const accSymbol = note.accidental === '#' ? '♯' : note.accidental === 'b' ? '♭' : '♮';
        const accidental = new fabric.Text(accSymbol, {
          left: x - 15,
          top: noteY - 12,
          fontSize: 18,
          fill: '#333',
          selectable: false,
        });
        this.canvas.add(accidental);
      }

      const noteHead = this.createNoteHead(x, noteY, note.duration);
      this.canvas.add(noteHead);
      lineNotes.push(noteHead);

      if (note.duration <= 2) {
        const stem = new fabric.Line([x + 6, noteY, x + 6, noteY - 35], {
          stroke: '#333',
          strokeWidth: 1.5,
          selectable: false,
        });
        this.canvas.add(stem);
      }

      if (note.duration < 1) {
        const flagCount = note.duration <= 0.25 ? 2 : 1;
        for (let f = 0; f < flagCount; f++) {
          const flag = new fabric.Text('𝅘𝅥𝅮', {
            left: x + 4,
            top: noteY - 40 - f * 8,
            fontSize: 16,
            fill: '#333',
            selectable: false,
          });
          this.canvas.add(flag);
        }
      }

      if (note.dot) {
        const dot = new fabric.Circle({
          left: x + 15,
          top: noteY - 2,
          radius: 3,
          fill: '#333',
          selectable: false,
        });
        this.canvas.add(dot);
      }

      if ((noteIndex + 1) % 4 === 0 && noteIndex < notes.length - 1) {
        const barY = y;
        const barline = new fabric.Line([x + NOTE_WIDTH, barY, x + NOTE_WIDTH, barY + 4 * STAFF_LINE_SPACING], {
          stroke: '#333',
          strokeWidth: 1.5,
          selectable: false,
        });
        this.canvas.add(barline);
      }
    });

    this.noteObjects.push(lineNotes);
  }

  private createNoteHead(x: number, y: number, duration: number): fabric.Object {
    if (duration >= 4) {
      return new fabric.Text('𝅝', {
        left: x,
        top: y - 10,
        fontSize: 24,
        fill: '#333',
        selectable: false,
      });
    } else if (duration >= 2) {
      return new fabric.Text('𝅗𝅥', {
        left: x,
        top: y - 10,
        fontSize: 24,
        fill: '#333',
        selectable: false,
      });
    } else {
      return new fabric.Text('𝅘𝅥', {
        left: x,
        top: y - 10,
        fontSize: 24,
        fill: '#333',
        selectable: false,
      });
    }
  }

  private createRest(x: number, y: number, duration: number): fabric.Object {
    let symbol = '𝄽';
    if (duration >= 4) symbol = '𝄻';
    else if (duration >= 2) symbol = '𝄼';
    else if (duration >= 1) symbol = '𝄽';
    else if (duration >= 0.5) symbol = '𝄾';
    else symbol = '𝄿';

    return new fabric.Text(symbol, {
      left: x,
      top: y - 15,
      fontSize: 24,
      fill: '#333',
      selectable: false,
    });
  }

  private renderJianpuView() {
    const lines = this.parsedABC!.notes;

    lines.forEach((notes, lineIndex) => {
      const y = TOP_MARGIN + lineIndex * LINE_HEIGHT;
      this.renderJianpuNotes(notes, lineIndex, y);
    });
  }

  private renderJianpuNotes(notes: SheetNote[], lineIndex: number, y: number) {
    const lineNotes: fabric.Object[] = [];

    notes.forEach((note, noteIndex) => {
      const x = LEFT_MARGIN + noteIndex * NOTE_WIDTH;
      
      const jianpu = noteToJianpu(note);
      const octaveDots = getOctaveDots(note);

      const fontSize = note.duration <= 0.5 ? 28 : note.duration <= 1 ? 32 : 36;
      
      const noteText = new fabric.Text(jianpu, {
        left: x,
        top: y,
        fontSize,
        fontWeight: 'bold',
        fill: '#333',
        selectable: false,
      });
      this.canvas.add(noteText);
      lineNotes.push(noteText);

      for (let d = 0; d < octaveDots.above; d++) {
        const dot = new fabric.Circle({
          left: x + 10,
          top: y - 8 - d * 6,
          radius: 2.5,
          fill: '#333',
          selectable: false,
        });
        this.canvas.add(dot);
      }

      for (let d = 0; d < octaveDots.below; d++) {
        const dot = new fabric.Circle({
          left: x + 10,
          top: y + fontSize + 2 + d * 6,
          radius: 2.5,
          fill: '#333',
          selectable: false,
        });
        this.canvas.add(dot);
      }

      let underlineCount = 0;
      if (note.duration <= 0.5) underlineCount = 2;
      else if (note.duration <= 1) underlineCount = 1;

      for (let u = 0; u < underlineCount; u++) {
        const underline = new fabric.Line([x, y + fontSize + 10 + u * 6, x + 25, y + fontSize + 10 + u * 6], {
          stroke: '#333',
          strokeWidth: 2,
          selectable: false,
        });
        this.canvas.add(underline);
      }

      if (note.dot) {
        const dot = new fabric.Circle({
          left: x + 30,
          top: y + fontSize / 2,
          radius: 3,
          fill: '#333',
          selectable: false,
        });
        this.canvas.add(dot);
      }

      if ((noteIndex + 1) % 4 === 0 && noteIndex < notes.length - 1) {
        const barline = new fabric.Line([x + NOTE_WIDTH, y - 10, x + NOTE_WIDTH, y + fontSize + 20], {
          stroke: '#333',
          strokeWidth: 1.5,
          selectable: false,
        });
        this.canvas.add(barline);
      }
    });

    this.noteObjects.push(lineNotes);
  }

  getCanvas() {
    return this.canvas;
  }

  getNoteAtPosition(x: number, y: number): { lineIndex: number; noteIndex: number } | null {
    for (let lineIdx = 0; lineIdx < this.noteObjects.length; lineIdx++) {
      for (let noteIdx = 0; noteIdx < this.noteObjects[lineIdx].length; noteIdx++) {
        const obj = this.noteObjects[lineIdx][noteIdx];
        if (obj.containsPoint({ x, y })) {
          return { lineIndex: lineIdx, noteIndex: noteIdx };
        }
      }
    }
    return null;
  }

  resize(width: number, height: number) {
    this.canvas.setWidth(width);
    this.canvas.setHeight(height);
    this.canvas.renderAll();
  }

  destroy() {
    this.canvas.dispose();
  }
}
