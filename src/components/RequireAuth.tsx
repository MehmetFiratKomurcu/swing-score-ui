import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";

export function RequireAuth() {
  const { token } = useAuth();
  const location = useLocation();

  if (!token) {
    const returnUrl = `${location.pathname}${location.search}`;
    return (
      <Navigate
        to="/login"
        replace
        state={{ returnUrl: returnUrl === "/" ? "/events" : returnUrl }}
      />
    );
  }

  return <Outlet />;
}
