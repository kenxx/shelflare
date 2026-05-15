import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthGuard } from "@/components/AuthGuard";
import { EditScript } from "@/pages/EditScript";
import { Home } from "@/pages/Home";
import { Login } from "@/pages/Login";
import { NewScript } from "@/pages/NewScript";
import { ScriptList } from "@/pages/ScriptList";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/_dash/login" element={<Login />} />
        <Route element={<AuthGuard />}>
          <Route path="/_dash" element={<ScriptList />} />
          <Route path="/_dash/new" element={<NewScript />} />
          <Route path="/_dash/edit/:key" element={<EditScript />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
