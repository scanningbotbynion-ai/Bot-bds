import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Activity, ArrowLeft, ShieldAlert, TrendingDown, TrendingUp } from "lucide-react";
import "./signal-result.css";
import { clearActiveSignal, readActiveSignal, type ActiveSignal } from "./signal-flow";

export default function SignalResult() {
  const [, setLocation] = useLocation();
  const [signal] = useState<ActiveSignal | null>(() => readActiveSignal());

  useEffect(() => {
    if (!signal) return;
    const remaining = signal.expiresAt - Date.now();
    if (remaining <= 0) {
      clearActiveSignal();
      setLocation("/signal-generator");
      return;
    }
    const timer = window.setTimeout(() => {
      clearActiveSignal();
      setLocation("/signal-generator");
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [signal, setLocation]);

  function returnToGenerator() {
    clearActiveSignal();
    setLocation("/signal-generator");
  }

  const isUp = signal?.direction === "UP";

  return (
    <main className="sr-page">
      <div className="sr-shell">
        <header className="sr-topbar">
          <div className="sr-brand">
            <span className="sr-brand-mark"><Activity size={19} strokeWidth={2.2} /></span>
            <span>CHINESE <b>AUTO BOT</b></span>
          </div>
        </header>

        <section className="sr-layout" aria-label="Signal result">
          {signal && signal.expiresAt > Date.now() ? (
            <article className={`sr-card ${isUp ? "up" : "down"}`} aria-live="polite" data-testid="card-signal-result">
              <div className="sr-direction-only">
                <span className="sr-next-label">NEXT CANDLE</span>
                <span className="sr-direction-mark" aria-hidden="true">
                  {isUp ? <TrendingUp size={38} strokeWidth={2.7} /> : <TrendingDown size={38} strokeWidth={2.7} />}
                </span>
                <strong className="sr-direction-value" data-testid="text-signal-direction">{signal.direction}</strong>
                <span className="sr-direction-caption">DIRECTION</span>
                <p className="sr-notice" data-testid="notice-result-demo">
                  <ShieldAlert size={14} /> Simulated direction only · No live market feed or broker connection.
                </p>
              </div>
              <div className="sr-card-foot">
                <button className="sr-return" type="button" aria-label="Generate another direction" title="Return to generator" data-testid="button-return-generator" onClick={returnToGenerator}>
                  <ArrowLeft size={18} />
                  <span>Generate again</span>
                </button>
              </div>
            </article>
          ) : (
            <div className="sr-empty">
              <div className="sr-empty-mark"><Activity size={25} /></div>
              <div className="sr-overline" style={{ justifyContent: "center" }}><i /> SIGNAL LAB</div>
              <h1>No active signal</h1>
              <p>There is no active simulated direction. Return to the generator to create one.</p>
              <button className="sr-return" type="button" data-testid="button-return-generator" onClick={returnToGenerator}><ArrowLeft size={15} /> Return to generator</button>
              <p className="sr-notice" data-testid="notice-result-demo" style={{ justifyContent: "center" }}><ShieldAlert size={14} /> Simulated direction only · No live market feed or broker connection.</p>
            </div>
          )}
        </section>

        <footer className="sr-footer">
          <span>CHINESE AUTO BOT <i>/</i> SIGNAL RESULT</span>
        </footer>
      </div>
    </main>
  );
}
