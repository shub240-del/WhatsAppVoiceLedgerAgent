import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, AudioLines, LoaderCircle, RefreshCw } from "lucide-react";
import { LandingPage } from "./components/LandingPage";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./lib/firebase";
import { resolveGoogleRedirectResult } from "./lib/google-auth";
import { authErrorMessage } from "./lib/auth-errors";

const Dashboard = lazy(() => import("./Dashboard"));
const DemoPage = lazy(() => import("./DemoPage"));
const NarrationPage = lazy(() => import("./NarrationPage"));
const AuthDialog = lazy(() =>
  import("./components/AuthDialog").then((module) => ({ default: module.AuthDialog })),
);
const isWorkspace = () => window.location.hash.startsWith("#/workspace");
const isDemo = () => window.location.hash.startsWith("#/demo");
const isNarrate = () => window.location.hash.startsWith("#/narrate");

class ExperienceBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="experience-error">
          <span className="brand-mark">
            <AudioLines size={26} />
          </span>
          <h1>Let’s get you back to your khata.</h1>
          <p>This page could not load. Your saved records haven’t been changed.</p>
          <button className="button primary" onClick={() => window.location.reload()}>
            <RefreshCw size={16} />
            Reload page
          </button>
          <a href="./" className="text-button">
            <ArrowLeft size={15} />
            Return to Udhaar
          </a>
        </main>
      );
    return this.props.children;
  }
}

export default function App() {
  const [workspace, setWorkspace] = useState(isWorkspace);
  const [demo, setDemo] = useState(isDemo);
  const [narrate, setNarrate] = useState(isNarrate);
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);
  const [authRedirectError, setAuthRedirectError] = useState("");
  useEffect(() => {
    let active = true;
    void resolveGoogleRedirectResult()
      .then((credential) => {
        if (!active || !credential) return;
        setAuthMode(null);
        window.location.hash = "/workspace";
      })
      .catch((error: unknown) => {
        if (active) setAuthRedirectError(authErrorMessage(error));
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    // Signed in before? Opening the site goes straight to the khata, not the landing page.
    const stop = onAuthStateChanged(auth, (user) => {
      stop();
      const hash = window.location.hash.replace(/^#\/?/, "");
      if (user && !hash) window.location.hash = "/workspace";
    });
    return stop;
  }, []);
  useEffect(() => {
    const onHashChange = () => {
      const next = isWorkspace();
      setWorkspace(next);
      setDemo(isDemo());
      setNarrate(isNarrate());
      setAuthMode(null);
      if (next) window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  useEffect(() => {
    document.title = workspace ? "Your workspace · Udhaar" : "Udhaar — Less hisaab. More dukaan.";
  }, [workspace]);
  return (
    <ExperienceBoundary>
      {authRedirectError && (
        <div className="auth-redirect-error" role="alert">
          <span>{authRedirectError}</span>
          <button
            className="text-button"
            onClick={() => setAuthRedirectError("")}
            aria-label="Dismiss sign-in error"
          >
            Dismiss
          </button>
        </div>
      )}
      {narrate ? (
        <Suspense fallback={<main className="experience-error"><LoaderCircle className="spin" size={26} /><p>Opening the recorder…</p></main>}>
          <NarrationPage />
        </Suspense>
      ) : demo ? (
        <Suspense
          fallback={
            <main className="experience-error">
              <LoaderCircle className="spin" size={26} />
              <p>Opening the demo…</p>
            </main>
          }
        >
          <DemoPage />
        </Suspense>
      ) : workspace ? (
        <Suspense
          fallback={
            <main className="experience-error">
              <LoaderCircle className="spin" size={26} />
              <p>Opening your workspace…</p>
            </main>
          }
        >
          <Dashboard />
        </Suspense>
      ) : (
        // "Start" opens the product itself; an account is asked for only when the visitor saves something.
        <LandingPage onStart={() => (window.location.hash = "/workspace")} onLogin={() => setAuthMode("login")} />
      )}
      {authMode && (
        <Suspense
          fallback={
            <div className="public-loading" role="status">
              <LoaderCircle className="spin" size={20} />
              Opening secure sign-in…
            </div>
          }
        >
          <AuthDialog
            mode={authMode}
            onModeChange={setAuthMode}
            close={() => setAuthMode(null)}
          />
        </Suspense>
      )}
    </ExperienceBoundary>
  );
}
