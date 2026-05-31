import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import TwinScene from './pages/TwinScene'
import Monitor from './pages/Monitor'
import Alerts from './pages/Alerts'
import WorkOrders from './pages/WorkOrders'
import Playback from './pages/Playback'
import Health from './pages/Health'

const App = () => {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<TwinScene />} />
        <Route path="monitor" element={<Monitor />} />
        <Route path="playback" element={<Playback />} />
        <Route path="health" element={<Health />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="work-orders" element={<WorkOrders />} />
      </Route>
    </Routes>
  )
}

export default App
