import { SheetNote } from '../types';
import { noteToMidi } from './abcParser';

export class MidiPlayer {
  private audioContext: AudioContext | null = null;
  private isPlaying: boolean = false;
  private currentTime: number = 0;
  private tempo: number = 120;
  private gainNode: GainNode | null = null;
  private scheduledNotes: { oscillator: OscillatorNode; gain: GainNode }[] = [];

  constructor() {
    this.initAudio();
  }

  private initAudio() {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      this.gainNode.gain.value = 0.3;
    } catch (e) {
      console.warn('Web Audio API not supported');
    }
  }

  async resume() {
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  setTempo(tempo: number) {
    this.tempo = tempo;
  }

  playNote(note: SheetNote, duration: number = 0.5) {
    if (!this.audioContext || note.isRest) return;
    this.resume();

    const midi = noteToMidi(note);
    const freq = 440 * Math.pow(2, (midi - 69) / 12);

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(freq, this.audioContext.currentTime);

    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, this.audioContext.currentTime + 0.01);
    gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + duration * 0.9);

    oscillator.connect(gainNode);
    gainNode.connect(this.gainNode!);

    oscillator.start();
    oscillator.stop(this.audioContext.currentTime + duration);

    oscillator.onended = () => {
      oscillator.disconnect();
      gainNode.disconnect();
    };
  }

  async playNotes(notes: SheetNote[], onNotePlay?: (index: number) => void): Promise<void> {
    if (!this.audioContext) return;
    await this.resume();

    this.isPlaying = true;
    this.currentTime = 0;

    const beatDuration = 60 / this.tempo;

    for (let i = 0; i < notes.length; i++) {
      if (!this.isPlaying) break;

      const note = notes[i];
      const duration = note.duration * beatDuration * 0.5;

      onNotePlay?.(i);
      this.playNote(note, duration);

      await new Promise(resolve => setTimeout(resolve, duration * 1000));
    }

    this.isPlaying = false;
  }

  stop() {
    this.isPlaying = false;
    this.scheduledNotes.forEach(({ oscillator, gain }) => {
      try {
        oscillator.stop();
        oscillator.disconnect();
        gain.disconnect();
      } catch (e) {}
    });
    this.scheduledNotes = [];
  }

  isCurrentlyPlaying(): boolean {
    return this.isPlaying;
  }

  destroy() {
    this.stop();
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}

export const midiPlayer = new MidiPlayer();
