import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Activity, ArrowLeft, Check, Clock3, ShieldAlert, Timer, TrendingDown, TrendingUp } from "lucide-react";
import "./signal-result.css";
import { clearActiveSignal, readActiveSignal, type ActiveSignal } from "./signal-flow";

function formatTimeLeft(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatGeneratedAt(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(timestamp);
}

function SimulatedCandles({ direction }: { direction: ActiveSignal["direction"] }) {
  const isUp = direction === "UP";
  const candles: [number, number, number, number][] = isUp
    ? [
        [17, 92, 28, 42], [36, 78, 23, 35], [55, 92, 31, 45], [74, 65, 29, 32], [93, 71, 31, 46],
        [112, 55, 30, 35], [131, 61, 24, 43], [150, 43, 27, 32], [169, 48, 24, 36], [188, 29, 29, 38],
        [207, 36, 22, 30], [226, 22, 25, 35], [245, 27, 20, 29], [264, 10, 30, 36],
      ]
    : [
        [17, 13, 28, 42], [36, 26, 23, 35], [55, 23, 31, 45], [74, 45, 29, 32], [93, 41, 31, 46],
        [112, 60, 30, 35], [131, 57, 24, 43], [150, 74, 27, 32], [169, 67, 24, 36], [188, 88, 29, 38],
        [207, 81, 22, 30], [226, 101, 25, 35], [245, 94, 20, 29], [264, 111, 30, 36],
      ];
  const rising = "#1cff6a";
  const falling = "#ff3047";
  return (
    <svg className="sr-candles" viewBox="0 0 286 145" preserveAspectRatio="none" role="img" aria-label={`Decorative simulated ${isUp ? "upward" : "downward"} candlestick illustration`}>
      {[25, 55, 85, 115].map((y) => <line key={y} className="gridline" x1="0" y1={y} x2="286" y2={y} />)}
      {[48, 96, 144, 192, 240].map((x) => <line key={x} className="gridline" x1={x} y1="0" x2={x} y2="145" />)}
      <path className="trend" d={isUp ? "M10 108 C70 95 95 79 140 66 S220 36 273 14" : "M10 18 C70 32 95 55 140 66 S220 99 273 126"} />
      <path className="sr-flow-arrow" d={isUp ? "M151 123 C184 106 213 79 231 39" : "M151 20 C183 38 213 68 231 108"} />
      <path className="sr-flow-arrow-head" d={isUp ? "M212 44 L236 19 L246 54 Z" : "M212 101 L239 130 L247 91 Z"} />
      {candles.map(([x, y, height, wick], index) => {
        const positive = index % 3 !== 1;
        const color = positive ? rising : falling;
        return (
          <g key={`${x}-${y}`}>
            <line className="wick" x1={x + 5} y1={y - 5} x2={x + 5} y2={y + wick} stroke={color} />
            <rect className="body" x={x} y={y} width="10" height={height} fill={color} stroke={color} />
          </g>
        );
      })}
    </svg>
  );
}

export default function SignalResult() {
  const [, setLocation] = useLocation();
  const [signal] = useState<ActiveSignal | null>(() => readActiveSignal());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!signal) return;
    if (signal.expiresAt <= Date.now()) {
      clearActiveSignal();
      setLocation("/signal-generator");
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [signal, setLocation]);

  const remaining = signal ? Math.max(0, signal.expiresAt - now) : 0;
  useEffect(() => {
    if (!signal || remaining > 0) return;
    clearActiveSignal();
    setLocation("/signal-generator");
  }, [remaining, signal, setLocation]);

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
          {signal && remaining > 0 ? (
            <>
              <div className="sr-intro">
                <div className="sr-overline"><i /> SIGNAL LAB <span> / 09</span></div>
                <h1 className="sr-title">Signal<br /><em>result.</em></h1>
                <p className="sr-subtitle">Your generated direction and expiry countdown are ready.</p>
              </div>
              <article className={`sr-card ${isUp ? "up" : "down"}`} aria-live="polite" data-testid="card-signal-result">
                <div className="sr-card-head">
                  <div className="sr-direction-label">
                    <span className="sr-direction-mark"><Check size={23} strokeWidth={3} /></span>
                    <span data-testid="text-signal-direction">{isUp ? "UP SIGNAL" : "DOWN SIGNAL"}</span>
                  </div>
                  <div className="sr-expiry-pill"><Clock3 size={15} /> {signal.timeframe} trade</div>
                </div>

                <div className="sr-body">
                  <div className="sr-chart">
                    <div className="sr-chart-top"><span data-testid="text-chart-market">{signal.market}</span><span className="sr-demo-tag" data-testid="label-demo-feed">DEMO FEED</span></div>
                    <SimulatedCandles direction={signal.direction} />
                  </div>
                  <div className="sr-meta">
                    <div className="sr-meta-row">
                      <Activity className="sr-meta-icon" size={18} />
                      <div><span>Broker display</span><b data-testid="text-result-broker">{signal.broker}</b></div>
                    </div>
                    <div className="sr-meta-row">
                      <TrendingUp className="sr-meta-icon" size={18} />
                      <div><span>Market</span><b data-testid="text-result-market">{signal.market}</b></div>
                    </div>
                    <div className="sr-meta-row">
                      <Timer className="sr-meta-icon" size={18} />
                      <div><span>Timeframe</span><b data-testid="text-result-timeframe">{signal.timeframe}</b></div>
                    </div>
                    <div className="sr-meta-row">
                      {isUp ? <TrendingUp className="sr-meta-icon" size={18} /> : <TrendingDown className="sr-meta-icon" size={18} />}
                      <div><span>Direction</span><b data-testid="text-result-direction">{signal.direction}</b></div>
                    </div>
                  </div>
                </div>

                <div className="sr-expiry">
                  <Timer className="sr-expiry-icon" size={26} />
                  <div className="sr-expiry-copy">
                    <span>Trade expiry in</span>
                    <strong className="sr-countdown" data-testid="text-time-remaining" aria-label={`${Math.ceil(remaining / 1000)} seconds remaining`}>{formatTimeLeft(remaining)}</strong>
                    <small>({signal.timeframe} interval)</small>
                  </div>
                </div>

                <div className="sr-card-foot">
                  <span className="sr-generated" data-testid="text-generated-at">GENERATED {formatGeneratedAt(signal.generatedAt)}</span>
                  <button className="sr-return" type="button" aria-label="Good Luck — return to generator" title="Return to generator" data-testid="button-return-generator" onClick={returnToGenerator}>
                    {isUp ? <TrendingUp size={19} /> : <TrendingDown size={19} />}
                    <span>Good Luck!</span>
                  </button>
                </div>
              </article>
            </>
          ) : (
            <div className="sr-empty">
              <div className="sr-empty-mark"><Activity size={25} /></div>
              <div className="sr-overline" style={{ justifyContent: "center" }}><i /> SIGNAL LAB</div>
              <h1>No active signal</h1>
              <p>There is no unexpired generated result in this session. Return to the generator to create a new direction.</p>
              <button className="sr-return" type="button" data-testid="button-return-generator" onClick={returnToGenerator}><ArrowLeft size={15} /> Return to generator</button>
              <p className="sr-notice" data-testid="notice-result-demo" style={{ justifyContent: "center" }}><ShieldAlert size={14} /> Local demo only. Not connected to live markets or broker orders.</p>
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
