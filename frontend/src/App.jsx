import { Link, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import Dashboard from "./pages/Dashboard";
import Scanner from "./pages/Scanner";
import Demo from "./pages/Demo";

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <nav className="border-b bg-white p-4">
        <ul className="flex flex-wrap gap-4 text-sm font-semibold">
          <li><Link to="/">Home</Link></li>
          <li><Link to="/dashboard">Dashboard</Link></li>
          <li><Link to="/scanner">Scanner</Link></li>
          <li><Link to="/demo">Demo</Link></li>
        </ul>
      </nav>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/scanner" element={<Scanner />} />
        <Route path="/demo" element={<Demo />} />
      </Routes>
    </div>
  );
}
