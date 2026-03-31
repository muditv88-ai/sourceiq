import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import AuthGuard from "@/components/AuthGuard";
import AppLayout from "@/components/AppLayout";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import ProjectsPage from "@/pages/ProjectsPage";
import NewRfpPage from "@/pages/NewRfpPage";
import AnalysisPage from "@/pages/AnalysisPage";
import ScenariosPage from "@/pages/ScenariosPage";
import CommunicationsPage from "@/pages/CommunicationsPage";
import PricingPage from "@/pages/PricingPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />

            {/* Protected — all wrapped in AuthGuard + AppLayout */}
            <Route path="/*" element={
              <AuthGuard>
                <AppLayout>
                  <Routes>
                    <Route path="/"               element={<DashboardPage />} />
                    <Route path="/projects"        element={<ProjectsPage />} />
                    <Route path="/rfp/new"         element={<NewRfpPage />} />
                    <Route path="/analysis"        element={<AnalysisPage />} />
                    <Route path="/scenarios"       element={<ScenariosPage />} />
                    <Route path="/communications"  element={<CommunicationsPage />} />
                    <Route path="/pricing"         element={<PricingPage />} />
                    <Route path="*"                element={<NotFound />} />
                  </Routes>
                </AppLayout>
              </AuthGuard>
            } />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
