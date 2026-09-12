import type { Candle } from "./api";
import { ema, rsi } from "./indicators";

export type BossZoneStatus = "NORMAL" | "WATCH" | "BUY ZONE" | "BOSS BUY ZONE";

export type BossZoneMetric = {
  label: string;
  value: number | null;
  display: string;
  points: number;
  maxPoints: number;
};

export type BossZoneResult = {
  score: number;
  status: BossZoneStatus;
  metrics: BossZoneMetric[];
};

const last = <T>(values: T[]): T | undefined => values[values.length - 1];

function drawdown(candles: Candle[]): number | null {
  if (!candles.length) return null;
  const peak = Math.max(...candles.map((c) => c.close));
  return peak > 0 ? ((last(candles)!.close / peak) - 1) * 100 : null;
}

function drawdownPoints(value: number | null, maxPoints: number): number {
  if (value === null) return 0;
  // A routine 5% pullback counts lightly; stress accelerates after a 10% correction.
  // The intentionally nonlinear ramp avoids declaring a buy zone on ordinary noise.
  if (value <= -20) return maxPoints;
  if (value <= -15) return Math.round(maxPoints * 0.8);
  if (value <= -10) return Math.round(maxPoints * 0.6);
  if (value <= -5) return Math.round(maxPoints * 0.32);
  return 0;
}

function vixPoints(vix: number | null): number {
  if (vix === null) return 0;
  if (vix >= 40) return 35;
  if (vix >= 30) return 30;
  if (vix >= 25) return 20;
  if (vix >= 20) return 10;
  return 0;
}

function statusFor(score: number): BossZoneStatus {
  if (score >= 65) return "BOSS BUY ZONE";
  if (score >= 40) return "BUY ZONE";
  if (score >= 20) return "WATCH";
  return "NORMAL";
}

export function calculateBossBuyZone(
  vix: number | null,
  spy: Candle[],
  qqq: Candle[],
  symbol: Candle[],
): BossZoneResult {
  const spyDrawdown = drawdown(spy);
  const qqqDrawdown = drawdown(qqq);
  const latest = last(symbol)?.close ?? null;
  const latestRsi = last(rsi(symbol, 14))?.value ?? null;
  const ema20 = last(ema(symbol, 20))?.value ?? null;
  const ema50 = last(ema(symbol, 50))?.value ?? null;
  const ema200 = last(ema(symbol, 200))?.value ?? null;
  const supportWindow = symbol.slice(-60);
  const support = supportWindow.length ? Math.min(...supportWindow.map((c) => c.low)) : null;
  const supportDistance = latest !== null && support !== null && support > 0
    ? ((latest / support) - 1) * 100
    : null;

  const rsiPoints = latestRsi === null ? 0 : latestRsi <= 30 ? 7 : latestRsi <= 37 ? 5 : latestRsi <= 45 ? 2 : 0;
  const trendPoints = latest === null ? 0
    : (ema20 !== null && latest < ema20 ? 2 : 0)
      + (ema50 !== null && latest < ema50 ? 3 : 0)
      + (ema200 !== null && latest < ema200 ? 2 : 0);
  const supportPoints = supportDistance === null ? 0
    : supportDistance <= 2 ? 6 : supportDistance <= 5 ? 4 : supportDistance <= 10 ? 2 : 0;

  const metrics: BossZoneMetric[] = [
    { label: "VIX", value: vix, display: vix === null ? "—" : vix.toFixed(1), points: vixPoints(vix), maxPoints: 35 },
    { label: "S&P 500 drawdown", value: spyDrawdown, display: spyDrawdown === null ? "—" : `${spyDrawdown.toFixed(1)}%`, points: drawdownPoints(spyDrawdown, 25), maxPoints: 25 },
    { label: "Nasdaq drawdown", value: qqqDrawdown, display: qqqDrawdown === null ? "—" : `${qqqDrawdown.toFixed(1)}%`, points: drawdownPoints(qqqDrawdown, 20), maxPoints: 20 },
    { label: "RSI (14)", value: latestRsi, display: latestRsi === null ? "—" : latestRsi.toFixed(1), points: rsiPoints, maxPoints: 7 },
    { label: "Below EMA 20/50/200", value: trendPoints, display: `${trendPoints}/7`, points: trendPoints, maxPoints: 7 },
    { label: "60D support distance", value: supportDistance, display: supportDistance === null ? "—" : `+${supportDistance.toFixed(1)}%`, points: supportPoints, maxPoints: 6 },
  ];
  const score = Math.min(100, metrics.reduce((sum, metric) => sum + metric.points, 0));
  return { score, status: statusFor(score), metrics };
}
