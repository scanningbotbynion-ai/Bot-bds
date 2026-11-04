import { useState } from "react";
import { useLocation } from "wouter";
import { Activity, ArrowUpRight, BarChart3, ChevronDown, Zap } from "lucide-react";
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
        </header>

        <section className="signal-layout" aria-label="Signal generator">
          <div className="signal-main">
            <div className="signal-heading">
              <div className="signal-overline"><span /> SIGNAL LAB <span className="signal-overline-rule" /></div>
              <h1>Chinese Signal<br /><em>Generator</em></h1>
              <p>Generate a demo trading signal</p>
            </div>

            <section className="signal-panel">
              <div className="signal-panel-title">
                <div><span className="signal-index">01</span><h2>Configure signal</h2></div>
              </div>

              <div className="signal-field">
                <label className="signal-label" htmlFor="signal-broker">Select Broker</label>
                <div className="signal-select-wrap signal-select-blue">
                  <Activity size={17} aria-hidden="true" />
                  <select id="signal-broker" data-testid="select-broker" value={broker} onChange={(event) => setBroker(event.target.value as Broker)}>
                    {brokerOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                  <ChevronDown size={19} aria-hidden="true" />
                </div>
              </div>

              <div className="signal-field">
                <label className="signal-label" htmlFor="signal-market">Trading Asset</label>
                <div className="signal-select-wrap signal-select-blue">
                  <BarChart3 size={16} aria-hidden="true" />
                    <select id="signal-market" data-testid="select-market" value={market} onChange={(event) => setMarket(event.target.value as Market)}>
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
                      data-testid={`button-timeframe-${item}`}
                      onClick={() => setTimeframe(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </fieldset>

              <button className="signal-generate" type="button" data-testid="button-generate-signal" onClick={generateSignal}>
                <Zap size={17} fill="currentColor" />
                Generate signal
                <span><ArrowUpRight size={17} /></span>
              </button>
              {error && <p className="signal-generator-error" data-testid="status-generator-error" role="alert">{error}</p>}
              <p className="signal-generator-note" data-testid="notice-demo-status"><i /> DEMO FEED · Local simulation, no live market connection</p>
            </section>
          </div>

          <div className="signal-bottom-art" aria-hidden="true">
            <svg viewBox="0 0 420 150" preserveAspectRatio="none">
              <defs>
                <linearGradient id="generator-chart-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#16ff65" stopOpacity=".22" />
                  <stop offset="1" stopColor="#16ff65" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[38, 76, 114].map((y) => <line key={`h-${y}`} className="signal-art-grid" x1="0" y1={y} x2="420" y2={y} />)}
              {[52, 104, 156, 208, 260, 312, 364].map((x) => <line key={`v-${x}`} className="signal-art-grid" x1={x} y1="0" x2={x} y2="150" />)}
              <path className="signal-art-area" d="M0 119 L28 101 51 114 77 82 101 92 127 67 152 81 177 58 202 68 229 46 252 57 279 35 304 50 331 24 357 39 384 12 420 20 V150 H0 Z" />
              <path className="signal-art-trend" d="M0 119 L28 101 51 114 77 82 101 92 127 67 152 81 177 58 202 68 229 46 252 57 279 35 304 50 331 24 357 39 384 12 420 20" />
              {[
                [16, 105, 18, "#16ff65"], [42, 107, 22, "#ff3047"], [69, 88, 20, "#16ff65"],
                [96, 85, 27, "#16ff65"], [123, 73, 23, "#ff3047"], [151, 65, 27, "#16ff65"],
                [178, 61, 20, "#16ff65"], [205, 56, 26, "#ff3047"], [232, 45, 24, "#16ff65"],
                [259, 42, 25, "#16ff65"], [286, 32, 23, "#ff3047"], [313, 27, 27, "#16ff65"],
                [340, 20, 24, "#16ff65"], [367, 13, 25, "#ff3047"], [394, 8, 22, "#16ff65"],
              ].map(([x, y, h, color], index) => (
                <g key={index} className="signal-art-candle" style={{ color: String(color) }}>
                  <line x1={Number(x) + 5} y1={Number(y) - 8} x2={Number(x) + 5} y2={Number(y) + Number(h) + 8} />
                  <rect x={Number(x)} y={Number(y)} width="10" height={Number(h)} />
                </g>
              ))}
              <ellipse className="signal-art-orbit" cx="202" cy="137" rx="80" ry="8" />
              <ellipse className="signal-art-orbit" cx="202" cy="137" rx="56" ry="5" />
            </svg>
            <span>SIMULATED SIGNAL PREVIEW</span>
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
              <p>A generated direction and expiry timer open on the next page.</p>
              <div className="signal-empty-meta"><span>Broker</span><b data-testid="text-output-broker">{broker}</b></div>
              <div className="signal-empty-meta"><span>Market</span><b data-testid="text-output-market">{market}</b></div>
              <div className="signal-empty-meta"><span>Interval</span><b data-testid="text-output-timeframe">{timeframe}</b></div>
            </div>
          </aside>
        </section>

        <footer className="signal-footer">
          <span>CHINESE AUTO BOT <i> / </i> SIGNAL GENERATOR</span>
        </footer>
      </div>
    </main>
  );
}
