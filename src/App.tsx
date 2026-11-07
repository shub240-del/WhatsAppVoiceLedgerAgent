import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, AudioLines, LoaderCircle, RefreshCw } from "lucide-react";
import { LandingPage } from "./components/LandingPage";

const Dashboard = lazy(() => import("./Dashboard"));
const AuthDialog = lazy(() =>
  import("./components/AuthDialog").then((module) => ({ default: module.AuthDialog })),
);
const isWorkspace = () => window.location.hash.startsWith("#/workspace");

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
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);
  useEffect(() => {
    const onHashChange = () => {
      const next = isWorkspace();
      setWorkspace(next);
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
      {workspace ? (
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
        <LandingPage onStart={() => setAuthMode("signup")} onLogin={() => setAuthMode("login")} />
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
            done={(isNew) => {
              setAuthMode(null);
              window.location.hash = isNew ? "/workspace?setup=1" : "/workspace";
            }}
          />
        </Suspense>
      )}
    </ExperienceBoundary>
  );
}
