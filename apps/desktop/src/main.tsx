import { Component, StrictMode, useEffect } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { reportFrontendReady } from "./services/platform";
import { errorMessage, errorStack } from "./utils/errors";
import "./styles.css";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return {
      error: error instanceof Error ? error : new Error(errorMessage(error)),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Burrowise frontend crashed", error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const diagnostic = errorStack(error);
    return (
      <main className="fatal-error-state">
        <section>
          <p>Burrowise could not open</p>
          <h1>The interface hit an unexpected error.</h1>
          <span>
            Your brain folder has not been deleted or reset. Reload the
            interface first; if the problem returns, copy the diagnostic below.
          </span>
          <pre>{diagnostic}</pre>
          <div>
            <button onClick={() => window.location.reload()}>
              Reload interface
            </button>
            <button
              onClick={() => navigator.clipboard?.writeText(diagnostic)}
            >
              Copy diagnostic
            </button>
          </div>
        </section>
      </main>
    );
  }
}

function NativeStartupProbe() {
  useEffect(() => {
    reportFrontendReady().catch((error) =>
      console.error("Native startup probe failed", error),
    );
  }, []);

  return <App />;
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("The root application element is missing.");

const root =
  globalThis.__SECOND_BRAIN_REACT_ROOT__ || createRoot(rootElement);
globalThis.__SECOND_BRAIN_REACT_ROOT__ = root;

root.render(
  <StrictMode>
    <AppErrorBoundary>
      <NativeStartupProbe />
    </AppErrorBoundary>
  </StrictMode>,
);
