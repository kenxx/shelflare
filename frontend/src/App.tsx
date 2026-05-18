import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthGuard } from "@/components/AuthGuard";
import { Dashboard } from "@/pages/Dashboard";
import { Home } from "@/pages/Home";
import { Login } from "@/pages/Login";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/_dash/login" element={<Login />} />
        <Route element={<AuthGuard />}>
          <Route path="/_dash" element={<Dashboard />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
