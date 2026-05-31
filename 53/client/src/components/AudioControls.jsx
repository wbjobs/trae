import { useEffect, useRef, useState } from 'react';

export default function AudioControls({ 
  audioEnabled, 
  remoteAudioEnabled, 
  onToggleAudio,
  setRemoteAudioElement 
}) {
  const remoteAudioRef = useRef(null);
  const [localVolume, setLocalVolume] = useState(0);
  const [remoteVolume, setRemoteVolume] = useState(0);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const remoteAnalyserRef = useRef(null);
  const animationRef = useRef(null);

  useEffect(() => {
    if (remoteAudioRef.current) {
      setRemoteAudioElement(remoteAudioRef.current);
    }
  }, [setRemoteAudioElement]);

  useEffect(() => {
    if (audioEnabled && !audioContextRef.current) {
      setupAudioAnalysis();
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [audioEnabled]);

  const setupAudioAnalysis = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);
      
      if (remoteAudioRef.current) {
        remoteAudioRef.current.addEventListener('play', () => {
          if (remoteAudioRef.current.srcObject) {
            const remoteSource = audioContextRef.current.createMediaStreamSource(
              remoteAudioRef.current.srcObject
            );
            remoteAnalyserRef.current = audioContextRef.current.createAnalyser();
            remoteAnalyserRef.current.fftSize = 256;
            remoteSource.connect(remoteAnalyserRef.current);
          }
        });
      }
      
      startVolumeMonitoring();
      
      stream.getTracks().forEach(track => track.stop());
    } catch (e) {
      console.error('Audio analysis setup error:', e);
    }
  };

  const startVolumeMonitoring = () => {
    const updateVolume = () => {
      if (analyserRef.current && audioEnabled) {
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setLocalVolume(Math.min(average / 100, 1));
      } else {
        setLocalVolume(0);
      }

      if (remoteAnalyserRef.current && remoteAudioEnabled) {
        const remoteDataArray = new Uint8Array(remoteAnalyserRef.current.frequencyBinCount);
        remoteAnalyserRef.current.getByteFrequencyData(remoteDataArray);
        const remoteAverage = remoteDataArray.reduce((a, b) => a + b, 0) / remoteDataArray.length;
        setRemoteVolume(Math.min(remoteAverage / 100, 1));
      } else {
        setRemoteVolume(0);
      }

      animationRef.current = requestAnimationFrame(updateVolume);
    };
    updateVolume();
  };

  const VolumeIndicator = ({ volume, label, isActive }) => (
    <div className="volume-indicator">
      <span className="volume-label">{label}</span>
      <div className="volume-bars">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className={`volume-bar ${volume > i * 0.2 && isActive ? 'active' : ''}`}
            style={{ height: `${(i + 1) * 4}px` }}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div className="audio-controls">
      <audio ref={remoteAudioRef} autoPlay playsInline />
      
      <div className="audio-status">
        <div className="audio-user">
          <div className={`mic-icon ${audioEnabled ? 'active' : ''}`}>
            {audioEnabled ? '🎙️' : '🔇'}
          </div>
          <span className="audio-user-label">我</span>
          <VolumeIndicator volume={localVolume} label="" isActive={audioEnabled} />
        </div>

        <div className="audio-divider">──</div>

        <div className="audio-user">
          <div className={`mic-icon ${remoteAudioEnabled ? 'active' : ''}`}>
            {remoteAudioEnabled ? '🔊' : '🔇'}
          </div>
          <span className="audio-user-label">对方</span>
          <VolumeIndicator volume={remoteVolume} label="" isActive={remoteAudioEnabled} />
        </div>
      </div>

      <button
        className={`audio-toggle-btn ${audioEnabled ? 'on' : 'off'}`}
        onClick={onToggleAudio}
      >
        {audioEnabled ? '🎙️ 关闭麦克风' : '🎤 开启麦克风'}
      </button>
    </div>
  );
}
