import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import WorkbenchPage from "./pages/WorkbenchPage";
import MemoryMapPage from "./pages/MemoryMapPage";
import AdminPage from "./pages/AdminPage";
import LoginPage from "./pages/LoginPage";

function Router() {
  return (
    <Switch>
      <Route path="/" component={WorkbenchPage} />
      <Route path="/memory" component={MemoryMapPage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "oklch(0.09 0.012 265)" }}
      >
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "oklch(0.6 0.2 255)", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <>
        <Toaster />
        <LoginPage />
      </>
    );
  }

  return (
    <SettingsProvider userId={user.id}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </SettingsProvider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AuthenticatedApp />
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
