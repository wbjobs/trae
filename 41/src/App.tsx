import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import FormEditor from "@/components/FormEditor";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<FormEditor />} />
      </Routes>
    </Router>
  );
}