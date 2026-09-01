import { Component, type ReactNode } from 'react';

interface State {
  failed: boolean;
  code: string | null;
  copied: boolean;
}

/**
 * Last line of defense for the whole interface: a render crash anywhere
 * lands here instead of a white window. The error is logged main-side under
 * a stable short code the user can read off the screen and report.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false, code: null, copied: false };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(error: Error): void {
    void window.hq
      .reportError({ message: error.message, stack: error.stack, area: 'react' })
      .then((code) => this.setState({ code }))
      .catch(() => {
        // Logging is best-effort; the screen still offers reload.
      });
  }

  private copyReport = (): void => {
    void window.hq
      .getDiagnostics()
      .then((text) => navigator.clipboard.writeText(text))
      .then(() => {
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 2000);
      })
      .catch(() => {
        // Clipboard can be denied; the button just stays unchanged.
      });
  };

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="err-screen">
        <div className="err-panel">
          <div className="err-kicker">Technical difficulties</div>
          <div className="err-head">The dashboard hit an error.</div>
          <p>
            Your save is untouched — the app only ever reads it. Reload to pick up where you left
            off.
          </p>
          {this.state.code && (
            <p>
              If this keeps happening, report code <span className="err-code">{this.state.code}</span>{' '}
              — it points straight at the failure.
            </p>
          )}
          <div className="err-actions">
            <button className="btn primary" onClick={() => window.location.reload()}>
              Reload
            </button>
            <button className="btn" onClick={this.copyReport}>
              {this.state.copied ? 'Copied' : 'Copy report'}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
