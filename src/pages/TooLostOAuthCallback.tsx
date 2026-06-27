import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";

export default function TooLostOAuthCallback() {
  const location = useLocation();
  const [message, setMessage] = useState("Completing Too Lost sign-in...");

  useEffect(() => {
    const query = location.search || "";
    if (!query || (!new URLSearchParams(query).get("code") && !new URLSearchParams(query).get("error"))) {
      setMessage("Missing OAuth callback parameters.");
      return;
    }

    window.location.replace(`/api/distribution/too-lost/oauth/callback${query}`);
  }, [location.search]);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-pink-400" />
        <p className="text-lg font-semibold">{message}</p>
        <p className="text-sm text-slate-300">Redirecting to the secure server callback.</p>
      </div>
    </div>
  );
}
