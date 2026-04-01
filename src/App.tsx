import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthProvider } from "@/contexts/AuthContext";
import AuthGuard from "@/components/AuthGuard";
import AppLayout from "@/components/AppLayout";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import ProjectsPage from "@/pages/ProjectsPage";
import NewRfpPage from "@/pages/NewRfpPage";
import SupplierResponsesPage from "@/pages/SupplierResponsesPage";
import SuppliersPage from "@/pages/SuppliersPage";
import DrawingsPage from "@/pages/DrawingsPage";
import AnalysisPage from "@/pages/AnalysisPage";
import ScenariosPage from "@/pages/ScenariosPage";
import CommunicationsPage from "@/pages/CommunicationsPage";
import PricingPage from "@/pages/PricingPage";
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
            <Routes>
              {/* Public */}
              <Route path="/login" element={<LoginPage />} />

              {/* Protected */}
              <Route path="/*" element={
                <AuthGuard>
                  <AppLayout>
                    <Routes>
                      <Route path="/"                  element={<DashboardPage />} />
                      <Route path="/projects"          element={<ProjectsPage />} />
                      <Route path="/rfp/new"           element={<NewRfpPage />} />
                      <Route path="/supplier-responses" element={<SupplierResponsesPage />} />
                      <Route path="/suppliers"         element={<SuppliersPage />} />
                      <Route path="/analysis"          element={<AnalysisPage />} />
                      <Route path="/pricing"           element={<PricingPage />} />
                      <Route path="/scenarios"         element={<ScenariosPage />} />
                      <Route path="/drawings"          element={<DrawingsPage />} />
                      <Route path="/communications"    element={<CommunicationsPage />} />
                      <Route path="*"                  element={<NotFound />} />
                    </Routes>
                  </AppLayout>
                </AuthGuard>
              } />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </GoogleOAuthProvider>
  </QueryClientProvider>
);

export default App;
