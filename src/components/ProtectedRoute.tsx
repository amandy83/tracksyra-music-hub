import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useArtistApproval } from "@/hooks/useArtistApproval";
import { type AppRole, useRoles } from "@/hooks/useRole";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const ProtectedRoute = ({
  children,
  allowedRoles,
  requireArtistApproval = true,
}: {
  children: JSX.Element;
  allowedRoles?: AppRole[];
  requireArtistApproval?: boolean;
}) => {
  const { user, loading } = useAuth();
  const roles = useRoles();
  const approval = useArtistApproval();

  if (loading || roles.loading || approval.loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (allowedRoles && !roles.hasAnyRole(allowedRoles)) return <Navigate to="/dashboard" replace />;

  const bypassApproval = roles.hasAnyRole(["super_admin", "publisher", "label"]);
  if (requireArtistApproval && !bypassApproval && !approval.approved) {
    const rejected = approval.status === "REJECTED";
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-pink-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg p-8 text-center">
          <h1 className="text-2xl font-bold mb-2">{rejected ? "Artist request not approved" : "Artist request pending"}</h1>
          <p className="text-muted-foreground mb-6">
            {rejected
              ? "Your artist access request was not approved. Contact TrackSyra support if you think this needs another review."
              : "Your artist request is under review. We will notify you by email once your dashboard and upload access are approved."}
          </p>
          <Button asChild variant="outline">
            <a href="/">Back to home</a>
          </Button>
        </Card>
      </div>
    );
  }
  return children;
};

export default ProtectedRoute;
