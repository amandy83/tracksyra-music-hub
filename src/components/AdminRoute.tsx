import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useRole";

const AdminRoute = ({ children }: { children: JSX.Element }) => {
  const { user, loading } = useAuth();
  const { isAdmin, loading: roleLoading } = useIsAdmin();

  if (loading || roleLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
};

export default AdminRoute;
