import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { api } from "@/lib/api";

export function AuthGuard() {
  const [status, setStatus] = useState<"loading" | "ok" | "unauth">("loading");

  useEffect(() => {
    api
      .me()
      .then(() => setStatus("ok"))
      .catch(() => setStatus("unauth"));
  }, []);

  if (status === "loading")
    return (
      <div className="flex items-center justify-center min-h-screen text-muted-foreground">
        Loading...
      </div>
    );
  if (status === "unauth") return <Navigate to="/_dash/login" replace />;
  return <Outlet />;
}
