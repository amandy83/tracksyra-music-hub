import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AuthProvider } from "./hooks/useAuth";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
import { SkeletonCard } from "./components/dashboard/DashboardPrimitives";

const queryClient = new QueryClient();
const Index = lazy(() => import("./pages/Index"));
const Blog = lazy(() => import("./pages/Blog"));
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const TooLostOAuthCallback = lazy(() => import("./pages/TooLostOAuthCallback"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const DspMarketingHub = lazy(() => import("./pages/DspMarketingHub"));
const PreSaveCampaignHub = lazy(() => import("./pages/PreSaveCampaignHub"));
const PreSaveCampaignCreate = lazy(() => import("./pages/PreSaveCampaignCreate"));
const PreSaveCampaignList = lazy(() => import("./pages/PreSaveCampaignList"));
const PreSaveSmartLink = lazy(() => import("./pages/PreSaveSmartLink"));
const CampaignCenterHub = lazy(() => import("./pages/CampaignCenterHub"));
const CampaignCenterCreate = lazy(() => import("./pages/CampaignCenterCreate"));
const CampaignCenterList = lazy(() => import("./pages/CampaignCenterList"));
const CampaignCenterDetail = lazy(() => import("./pages/CampaignCenterDetail"));
const DspAnalyticsDashboard = lazy(() => import("./pages/DspAnalyticsDashboard"));
const DspAnalyticsStreams = lazy(() => import("./pages/DspAnalyticsStreams"));
const DspAnalyticsAudience = lazy(() => import("./pages/DspAnalyticsAudience"));
const DspAnalyticsPlaylistPerformance = lazy(() => import("./pages/DspAnalyticsPlaylistPerformance"));
const DspAiAssistantDashboard = lazy(() => import("./pages/DspAiAssistantDashboard"));
const DspAiAssistantRecommendations = lazy(() => import("./pages/DspAiAssistantRecommendations"));
const PlaylistPitching = lazy(() => import("./pages/PlaylistPitching"));
const CuratorMarketplace = lazy(() => import("./pages/CuratorMarketplace"));
const PlaylistPerformance = lazy(() => import("./pages/PlaylistPerformance"));
const PromoAssetsStudio = lazy(() => import("./pages/PromoAssetsStudio"));
const PublisherDashboard = lazy(() => import("./pages/PublisherDashboard"));
const LabelManagement = lazy(() => import("./pages/LabelManagement"));
const ArtistAssignmentSystem = lazy(() => import("./pages/ArtistAssignmentSystem"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminEmailMonitoring = lazy(() => import("./pages/AdminEmailMonitoring"));
const AdminReviewQueue = lazy(() => import("./pages/AdminReviewQueue"));
const NotFound = lazy(() => import("./pages/NotFound"));

const RouteFallback = () => (
  <div className="min-h-screen bg-[#f7f4ff] p-4 sm:p-8">
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 md:grid-cols-3">
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/blog" element={<Blog />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/auth/toolost/callback" element={<TooLostOAuthCallback />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/dashboard/dsp-marketing" element={<ProtectedRoute><DspMarketingHub /></ProtectedRoute>} />
              <Route path="/dashboard/campaign-center" element={<ProtectedRoute><CampaignCenterHub /></ProtectedRoute>} />
              <Route path="/dashboard/campaign-center/new" element={<ProtectedRoute><CampaignCenterCreate /></ProtectedRoute>} />
              <Route path="/dashboard/campaign-center/campaigns" element={<ProtectedRoute><CampaignCenterList /></ProtectedRoute>} />
              <Route path="/dashboard/campaign-center/:campaignId" element={<ProtectedRoute><CampaignCenterDetail /></ProtectedRoute>} />
              <Route path="/dashboard/dsp-analytics" element={<ProtectedRoute><DspAnalyticsDashboard /></ProtectedRoute>} />
              <Route path="/dashboard/dsp-analytics/streams" element={<ProtectedRoute><DspAnalyticsStreams /></ProtectedRoute>} />
              <Route path="/dashboard/dsp-analytics/audience" element={<ProtectedRoute><DspAnalyticsAudience /></ProtectedRoute>} />
              <Route path="/dashboard/dsp-analytics/playlist-performance" element={<ProtectedRoute><DspAnalyticsPlaylistPerformance /></ProtectedRoute>} />
              <Route path="/dashboard/dsp-ai-assistant" element={<ProtectedRoute><DspAiAssistantDashboard /></ProtectedRoute>} />
              <Route path="/dashboard/dsp-ai-assistant/recommendations" element={<ProtectedRoute><DspAiAssistantRecommendations /></ProtectedRoute>} />
              <Route path="/dashboard/pre-save" element={<ProtectedRoute><PreSaveCampaignHub /></ProtectedRoute>} />
              <Route path="/dashboard/pre-save/new" element={<ProtectedRoute><PreSaveCampaignCreate /></ProtectedRoute>} />
              <Route path="/dashboard/pre-save/campaigns" element={<ProtectedRoute><PreSaveCampaignList /></ProtectedRoute>} />
              <Route path="/dashboard/playlist-pitching" element={<ProtectedRoute><PlaylistPitching /></ProtectedRoute>} />
              <Route path="/dashboard/curator-marketplace" element={<ProtectedRoute><CuratorMarketplace /></ProtectedRoute>} />
              <Route path="/dashboard/playlist-performance" element={<ProtectedRoute><PlaylistPerformance /></ProtectedRoute>} />
              <Route path="/dashboard/promo-assets" element={<ProtectedRoute><PromoAssetsStudio /></ProtectedRoute>} />
              <Route path="/dashboard/publisher" element={<ProtectedRoute allowedRoles={["super_admin", "publisher"]} requireArtistApproval={false}><PublisherDashboard /></ProtectedRoute>} />
              <Route path="/dashboard/label-management" element={<ProtectedRoute allowedRoles={["super_admin", "publisher", "label"]} requireArtistApproval={false}><LabelManagement /></ProtectedRoute>} />
              <Route path="/dashboard/artist-assignments" element={<ProtectedRoute allowedRoles={["super_admin", "publisher", "label"]} requireArtistApproval={false}><ArtistAssignmentSystem /></ProtectedRoute>} />
              <Route path="/releases" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/songs" element={<Navigate to="/releases" replace />} />
              <Route path="/songs/*" element={<Navigate to="/releases" replace />} />
              <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
              <Route path="/admin/review-queue" element={<AdminRoute allowedRoles={["super_admin", "publisher"]}><AdminReviewQueue /></AdminRoute>} />
              <Route path="/admin/email-monitoring" element={<AdminRoute allowedRoles={["super_admin"]}><AdminEmailMonitoring /></AdminRoute>} />
              <Route path="/pre-save/:slug" element={<PreSaveSmartLink />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
