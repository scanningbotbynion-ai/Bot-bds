import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Activity, ArrowDownRight, ArrowLeft, ArrowUpRight, Clock3, ShieldAlert, Timer, TrendingDown, TrendingUp } from "lucide-react";
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
  const rising = "#76f49b";
  const falling = "#ff7480";
  return (
    <svg className="sr-candles" viewBox="0 0 286 145" role="img" aria-label={`Decorative simulated ${isUp ? "upward" : "downward"} candlestick illustration`}>
      {[25, 55, 85, 115].map((y) => <line key={y} className="gridline" x1="0" y1={y} x2="286" y2={y} />)}
      {[48, 96, 144, 192, 240].map((x) => <line key={x} className="gridline" x1={x} y1="0" x2={x} y2="145" />)}
      <path className="trend" d={isUp ? "M10 108 C70 95 95 79 140 66 S220 36 273 14" : "M10 18 C70 32 95 55 140 66 S220 99 273 126"} />
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
          <div className="sr-demo-badge"><i /> DEMO CONSOLE</div>
        </header>

        <section className="sr-layout" aria-label="Signal result">
          {signal && remaining > 0 ? (
            <>
              <div className="sr-intro">
                <div className="sr-overline"><i /> SIGNAL LAB <span> / 09</span></div>
                <h1 className="sr-title">Signal<br /><em>result.</em></h1>
                <p className="sr-subtitle">Your generated direction is ready. This result is a local simulation, not a live market reading.</p>
                <div className="sr-sim-tag"><Activity size={13} /> SIMULATED OUTPUT · NO BROKER CONNECTED</div>
              </div>
              <article className={`sr-card ${isUp ? "up" : "down"}`} aria-live="polite">
                <div className="sr-card-head">
                  <div className="sr-direction-label">
                    <span className="sr-direction-mark">{isUp ? <ArrowUpRight size={21} /> : <ArrowDownRight size={21} />}</span>
                    {isUp ? "UP SIGNAL" : "DOWN SIGNAL"}
                  </div>
                  <div className="sr-expiry-pill"><Clock3 size={14} /> {signal.timeframe} interval</div>
                </div>

                <div className="sr-body">
                  <div className="sr-chart">
                    <div className="sr-chart-top"><span>ILLUSTRATION / NOT DATA</span><span>{signal.market}</span></div>
                    <SimulatedCandles direction={signal.direction} />
                    <div className="sr-chart-caption">Decorative simulated candlesticks · no market feed</div>
                  </div>
                  <div className="sr-meta">
                    <div className="sr-meta-row">
                      <Activity className="sr-meta-icon" size={18} />
                      <div><span>Broker display</span><b>{signal.broker}</b></div>
                    </div>
                    <div className="sr-meta-row">
                      <TrendingUp className="sr-meta-icon" size={18} />
                      <div><span>Market</span><b>{signal.market}</b></div>
                    </div>
                    <div className="sr-meta-row">
                      <Timer className="sr-meta-icon" size={18} />
                      <div><span>Timeframe</span><b>{signal.timeframe}</b></div>
                    </div>
                    <div className="sr-meta-row">
                      {isUp ? <TrendingUp className="sr-meta-icon" size={18} /> : <TrendingDown className="sr-meta-icon" size={18} />}
                      <div><span>Direction</span><b>{signal.direction}</b></div>
                    </div>
                  </div>
                </div>

                <div className="sr-expiry">
                  <Timer className="sr-expiry-icon" size={26} />
                  <div className="sr-expiry-copy">
                    <span>Time remaining to expiry</span>
                    <strong className="sr-countdown" aria-label={`${Math.ceil(remaining / 1000)} seconds remaining`}>{formatTimeLeft(remaining)}</strong>
                    <small>Timer follows the original generated expiry</small>
                  </div>
                </div>

                <div className="sr-card-foot">
                  <span className="sr-generated">GENERATED {formatGeneratedAt(signal.generatedAt)}</span>
                  <button className="sr-return" type="button" onClick={returnToGenerator}><ArrowLeft size={15} /> Return to generator</button>
                </div>
                <p className="sr-notice"><ShieldAlert size={14} /> Simulated output only. Not live financial advice. No broker is connected and no order has been placed.</p>
              </article>
            </>
          ) : (
            <div className="sr-empty">
              <div className="sr-empty-mark"><Activity size={25} /></div>
              <div className="sr-overline" style={{ justifyContent: "center" }}><i /> SIGNAL LAB</div>
              <h1>No active signal</h1>
              <p>There is no unexpired generated result in this session. Return to the generator to create a new simulated direction.</p>
              <button className="sr-return" type="button" onClick={returnToGenerator}><ArrowLeft size={15} /> Return to generator</button>
              <p className="sr-notice" style={{ justifyContent: "center" }}><ShieldAlert size={14} /> Simulation only · No broker connected · Not financial advice</p>
            </div>
          )}
        </section>

        <footer className="sr-footer">
          <span>CHINESE AUTO BOT <i>/</i> SIGNAL RESULT</span>
          <p>Simulated output · Not connected to live markets or a broker · Not financial advice</p>
        </footer>
      </div>
    </main>
  );
}
