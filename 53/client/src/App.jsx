import { Routes, Route } from 'react-router-dom';
import { useWebRTC } from './hooks/useWebRTC';
import HomePage from './components/HomePage';
import RoomPage from './components/RoomPage';

export default function App() {
  const webRTC = useWebRTC();

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<HomePage webRTC={webRTC} />} />
        <Route path="/room/:roomId" element={<RoomPage webRTC={webRTC} />} />
      </Routes>
    </div>
  );
}
