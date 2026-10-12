import '@vly-ai/integrations';
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import "./index.css";

// Lazy load route components for better code splitting
const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

// DIAMOND-PROTECT :: Payment Shield (customer-facing)
const PayShield = lazy(() => import("./pages/shield/PayShield.tsx"));
const QrVerify = lazy(() => import("./pages/shield/QrVerify.tsx"));
const ShieldResult = lazy(() => import("./pages/shield/Result.tsx"));
const History = lazy(() => import("./pages/shield/History.tsx"));
const SafetyCentre = lazy(() => import("./pages/shield/SafetyCentre.tsx"));

// DIAMOND-PROTECT :: Command Centre (bank fraud analyst console)
const CommandOverview = lazy(() => import("./pages/command/Overview.tsx"));
const Investigator = lazy(() => import("./pages/command/Investigator.tsx"));
const MuleNetGraph = lazy(() => import("./pages/command/MuleNetGraph.tsx"));
const MerchantRegistry = lazy(() => import("./pages/command/MerchantRegistry.tsx"));
const CaseManager = lazy(() => import("./pages/command/CaseManager.tsx"));
const RuleControl = lazy(() => import("./pages/command/RuleControl.tsx"));

// Simple loading fallback for route transitions
function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F1EA]">
      <div className="dp-mono animate-pulse text-xs font-bold uppercase tracking-[0.12em] text-[#0A0A0A]/60">
        Loading DIAMOND-PROTECT…
      </div>
    </div>
  );
}

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in the browser runtime). */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/** Hard guard so runtime errors never leave the preview as a blank page. */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[Preview] Root crash:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#F4F1EA] text-[#0A0A0A] p-6">
          <div className="max-w-lg border-[3px] border-[#0A0A0A] bg-white p-5 shadow-[5px_5px_0_0_#0A0A0A]">
            <p className="dp-mono text-xs font-bold uppercase tracking-[0.1em]">
              DIAMOND-PROTECT · preview runtime error
            </p>
            <p className="mt-2 text-xs text-[#0A0A0A]/70 break-words">
              {this.state.message}
            </p>
            {this.state.stack && (
              <pre className="mt-3 text-left text-[10px] leading-4 text-[#0A0A0A]/55 max-h-40 overflow-auto border-2 border-[#0A0A0A] p-2">
                {this.state.stack}
              </pre>
            )}
            <button
              type="button"
              onClick={() => window.location.assign("/")}
              className="mt-3 border-2 border-[#0A0A0A] bg-[#22D3EE] px-3 py-1.5 text-[11px] font-bold uppercase"
            >
              Back to safety
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      <ConvexAuthProvider client={convex}>
        <BrowserRouter>
          <RouteSyncer />
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route
                path="/auth"
                element={<AuthPage redirectAfterAuth="/command" />}
              />

              {/* Payment Shield — customer-facing */}
              <Route
                path="/shield"
                element={
                  <RequireAuth
                    title="Sign in to use the Payment Shield"
                    description="Scoring a payment is a signed-in action, so the audit trail stays complete."
                  >
                    <PayShield />
                  </RequireAuth>
                }
              />
              <Route
                path="/shield/qr"
                element={
                  <RequireAuth title="Sign in to verify QR codes">
                    <QrVerify />
                  </RequireAuth>
                }
              />
              <Route
                path="/shield/result/:txnId"
                element={
                  <RequireAuth title="Sign in to view the trust result">
                    <ShieldResult />
                  </RequireAuth>
                }
              />
              <Route
                path="/shield/history"
                element={
                  <RequireAuth title="Sign in to view transaction history">
                    <History />
                  </RequireAuth>
                }
              />
              <Route
                path="/shield/safety"
                element={
                  <RequireAuth title="Sign in to open the Safety Centre">
                    <SafetyCentre />
                  </RequireAuth>
                }
              />

              {/* Command Centre — bank fraud analyst console */}
              <Route
                path="/command"
                element={
                  <RequireAuth
                    title="Sign in to the Command Centre"
                    description="The fraud analyst console requires a signed-in session."
                  >
                    <CommandOverview />
                  </RequireAuth>
                }
              />
              <Route
                path="/command/investigator"
                element={
                  <RequireAuth title="Sign in to the investigator">
                    <Investigator />
                  </RequireAuth>
                }
              />
              <Route
                path="/command/mulenet"
                element={
                  <RequireAuth title="Sign in to MuleNet">
                    <MuleNetGraph />
                  </RequireAuth>
                }
              />
              <Route
                path="/command/merchants"
                element={
                  <RequireAuth title="Sign in to the QR registry">
                    <MerchantRegistry />
                  </RequireAuth>
                }
              />
              <Route
                path="/command/cases"
                element={
                  <RequireAuth title="Sign in to the case manager">
                    <CaseManager />
                  </RequireAuth>
                }
              />
              <Route
                path="/command/rules"
                element={
                  <RequireAuth title="Sign in to the rule control panel">
                    <RuleControl />
                  </RequireAuth>
                }
              />

              {/* Legacy dashboard route now points at the analyst console */}
              <Route path="/dashboard" element={<Navigate to="/command" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster />
      </ConvexAuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
