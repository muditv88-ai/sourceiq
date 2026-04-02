import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthProvider } from "@/contexts/AuthContext";
import { AgentProvider } from "@/contexts/AgentContext";
import AuthGuard from "@/components/AuthGuard";
import AppLayout from "@/components/AppLayout";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import ProjectsPage from "@/pages/ProjectsPage";
import ProjectDetailPage from "@/pages/ProjectDetailPage";
import NewRfpPage from "@/pages/NewRfpPage";
import SupplierResponsesPage from "@/pages/SupplierResponsesPage";
import SuppliersPage from "@/pages/SuppliersPage";
import SupplierManagementPage from "@/pages/SupplierManagementPage";
import DrawingsPage from "@/pages/DrawingsPage";
import AnalysisPage from "@/pages/AnalysisPage";
import ScenariosPage from "@/pages/ScenariosPage";
import CommunicationsPage from "@/pages/CommunicationsPage";
import PricingPage from "@/pages/PricingPage";
import AgentAnalyticsPage from "@/pages/AgentAnalyticsPage";
import DocumentsPage from "@/pages/DocumentsPage";
import CopilotPage from "@/pages/CopilotPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <TooltipProvider>
        <Toaster />
        <BrowserRouter>
          <AuthProvider>
            <AgentProvider>
              <Routes>
                {/* Public */}
                <Route path="/login" element={<LoginPage />} />

                {/* Protected */}
                <Route path="/*" element={
                  <AuthGuard>
                    <AppLayout>
                      <Routes>
                        {/* Core */}
                        <Route path="/"                    element={<DashboardPage />} />
                        <Route path="/projects"            element={<ProjectsPage />} />
                        {/* FM-1: Project Detail with lifecycle, KPIs, timeline, team, audit */}
                        <Route path="/projects/:id"        element={<ProjectDetailPage />} />

                        {/* FM-2: RFP */}
                        <Route path="/rfp/new"             element={<NewRfpPage />} />

                        {/* FM-3: Supplier Management (new full-module page) */}
                        <Route path="/suppliers"           element={<SuppliersPage />} />
                        <Route path="/suppliers/manage"    element={<SupplierManagementPage />} />

                        {/* FM-4: Supplier Responses */}
                        <Route path="/supplier-responses"  element={<SupplierResponsesPage />} />

                        {/* FM-5: Communications */}
                        <Route path="/communications"      element={<CommunicationsPage />} />

                        {/* FM-6: Technical Analysis */}
                        <Route path="/analysis"            element={<AnalysisPage />} />

                        {/* FM-7: Pricing */}
                        <Route path="/pricing"             element={<PricingPage />} />

                        {/* FM-8: Award Scenarios */}
                        <Route path="/scenarios"           element={<ScenariosPage />} />

                        {/* FM-9: AI Copilot (new dedicated page) */}
                        <Route path="/copilot"             element={<CopilotPage />} />

                        {/* Supporting */}
                        <Route path="/drawings"            element={<DrawingsPage />} />
                        <Route path="/documents"           element={<DocumentsPage />} />
                        <Route path="/agent-analytics"     element={<AgentAnalyticsPage />} />
                        <Route path="*"                    element={<NotFound />} />
                      </Routes>
                    </AppLayout>
                  </AuthGuard>
                } />
              </Routes>
            </AgentProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </GoogleOAuthProvider>
  </QueryClientProvider>
);

export default App;
