import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { Navigate, Route, BrowserRouter as Router, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell.jsx";
import { AuthProvider, useAuth } from "./components/AuthProvider.jsx";
import { PageLoader, RouteMessage, ToastProvider } from "./components/UX.jsx";
import { Login } from "./pages/Login.jsx";
import { ChangePassword } from "./pages/ChangePassword.jsx";
import "./styles/app.css";

const Dashboard = lazy(() => import("./pages/Dashboard.jsx").then((module) => ({ default: module.Dashboard })));
const Directory = lazy(() => import("./pages/Directory.jsx").then((module) => ({ default: module.Directory })));
const Learning = lazy(() => import("./pages/Learning.jsx").then((module) => ({ default: module.Learning })));
const Operations = lazy(() => import("./pages/Operations.jsx").then((module) => ({ default: module.Operations })));
const AiTutor = lazy(() => import("./pages/AiTutor.jsx").then((module) => ({ default: module.AiTutor })));

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.first_login || user.force_password_change) return <Navigate to="/change-password" replace />;
  return children;
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Router>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/change-password" element={<ChangePassword />} />
              <Route path="/403" element={<RouteMessage code="403" title="Access restricted" message="This area is protected for your RedHero role." />} />
              <Route
                path="/"
                element={
                  <Protected>
                    <AppShell />
                  </Protected>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="directory" element={<Directory />} />
                <Route path="learning" element={<Learning />} />
                <Route path="operations" element={<Operations />} />
                <Route path="ai-tutor" element={<AiTutor />} />
              </Route>
              <Route path="*" element={<RouteMessage code="404" title="Page not found" message="The page you opened is not available in this portal." />} />
            </Routes>
          </Suspense>
        </Router>
      </ToastProvider>
    </AuthProvider>
  );
}

createRoot(document.getElementById("root")).render(<App />);
