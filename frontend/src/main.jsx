import React, { Suspense, lazy, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Navigate, Route, BrowserRouter as Router, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell.jsx";
import { AuthProvider, useAuth } from "./components/AuthProvider.jsx";
import { ThemeProvider } from "./components/ThemeProvider.jsx";
import { LoadingOverlaySuppressor, LogoLoadingOverlay, PageLoader, RouteMessage, ToastProvider } from "./components/UX.jsx";
import { Login } from "./pages/Login.jsx";
import { ChangePassword } from "./pages/ChangePassword.jsx";
import "./styles/app.css";

const Dashboard = lazy(() => import("./pages/Dashboard.jsx").then((module) => ({ default: module.Dashboard })));
const Directory = lazy(() => import("./pages/Directory.jsx").then((module) => ({ default: module.Directory })));
const Learning = lazy(() => import("./pages/Learning.jsx").then((module) => ({ default: module.Learning })));
const Operations = lazy(() => import("./pages/Operations.jsx").then((module) => ({ default: module.Operations })));
const AiTutor = lazy(() => import("./pages/AiTutor.jsx").then((module) => ({ default: module.AiTutor })));
const ContactUs = lazy(() => import("./pages/ContactUs.jsx").then((module) => ({ default: module.ContactUs })));
const PracticeProgress = lazy(() => import("./pages/PracticeProgress.jsx").then((module) => ({ default: module.PracticeProgress })));

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.first_login || user.force_password_change) return <Navigate to="/change-password" replace />;
  return children;
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}

function AppContent() {
  const [initialLoadingActive, setInitialLoadingActive] = useState(true);

  return (
    <>
      <InitialLogoSplash onActiveChange={setInitialLoadingActive} />
      <LoadingOverlaySuppressor active={initialLoadingActive}>
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
                <Route path="learning/:sectionSlug" element={<Learning />} />
                <Route path="learning/:sectionSlug/:itemId" element={<Learning />} />
                <Route path="operations" element={<Operations />} />
                <Route path="practice-progress" element={<PracticeProgress />} />
                <Route path="ai-tutor" element={<AiTutor />} />
                <Route path="contact-us" element={<ContactUs />} />
              </Route>
              <Route path="*" element={<RouteMessage code="404" title="Page not found" message="The page you opened is not available in this portal." />} />
            </Routes>
          </Suspense>
        </Router>
      </ToastProvider>
      </LoadingOverlaySuppressor>
    </>
  );
}

function InitialLogoSplash({ onActiveChange }) {
  const { loading } = useAuth();
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [startedAt] = useState(() => Date.now());

  useEffect(() => {
    if (loading) return undefined;
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(0, 500 - elapsed);
    const fadeTimer = window.setTimeout(() => setLeaving(true), remaining);
    return () => window.clearTimeout(fadeTimer);
  }, [loading, startedAt]);

  useEffect(() => {
    if (!leaving) return undefined;
    const removeTimer = window.setTimeout(() => setVisible(false), 360);
    return () => window.clearTimeout(removeTimer);
  }, [leaving]);

  useEffect(() => {
    onActiveChange(visible);
  }, [onActiveChange, visible]);

  if (!visible) return null;

  return <LogoLoadingOverlay label="Loading RedHero" leaving={leaving} />;
}

createRoot(document.getElementById("root")).render(<App />);
