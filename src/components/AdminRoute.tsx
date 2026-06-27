import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { type AppRole, useRoles } from "@/hooks/useRole";

const AdminRoute = ({
  children,
  allowedRoles = ["super_admin"],
}: {
  children: JSX.Element;
  allowedRoles?: AppRole[];
}) => {
  const { user, loading } = useAuth();
  const { hasAnyRole, loading: roleLoading } = useRoles();

  if (loading || roleLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!hasAnyRole(allowedRoles)) return <Navigate to="/dashboard" replace />;
  return children;
};

export default AdminRoute;
