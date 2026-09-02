import React, { Component } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

class GlobalErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Global React error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "2rem", color: "#fff", background: "#0A0C14", minHeight: "100vh", fontFamily: "sans-serif", textAlign: "center" }}>
          <h2 style={{ color: "#E9B213", marginBottom: "1rem" }}>NimStreak Error</h2>
          <p style={{ color: "#94A3B8", marginBottom: "1.5rem" }}>{this.state.error?.message || "An unexpected error occurred while loading NimStreak."}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ padding: "10px 24px", background: "#E9B213", color: "#0A0C14", border: "none", borderRadius: "12px", fontWeight: "bold", cursor: "pointer" }}
          >
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </React.StrictMode>,
);
