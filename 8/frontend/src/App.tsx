import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import SearchPage from './pages/SearchPage';
import UploadPage from './pages/UploadPage';
import SnippetDetailPage from './pages/SnippetDetailPage';
import FavoritesPage from './pages/FavoritesPage';
import MaintenancePage from './pages/MaintenancePage';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/edit/:id" element={<UploadPage />} />
          <Route path="/snippet/:id" element={<SnippetDetailPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/maintenance" element={<MaintenancePage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
