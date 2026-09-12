"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import { apiGet, type Candle } from "../../lib/api";
import { calculateBossBuyZone, type BossZoneStatus } from "../../lib/bossBuyZone";
import { useWidgetSymbol, type WidgetInstance } from "../../store/terminal";

type MacroData = { vix: number | null; vixSource?: string | null };

const STATUS_STYLE: Record<BossZoneStatus, string> = {
  NORMAL: "text-[var(--up)] border-[var(--up)]",
  WATCH: "text-[#ffd966] border-[#ffd966]",
  "BUY ZONE": "text-[var(--amber)] border-[var(--amber)]",
  "BOSS BUY ZONE": "text-[var(--down)] border-[var(--down)]",
};

export default function BossBuyZoneWidget({ widget }: { widget: WidgetInstance }) {
  const symbol = useWidgetSymbol(widget);
  const macro = useQuery({
    queryKey: ["macro"],
    queryFn: () => apiGet<MacroData>("/api/macro"),
    refetchInterval: 30_000,
  });
  const histories = useQueries({
    queries: ["SPY", "QQQ", symbol].map((ticker) => ({
      queryKey: ["history", ticker, "1Y"],
      queryFn: () => apiGet<Candle[]>(`/api/history/${encodeURIComponent(ticker)}?range=1Y`),
      refetchInterval: 60_000,
    })),
  });

  const queries = [macro, ...histories];
  const hasData = Boolean(macro.data || histories.some((q) => q.data));
  const isLoading = queries.some((q) => q.isPending);
  const failures = [
    macro.error ? "VIX" : null,
    histories[0].error ? "S&P 500" : null,
    histories[1].error ? "Nasdaq" : null,
    histories[2].error ? symbol : null,
  ].filter((label): label is string => label !== null);

  if (!hasData && isLoading) return <div className="p-2 dim">Calculating market stress…</div>;
  if (!hasData) return <div className="p-2 down">Market data is temporarily unavailable.</div>;

  const result = calculateBossBuyZone(
    macro.data?.vix ?? null,
    histories[0].data ?? [],
    histories[1].data ?? [],
    histories[2].data ?? [],
  );

  return (
    <div className="p-2">
      <div className={`border px-3 py-2 text-center ${STATUS_STYLE[result.status]}`}>
        <div className="text-[10px] tracking-[0.2em] dim">MARKET STRESS SCORE</div>
        <div className="text-3xl leading-tight">{result.score}</div>
        <div className="text-sm font-bold tracking-[0.12em]">{result.status}</div>
      </div>
      <div className="relative mt-2 h-3 text-[10px] dim">
        <span className="absolute left-0">NORMAL</span>
        <span className="absolute left-[20%] -translate-x-1/2">WATCH</span>
        <span className="absolute left-[40%] -translate-x-1/2">BUY</span>
        <span className="absolute left-[65%] -translate-x-1/2">BOSS</span>
      </div>
      <div className="mt-1 h-1 bg-[#222]">
        <div className="h-full bg-[var(--amber)] transition-all" style={{ width: `${result.score}%` }} />
      </div>
      <table className="data-table mt-2">
        <thead><tr><th>Signal</th><th>Value</th><th>Score</th></tr></thead>
        <tbody>
          {result.metrics.map((metric) => (
            <tr key={metric.label}>
              <td>{metric.label}</td>
              <td>{metric.display}</td>
              <td className={metric.points ? "amber" : "dim"}>{metric.points}/{metric.maxPoints}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 text-[10px] dim leading-relaxed">
        {symbol} technical stress is combined with broad-market fear. This is an accumulation signal, not an automatic order.
      </div>
      {macro.data?.vixSource && (
        <div className="mt-1 text-[9px] dim">VIX source: {macro.data.vixSource === "fred" ? "FRED (previous close)" : "live market quote"}</div>
      )}
      {failures.length > 0 && (
        <div className="mt-1 text-[10px] text-[#ffd966]">
          Partial score — unavailable: {failures.join(", ")}. Available signals remain visible.
        </div>
      )}
    </div>
  );
}
