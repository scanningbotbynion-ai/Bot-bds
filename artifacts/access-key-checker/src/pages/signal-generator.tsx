import { useState } from "react";
import { useLocation } from "wouter";
import { Activity, ArrowUpRight, BarChart3, Check, ChevronDown, Radio, Zap } from "lucide-react";
import "./signal-generator.css";
import {
  brokerOptions,
  marketOptions,
  readSignalSettings,
  saveActiveSignal,
  saveSignalSettings,
  timeframeDurationSeconds,
  timeframeOptions,
  type Broker,
  type Market,
  type SignalDirection,
  type Timeframe,
} from "./signal-flow";

export default function SignalGenerator() {
  const [, setLocation] = useLocation();
  const [savedSettings] = useState(() => readSignalSettings());
  const [broker, setBroker] = useState<Broker>(savedSettings?.broker ?? "Quotex");
  const [market, setMarket] = useState<Market>(savedSettings?.market ?? "USD/PKR (OTC)");
  const [timeframe, setTimeframe] = useState<Timeframe>(savedSettings?.timeframe ?? "15s");
  const [error, setError] = useState("");

  function generateSignal() {
    const direction: SignalDirection = Math.random() < 0.5 ? "UP" : "DOWN";
    const generatedAt = Date.now();
    const settings = { broker, market, timeframe };
    try {
      saveSignalSettings(settings);
      saveActiveSignal({
        ...settings,
        direction,
        generatedAt,
        expiresAt: generatedAt + timeframeDurationSeconds(timeframe) * 1000,
      });
      setError("");
      setLocation("/signal-result");
    } catch {
      setError("Could not start the signal timer. Please try again.");
    }
  }

  return (
    <main className="signal-page">
      <div className="signal-shell">
        <header className="signal-topbar">
          <div className="signal-brand">
            <span className="signal-brand-mark"><Activity size={19} strokeWidth={2.2} /></span>
            <span>CHINESE <b>AUTO BOT</b></span>
          </div>
          <div className="signal-demo-badge"><i /> DEMO CONSOLE</div>
        </header>

        <section className="signal-layout" aria-label="Signal generator">
          <div className="signal-main">
            <div className="signal-heading">
              <div className="signal-overline"><span /> SIGNAL LAB <span className="signal-overline-rule" /></div>
              <h1>Signal<br /><em>generator.</em></h1>
              <p>Configure a setup. Generate a simulated direction.</p>
            </div>

            <section className="signal-panel">
              <div className="signal-panel-title">
                <div><span className="signal-index">01</span><h2>Configure signal</h2></div>
                <span className="signal-local-tag"><Radio size={13} /> LOCAL SIMULATION</span>
              </div>

              <div className="signal-field">
                <span className="signal-label" id="signal-broker-label">Broker display</span>
                <div className="signal-broker-options" role="group" aria-labelledby="signal-broker-label">
                  {brokerOptions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={`signal-broker-option ${broker === item ? "selected" : ""}`}
                      aria-pressed={broker === item}
                      onClick={() => setBroker(item)}
                    >
                      <span className="signal-option-check">{broker === item && <Check size={12} />}</span>
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <div className="signal-field">
                <label className="signal-label" htmlFor="signal-market">Market</label>
                <div className="signal-select-wrap">
                  <BarChart3 size={16} aria-hidden="true" />
                  <select id="signal-market" value={market} onChange={(event) => setMarket(event.target.value as Market)}>
                    {marketOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                  <ChevronDown size={16} aria-hidden="true" />
                </div>
                <p className="signal-field-hint">20 selectable markets · regular and OTC versions</p>
              </div>

              <fieldset className="signal-field signal-time-field">
                <legend className="signal-label">Timeframe</legend>
                <div className="signal-time-options">
                  {timeframeOptions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={`signal-time-option ${timeframe === item ? "selected" : ""}`}
                      aria-pressed={timeframe === item}
                      onClick={() => setTimeframe(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </fieldset>

              <button className="signal-generate" type="button" onClick={generateSignal}>
                <Zap size={17} fill="currentColor" />
                Generate signal
                <span><ArrowUpRight size={17} /></span>
              </button>
              {error && <p className="signal-generator-error" role="alert">{error}</p>}
              <p className="signal-generator-note">For exploration only. No broker connection or market feed.</p>
            </section>
          </div>

          <aside className="signal-output" aria-live="polite">
            <div className="signal-output-head">
              <span className="signal-index">02</span>
              <span>OUTPUT</span>
              <i className="active" />
            </div>
            <div className="signal-empty">
              <div className="signal-empty-mark"><Activity size={24} /></div>
              <span className="signal-empty-label">READY TO GENERATE</span>
              <p>A generated demo direction and expiry timer open on the next page.</p>
              <div className="signal-empty-meta"><span>Broker</span><b>{broker}</b></div>
              <div className="signal-empty-meta"><span>Market</span><b>{market}</b></div>
              <div className="signal-empty-meta"><span>Interval</span><b>{timeframe}</b></div>
            </div>
            <div className="signal-output-foot">
              <span>SESSION MODE</span><b><i /> SIMULATED</b>
            </div>
          </aside>
        </section>

        <footer className="signal-footer">
          <span>CHINESE AUTO BOT <i> / </i> SIGNAL GENERATOR</span>
          <p>Simulated demo output · Not connected to live markets or a broker · Not financial advice</p>
        </footer>
      </div>
    </main>
  );
}
