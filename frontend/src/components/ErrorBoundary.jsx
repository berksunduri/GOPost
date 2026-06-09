import React, { Component } from "react";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          color: "red", padding: 20, background: "#0d1117",
          fontFamily: "monospace", fontSize: 13, whiteSpace: "pre-wrap",
          minHeight: "100vh"
        }}>
          <h2 style={{color: "#f85149"}}>App Crashed</h2>
          <p>{this.state.error?.message}</p>
          <pre style={{color: "#8b949e", marginTop: 10, fontSize: 11}}>
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
