import { afterEach, describe, expect, it, vi } from "vitest";
import { history, quote } from "./nasdaq.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Nasdaq asset-class fallback", () => {
  it("retries an ETF quote when the stocks endpoint rejects its payload", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("assetclass=stocks")) {
        return new Response(JSON.stringify({ data: null }), { status: 200 });
      }
      if (url.includes("/summary?")) {
        return new Response(JSON.stringify({ data: { summaryData: {} } }), { status: 200 });
      }
      return new Response(JSON.stringify({
        data: {
          companyName: "JPMorgan Equity Premium Income ETF",
          exchange: "NYSE Arca",
          primaryData: {
            lastSalePrice: "$59.50",
            previousClose: "$59.00",
            netChange: "$0.50",
            percentageChange: "+0.85%",
            volume: "123456",
          },
          keyStats: {},
        },
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await quote("JEPI");

    expect(result.price).toBe(59.5);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("assetclass=stocks"))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("assetclass=etf"))).toBe(true);
  });

  it("retries ETF history when the stocks endpoint rejects its payload", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("assetclass=stocks")) {
        return new Response(JSON.stringify({ data: null }), { status: 200 });
      }
      return new Response(JSON.stringify({
        data: {
          chart: [{
            x: 1_725_984_000_000,
            z: { open: "$200.00", high: "$205.00", low: "$199.00", close: "$204.00", volume: "1000" },
          }],
        },
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await history("SMH", "1Y");

    expect(result).toHaveLength(1);
    expect(result[0].close).toBe(204);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("assetclass=stocks"))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("assetclass=etf"))).toBe(true);
  });
});
