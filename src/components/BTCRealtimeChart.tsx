"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
  ColorType,
} from "lightweight-charts";
import { SIDE_SWAP_WS_URL, SIDE_SWAP_BASE_ASSET_ID, SIDE_SWAP_QUOTE_ASSET_ID } from "@/lib/config";

type Props = {
  percent?: number;
  symbol?: string; // e.g. "btcusdt"
  height?: number;
  showControls?: boolean; // kept for API parity; unused below
  onPrice?: (price: number) => void;
  showBullBearTriggers?: boolean; // New prop to control bull/bear trigger visibility
};

type TimePeriod = "1m" | "30m" | "1h" | "1d";

type CandleData = {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
};


const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

// No REST fetch; SideSwap daily candles are obtained via JSON-RPC WS below

const mergeBars = (newBars: CandleData[], existingBars: CandleData[]): CandleData[] => {
  const allBars = [...newBars, ...existingBars];
  const uniqueBars = new Map<UTCTimestamp, CandleData>();

  allBars.forEach(bar => {
    uniqueBars.set(bar.time, bar);
  });

  return Array.from(uniqueBars.values()).sort((a, b) => a.time - b.time);
};

const cacheBars = (symbol: string, bars: CandleData[], period: TimePeriod) => {
  try {
    localStorage.setItem(`btc_chart_${symbol}_${period}`, JSON.stringify({
      bars,
      timestamp: Date.now()
    }));
  } catch (error) {
    console.error('Failed to cache bars:', error);
  }
};

const getCachedBars = (symbol: string, period: TimePeriod): CandleData[] => {
  try {
    const cached = localStorage.getItem(`btc_chart_${symbol}_${period}`);
    if (!cached) return [];

    const data = JSON.parse(cached);
    const cacheAge = Date.now() - data.timestamp;

    // Cache is valid for 1 hour
    if (cacheAge > 60 * 60 * 1000) {
      localStorage.removeItem(`btc_chart_${symbol}_${period}`);
      return [];
    }

    return data.bars;
  } catch (error) {
    console.error('Failed to get cached bars:', error);
    return [];
  }
};

// No time range calculation needed; we derive visible range from returned candles

// No interval mapping; SideSwap provides daily candles only

// SideSwap asset IDs for BTC/USDT (from user-provided example)
const SIDESWAP_WS_URL = SIDE_SWAP_WS_URL;
const SIDESWAP_PAIR = {
  base: SIDE_SWAP_BASE_ASSET_ID,
  quote: SIDE_SWAP_QUOTE_ASSET_ID,
};

console.log("sideswap ===>", SIDESWAP_PAIR)

// Try to resolve base/quote asset ids from markets API for a given symbol like "BTC/USDT"
const resolveSideSwapPair = async (symbol: string): Promise<{ base: string; quote: string } | null> => {
  try {
    const res = await fetch('https://sideswap.io/api/markets');
    if (!res.ok) return null;
    const data = await res.json();
    const target = (symbol || '').toUpperCase();
    // Try common shapes
    // Shape A: array of markets with { asset_pair: { base, quote }, name/ticker/display }
    if (Array.isArray(data)) {
      for (const m of data) {
        const ap = (m && m.asset_pair) || (m && m.pair) || null;
        const label = (m && (m.ticker || m.name || m.display || m.display_name)) || '';
        if (ap && ap.base && ap.quote) {
          const lbl = String(label || `${m.base_symbol || ''}/${m.quote_symbol || ''}`).toUpperCase();
          if (lbl.includes(target) || lbl === target) {
            return { base: ap.base, quote: ap.quote };
          }
        }
      }
    }
    // Shape B: object with markets field
    if (data && Array.isArray(data.markets)) {
      for (const m of data.markets) {
        const ap = (m && m.asset_pair) || (m && m.pair) || null;
        const label = (m && (m.ticker || m.name || m.display || m.display_name)) || '';
        if (ap && ap.base && ap.quote) {
          const lbl = String(label || `${m.base_symbol || ''}/${m.quote_symbol || ''}`).toUpperCase();
          if (lbl.includes(target) || lbl === target) {
            return { base: ap.base, quote: ap.quote };
          }
        }
      }
    }
    return null;
  } catch (e) {
    console.warn('Failed to resolve SideSwap markets:', e);
    return null;
  }
};

// Fetch daily candles from SideSwap via JSON-RPC WS (returns daily candles)
const fetchSideSwapDailyCandles = async (symbol: string): Promise<CandleData[]> => {
  console.log('Fetching SideSwap daily candles for symbol:', symbol);
  const maxAttempts = 5;
  const backoff = async (attempt: number) => {
    const delay = Math.min(4000, 500 * Math.pow(2, attempt));
    await new Promise((r) => setTimeout(r, delay));
  };

  const doRequest = (pair: { base: string; quote: string }): Promise<CandleData[]> =>
    new Promise<CandleData[]>((resolve) => {
      try {
        console.log('Opening SideSwap WS connection...');
        const ws = new WebSocket(SIDESWAP_WS_URL);
        const req = {
          jsonrpc: "2.0",
          id: 1,
          method: "market",
          params: {
            chart_sub: {
              asset_pair: {
                base: pair.base,
                quote: pair.quote,
              },
            },
          },
        };

        // Response timeout
        const timeoutId = setTimeout(() => {
          console.warn('SideSwap WS timeout after 5s');
          try { ws.close(); } catch { }
          resolve([]);
        }, 5000);

        ws.onopen = () => {
          console.log('SideSwap WS opened, sending request:', req);
          try {
            ws.send(JSON.stringify(req));
          } catch { }
        };

        ws.onmessage = (evt) => {
          console.log('SideSwap WS message:', evt.data);
          try {
            const payload = JSON.parse(evt.data);
            if (payload?.error?.message && String(payload.error.message).toLowerCase().includes("can't find market")) {
              // let caller decide to try swapped order
              clearTimeout(timeoutId);
              try { ws.close(); } catch { }
              return resolve([]);
            }
            const data = payload?.result?.chart_sub?.data as Array<{
              time: string;
              open: number;
              high: number;
              low: number;
              close: number;
              volume?: number;
            }> | undefined;
            if (!Array.isArray(data)) {
              console.warn('SideSwap WS payload missing data:', payload);
              clearTimeout(timeoutId);
              try { ws.close(); } catch { }
              return resolve([]);
            }
            console.log('SideSwap WS received', data.length, 'candles');
            const candles: CandleData[] = data.map((d) => {
              const tsSec = Math.floor(new Date(d.time + "T00:00:00Z").getTime() / 1000) as UTCTimestamp;
              return {
                time: tsSec,
                open: Number(d.open),
                high: Number(d.high),
                low: Number(d.low),
                close: Number(d.close),
              };
            }).sort((a, b) => a.time - b.time);
            console.log('Processed', candles.length, 'SideSwap candles');
            clearTimeout(timeoutId);
            try { ws.close(); } catch { }
            return resolve(candles);
          } catch (e) {
            console.error('Error processing SideSwap message:', e);
            clearTimeout(timeoutId);
            try { ws.close(); } catch { }
            return resolve([]);
          }
        }

        ws.onerror = () => {
          console.error('SideSwap WS error');
          clearTimeout(timeoutId);
          try { ws.close(); } catch { }
          return resolve([]);
        };
      } catch (error) {
        console.error('Error in SideSwap request:', error);
        return resolve([]);
      }
    });

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Try resolving market dynamically on first attempt
    if (attempt === 0 && symbol) {
      const resolved = await resolveSideSwapPair(symbol);
      if (resolved) {
        SIDESWAP_PAIR.base = resolved.base;
        SIDESWAP_PAIR.quote = resolved.quote;
        console.log('Resolved SideSwap asset_pair from markets:', resolved);
      } else {
        console.warn('Could not resolve market from markets API, using configured asset IDs.');
      }
    }
    // Try normal order, then swapped order if needed
    const primary = await doRequest({ base: SIDESWAP_PAIR.base, quote: SIDESWAP_PAIR.quote });
    if (primary.length > 0) {
      console.log('SideSwap primary request successful:', primary.length, 'candles');
      return primary;
    }
    const swapped = await doRequest({ base: SIDESWAP_PAIR.quote, quote: SIDESWAP_PAIR.base });
    if (swapped.length > 0) {
      console.log('SideSwap: market found with swapped base/quote order');
      // adopt swapped order for live WS as well
      const tmp = SIDESWAP_PAIR.base;
      SIDESWAP_PAIR.base = SIDESWAP_PAIR.quote;
      SIDESWAP_PAIR.quote = tmp;
      return swapped;
    }
    // If neither primary nor swapped returned data, retry with backoff
    console.log(`SideSwap attempt ${attempt + 1} failed, retrying...`);
    await backoff(attempt);
  }
  console.error('SideSwap: all attempts failed');
  return [];
};

export default function BTCRealtimeChart({
  percent = 0.02,
  symbol = "btcusdt",
  height = 420,
  showControls = true,
  onPrice,
  showBullBearTriggers = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const upperLimitRef = useRef<ISeriesApi<"Line"> | null>(null);
  const lowerLimitRef = useRef<ISeriesApi<"Line"> | null>(null);
  const realtimePriceRef = useRef<ISeriesApi<"Line"> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const tickerWsRef = useRef<WebSocket | null>(null);
  const resizeObsRef = useRef<ResizeObserver | null>(null);

  const [pct, setPct] = useState<number>(percent);
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>("1m");
  const [isChartReady, setIsChartReady] = useState<boolean>(false);
  const lastPriceRef = useRef<number | null>(null);
  const [candleHistory, setCandleHistory] = useState<CandleData[]>([]);
  const oldestLoadedTimeRef = useRef<UTCTimestamp | null>(null);
  const newestLoadedTimeRef = useRef<UTCTimestamp | null>(null);
  const isUpdatingRef = useRef<boolean>(false);
  const realtimePriceDataRef = useRef<Array<{ time: UTCTimestamp; value: number }>>([]);

  const updateLimitLines = useCallback(
    (currentPrice: number) => {
      if (!upperLimitRef.current || !lowerLimitRef.current) return;

      const upperLimitPrice = currentPrice * (1 + pct);
      const lowerLimitPrice = currentPrice * (1 - pct);

      // Use the chart's actual data range instead of fixed time
      const now = Math.floor(Date.now() / 1000) as UTCTimestamp;
      const startTime = oldestLoadedTimeRef.current || (now - 7 * 24 * 60 * 60) as UTCTimestamp;

      upperLimitRef.current.setData([
        { time: startTime, value: upperLimitPrice },
        { time: now, value: upperLimitPrice },
      ]);

      lowerLimitRef.current.setData([
        { time: startTime, value: lowerLimitPrice },
        { time: now, value: lowerLimitPrice },
      ]);
    },
    [pct]
  );

  // Helpers for time ranges and fetches
  const getTimeRange = useCallback((period: TimePeriod) => {
    const now = Date.now();
    if (period === "1d") {
      const start = now - 30 * 24 * 60 * 60 * 1000; // 30 days
      return { startTime: start, endTime: now };
    }
    // Intraday: show ~3 days for better context
    const start = now - 3 * 24 * 60 * 60 * 1000;
    return { startTime: start, endTime: now };
  }, []);

  const binanceIntervalFor = (p: TimePeriod): string => {
    if (p === "1m") return "1m";
    if (p === "30m") return "30m";
    if (p === "1h") return "1h";
    return "1d";
  };

  const fetchBinanceCandles = useCallback(async (sym: string, period: TimePeriod): Promise<CandleData[]> => {
    try {
      const s = (sym || "btcusdt").toUpperCase();
      const interval = binanceIntervalFor(period);
      const url = `https://api.binance.com/api/v3/klines?symbol=${s}&interval=${interval}&limit=1000`;
      console.log('Fetching Binance candles from:', url);
      const res = await fetch(url);
      if (!res.ok) {
        console.error('Binance API response not ok:', res.status, res.statusText);
        return [];
      }
      const data = await res.json();
      if (!Array.isArray(data)) {
        console.error('Binance API returned non-array data:', data);
        return [];
      }
      console.log('Binance API returned', data.length, 'raw klines');
      const candles: CandleData[] = data.map((k: any[]) => ({
        time: Math.floor(Number(k[0]) / 1000) as UTCTimestamp,
        open: Number(k[1]),
        high: Number(k[2]),
        low: Number(k[3]),
        close: Number(k[4]),
      })).filter(c => Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close));
      console.log('Filtered to', candles.length, 'valid candles');
      return candles;
    } catch (error) {
      console.error('Error fetching Binance candles:', error);
      return [];
    }
  }, []);

  const fetchHistory = useCallback(async (sym: string, _startTimeMs: number, _endTimeMs: number): Promise<CandleData[]> => {
    // For intraday we rely on full fetch for now; incremental fetch can be added later
    if (selectedPeriod === "1d") return [];
    return fetchBinanceCandles(sym, selectedPeriod);
  }, [fetchBinanceCandles, selectedPeriod]);

  const loadInitialData = useCallback(async () => {
    console.log('loadInitialData (SideSwap daily)');

    // Try to load from cache first
    let bars = getCachedBars(symbol, selectedPeriod);
    console.log('Cached bars:', bars.length);

    if (bars.length === 0) {
      // Fetch depending on period
      if (selectedPeriod === "1d") {
        console.log('No cached data, fetching daily from SideSwap...');
        bars = await fetchSideSwapDailyCandles(symbol);
      } else {
        console.log('No cached data, fetching intraday from Binance...');
        bars = await fetchBinanceCandles(symbol, selectedPeriod);
      }
      console.log('API returned bars:', bars.length);
      if (bars.length > 0) {
        cacheBars(symbol, bars, selectedPeriod);
      }
    }

    if (bars && bars.length > 0) {
      console.log('Raw bars before validation:', bars.length);
      // Validate that all bars have valid data
      const validBars = bars.filter(bar =>
        bar &&
        typeof bar.time === 'number' &&
        bar.time > 0 &&
        typeof bar.open === 'number' &&
        typeof bar.high === 'number' &&
        typeof bar.low === 'number' &&
        typeof bar.close === 'number' &&
        isFinite(bar.open) &&
        isFinite(bar.high) &&
        isFinite(bar.low) &&
        isFinite(bar.close)
      );

      console.log('Valid bars after validation:', validBars.length);

      if (validBars.length > 0) {
        console.log('First bar:', validBars[0]);
        console.log('Last bar:', validBars[validBars.length - 1]);

        setCandleHistory(validBars);
        oldestLoadedTimeRef.current = validBars[0].time;
        newestLoadedTimeRef.current = validBars[validBars.length - 1].time;

        if (seriesRef.current && chartRef.current) {
          try {
            seriesRef.current.setData(validBars);

            // Update limit lines with the latest price
            const latestClose = validBars[validBars.length - 1]?.close;
            if (Number.isFinite(latestClose)) {
              lastPriceRef.current = latestClose;
              onPrice?.(latestClose);
              updateLimitLines(latestClose);
            }
            // Set visible range to data bounds
            const fromTs = validBars[0].time;
            const toTs = validBars[validBars.length - 1].time;
            chartRef.current.timeScale().setVisibleRange({ from: fromTs, to: toTs });
          } catch (error) {
            console.error('Failed to set chart data:', error);
          }
        }
      }
    }

    return bars;
  }, [symbol, selectedPeriod, updateLimitLines]);



  const loadMoreRecentData = useCallback(async (to: UTCTimestamp) => {
    if (!newestLoadedTimeRef.current || Number(to) <= Number(newestLoadedTimeRef.current)) {
      return;
    }

    const startTime = Number(newestLoadedTimeRef.current) * 1000;
    const endTime = Number(to) * 1000;

    const newBars = await fetchHistory(symbol, startTime, endTime);
    if (newBars.length === 0) return;

    // Use functional state update to avoid dependency on candleHistory
    setCandleHistory(currentHistory => {
      const mergedBars = mergeBars(newBars, currentHistory);
      if (mergedBars.length > 0) {
        // Validate that all bars have valid data
        const validBars = mergedBars.filter(bar =>
          bar &&
          typeof bar.time === 'number' &&
          bar.time > 0 &&
          typeof bar.open === 'number' &&
          typeof bar.high === 'number' &&
          typeof bar.low === 'number' &&
          typeof bar.close === 'number' &&
          isFinite(bar.open) &&
          isFinite(bar.high) &&
          isFinite(bar.low) &&
          isFinite(bar.close)
        );

        if (validBars.length > 0) {
          newestLoadedTimeRef.current = validBars[validBars.length - 1].time;

          if (seriesRef.current && chartRef.current) {
            try {
              isUpdatingRef.current = true;
              // Preserve current visible range
              const currentRange = chartRef.current.timeScale().getVisibleRange();
              seriesRef.current.setData(validBars);

              // Restore visible range if it exists
              if (currentRange) {
                setTimeout(() => {
                  try {
                    chartRef.current?.timeScale().setVisibleRange(currentRange);
                  } catch (error) {
                    console.error('Failed to restore visible range:', error);
                  } finally {
                    isUpdatingRef.current = false;
                  }
                }, 50);
              } else {
                isUpdatingRef.current = false;
              }
            } catch (error) {
              console.error('Failed to set recent chart data:', error);
              isUpdatingRef.current = false;
            }
          }

          return validBars;
        }
      }
      return currentHistory;
    });
  }, [symbol]);

  const loadMoreHistory = useCallback(async (from: UTCTimestamp) => {
    if (!oldestLoadedTimeRef.current || Number(from) >= Number(oldestLoadedTimeRef.current)) {
      return;
    }

    const newStartTime = Math.max(Number(from) - 7 * 24 * 60 * 60, 0) * 1000; // 1 week ago
    const endTime = Number(oldestLoadedTimeRef.current) * 1000;

    // Don't load data older than 30 days
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    if (newStartTime < thirtyDaysAgo) {
      return;
    }

    const newBars = await fetchHistory(symbol, newStartTime, endTime);
    if (newBars.length === 0) return;

    // Use functional state update to avoid dependency on candleHistory
    setCandleHistory(currentHistory => {
      const mergedBars = mergeBars(newBars, currentHistory);
      if (mergedBars.length > 0) {
        // Validate that all bars have valid data
        const validBars = mergedBars.filter(bar =>
          bar &&
          typeof bar.time === 'number' &&
          bar.time > 0 &&
          typeof bar.open === 'number' &&
          typeof bar.high === 'number' &&
          typeof bar.low === 'number' &&
          typeof bar.close === 'number' &&
          isFinite(bar.open) &&
          isFinite(bar.high) &&
          isFinite(bar.low) &&
          isFinite(bar.close)
        );

        if (validBars.length > 0) {
          oldestLoadedTimeRef.current = validBars[0].time;

          if (seriesRef.current && chartRef.current) {
            try {
              isUpdatingRef.current = true;
              // Preserve current visible range
              const currentRange = chartRef.current.timeScale().getVisibleRange();
              seriesRef.current.setData(validBars);

              // Restore visible range if it exists
              if (currentRange) {
                setTimeout(() => {
                  try {
                    chartRef.current?.timeScale().setVisibleRange(currentRange);
                  } catch (error) {
                    console.error('Failed to restore visible range:', error);
                  } finally {
                    isUpdatingRef.current = false;
                  }
                }, 50);
              } else {
                isUpdatingRef.current = false;
              }
            } catch (error) {
              console.error('Failed to set merged chart data:', error);
              isUpdatingRef.current = false;
            }
          }

          return validBars;
        }
      }
      return currentHistory;
    });
  }, [symbol]);

  // Create chart exactly once when the container is ready
  useEffect(() => {
    if (!containerRef.current) return;

    console.log('Creating chart with container:', {
      width: containerRef.current.clientWidth,
      height: height - 60,
      containerExists: !!containerRef.current
    });

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: height - 60, // Account for time selector
      layout: { background: { type: ColorType.Solid, color: "#111111" }, textColor: "#d1d4dc" },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { borderVisible: false },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 3,
        fixLeftEdge: false,
        fixRightEdge: false,
        lockVisibleTimeRangeOnResize: false,
        rightBarStaysOnScroll: false,
        visible: true,
        // Ensure right-to-left flow
        leftOffset: 12,
        rightOffset: 0,
        // Enable right-to-left scrolling
        scrollBackward: true,
        // Show newest data on the left
        rightBarStaysOnScroll: false,
        // Don't lock the right edge to allow leftward flow
        fixRightEdge: false,
        tickMarkFormatter: (time: number) => {
          const date = new Date(time * 1000);
          const month = (date.getMonth() + 1).toString().padStart(2, '0');
          const day = date.getDate().toString().padStart(2, '0');
          const hours = date.getHours().toString().padStart(2, '0');
          const year = date.getFullYear().toString().slice(-2); // Last 2 digits of year

          // Show a more complete date format
          return `${month}/${day}/${year}`;
        }
      },
      crosshair: { mode: CrosshairMode.Normal },
      // Improve responsiveness
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    console.log('Chart created successfully');

    const series = chart.addCandlestickSeries({
      upColor: "#009286",
      downColor: "#FF4747",
      borderVisible: false,
      wickUpColor: "#009286",
      wickDownColor: "#FF4747",
    });

    console.log('Candlestick series added');

    // Conditionally add bull/bear trigger lines
    let upperLimit: ISeriesApi<"Line"> | null = null;
    let lowerLimit: ISeriesApi<"Line"> | null = null;

    if (showBullBearTriggers) {
      // Add upper limit line (green)
      upperLimit = chart.addLineSeries({
        color: "#009286",
        lineWidth: 2,
        lineStyle: 1,
        title: "Bull Trigger",
      });

      // Add lower limit line (red)
      lowerLimit = chart.addLineSeries({
        color: "#FF4747",
        lineWidth: 2,
        lineStyle: 1,
        title: "Bear Trigger",
      });
    }

    // Add real-time price line (white, thin)
    const realtimePrice = chart.addLineSeries({
      color: "#FFFFFF",
      lineWidth: 1,
      lineStyle: 0, // Solid line
      title: "Real-time Price",
      priceLineVisible: false,
    });

    console.log('Limit lines and real-time price line added');

    chartRef.current = chart;
    seriesRef.current = series;
    upperLimitRef.current = upperLimit;
    lowerLimitRef.current = lowerLimit;
    realtimePriceRef.current = realtimePrice;

    // Mark chart as ready
    setIsChartReady(true);
    console.log('Chart marked as ready');

    // Subscribe to visible time range changes for lazy loading
    chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
      if (range && range.from && !isUpdatingRef.current) {

        // Load more history if scrolling left (earlier time)
        if (oldestLoadedTimeRef.current && Number(range.from) < Number(oldestLoadedTimeRef.current)) {
          loadMoreHistory(range.from as UTCTimestamp);
        }

        // Load more recent data if scrolling right (later time)
        if (newestLoadedTimeRef.current && Number(range.to) > Number(newestLoadedTimeRef.current)) {
          loadMoreRecentData(range.to as UTCTimestamp);
        }
      }
    });

    // Improved responsive width handling
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width);
        const h = Math.floor(entry.contentRect.height);
        
        // Only update if dimensions actually changed
        if (chartRef.current && (w !== chartRef.current.width() || h !== chartRef.current.height())) {
          chartRef.current.applyOptions({ 
            width: w,
            height: h > 0 ? h : height - 60
          });
          
          // Force a redraw to ensure proper rendering
          chartRef.current.timeScale().fitContent();
        }
      }
    });
    resizeObsRef.current = ro;
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      resizeObsRef.current = null;
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      upperLimitRef.current = null;
      lowerLimitRef.current = null;
      setIsChartReady(false);
    };
  }, [height, showBullBearTriggers]);

  // React to external height prop changes without recreating the chart
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.applyOptions({ height: height - 60 }); // Account for time selector
    }
  }, [height]);

  // Keep pct synced with prop
  useEffect(() => {
    setPct(clamp(percent, 0, 1));
  }, [percent]);

  // Handle showBullBearTriggers prop changes
  useEffect(() => {
    if (chartRef.current) {
      if (!showBullBearTriggers) {
        // Remove existing bull/bear trigger lines if they exist
        if (upperLimitRef.current) {
          chartRef.current.removeSeries(upperLimitRef.current);
          upperLimitRef.current = null;
        }
        if (lowerLimitRef.current) {
          chartRef.current.removeSeries(lowerLimitRef.current);
          lowerLimitRef.current = null;
        }
      } else if (showBullBearTriggers && !upperLimitRef.current && !lowerLimitRef.current) {
        // Add bull/bear trigger lines if they don't exist
        const upperLimit = chartRef.current.addLineSeries({
          color: "#009286",
          lineWidth: 2,
          lineStyle: 1,
          title: "Bull Trigger",
        });

        const lowerLimit = chartRef.current.addLineSeries({
          color: "#FF4747",
          lineWidth: 2,
          lineStyle: 1,
          title: "Bear Trigger",
        });

        upperLimitRef.current = upperLimit;
        lowerLimitRef.current = lowerLimit;
      }
    }
  }, [showBullBearTriggers]);

  // Handle window resize for better responsiveness
  useEffect(() => {
    const handleWindowResize = () => {
      if (chartRef.current && containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const containerHeight = containerRef.current.clientHeight;
        
        if (containerWidth > 0 && containerHeight > 0) {
          chartRef.current.applyOptions({
            width: containerWidth,
            height: containerHeight > 60 ? containerHeight - 60 : height - 60
          });
          
          // Ensure chart content is properly displayed
          setTimeout(() => {
            if (chartRef.current) {
              chartRef.current.timeScale().fitContent();
            }
          }, 100);
        }
      }
    };

    window.addEventListener('resize', handleWindowResize);
    
    return () => {
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [height]);

  // Monitor candle history changes
  useEffect(() => {
  }, [candleHistory]);

  // Load initial data when chart is ready
  useEffect(() => {
    if (isChartReady && chartRef.current && seriesRef.current) {
      console.log('Loading initial data for chart...');
      
      const loadData = async () => {
        try {
          const bars = await loadInitialData();
          console.log('Initial data loaded:', bars?.length, 'bars');
          
          if (bars && bars.length > 0) {
            console.log('Sample bars:', bars.slice(0, 3));
            console.log('Time range of bars:', {
              first: new Date(bars[0].time * 1000),
              last: new Date(bars[bars.length - 1].time * 1000)
            });

            // Set the data on the chart series
            if (seriesRef.current) {
              try {
                console.log('Setting data on chart series...');
                seriesRef.current.setData(bars);
                console.log('Data set successfully');
                
                // Update chart history state
                setCandleHistory(bars);
                oldestLoadedTimeRef.current = bars[0].time;
                newestLoadedTimeRef.current = bars[bars.length - 1].time;
                
                // Set visible range and fit content, then scroll to newest data
                if (chartRef.current) {
                  chartRef.current.timeScale().fitContent();
                  console.log('Chart content fitted successfully');
                  
                  // Ensure newest data is visible on the left
                  setTimeout(() => {
                    if (chartRef.current) {
                      chartRef.current.timeScale().scrollToPosition(1, false);
                      console.log('Scrolled to newest data on left');
                    }
                  }, 100);
                }
              } catch (error) {
                console.error('Failed to set initial chart data:', error);
              }
            }
          } else {
            console.warn('No initial data received, trying to fetch fresh data...');
            // If no cached data, try to fetch fresh data
            const fetchFreshData = async () => {
              try {
                let freshBars: CandleData[] = [];
                if (selectedPeriod === "1d") {
                  freshBars = await fetchSideSwapDailyCandles(symbol);
                } else {
                  freshBars = await fetchBinanceCandles(symbol, selectedPeriod);
                }
                
                if (freshBars && freshBars.length > 0) {
                  console.log('Fresh data fetched:', freshBars.length, 'bars');
                  setCandleHistory(freshBars);
                  oldestLoadedTimeRef.current = freshBars[0].time;
                  newestLoadedTimeRef.current = freshBars[freshBars.length - 1].time;
                  
                  if (seriesRef.current) {
                    seriesRef.current.setData(freshBars);
                    console.log('Fresh data set on chart');
                    
                    // Fit content after setting fresh data
                    if (chartRef.current) {
                      chartRef.current.timeScale().fitContent();
                    }
                  }
                } else {
                  console.error('Failed to fetch any data for chart');
                }
              } catch (error) {
                console.error('Error fetching fresh data:', error);
              }
            };
            
            fetchFreshData();
          }
        } catch (error) {
          console.error('Error in loadData:', error);
        }
      };
      
      loadData();
    }
  }, [isChartReady, loadInitialData, selectedPeriod, symbol]);

  // Reload data when selected period changes
  useEffect(() => {
    if (chartRef.current && seriesRef.current) {
      // No time scale option changes needed

      // Clear current data and reload for new period
      setCandleHistory([]);
      oldestLoadedTimeRef.current = null;
      newestLoadedTimeRef.current = null;

      const loader = selectedPeriod === "1d" ? fetchSideSwapDailyCandles(symbol) : fetchBinanceCandles(symbol, selectedPeriod);
      Promise.resolve(loader).then((bars) => {
        console.log('Time period change - bars received:', bars?.length);
        if (bars && bars.length > 0) {
          const validBars = bars.filter(bar =>
            bar &&
            typeof bar.time === 'number' &&
            bar.time > 0 &&
            typeof bar.open === 'number' &&
            typeof bar.high === 'number' &&
            typeof bar.low === 'number' &&
            typeof bar.close === 'number' &&
            isFinite(bar.open) &&
            isFinite(bar.high) &&
            isFinite(bar.low) &&
            isFinite(bar.close)
          );

          console.log('Time period change - valid bars:', validBars.length);

          if (validBars.length > 0) {
            console.log('Time period change - setting data on chart');
            console.log('Sample bars for new period:', validBars.slice(0, 3));
            console.log('Time range of new bars:', {
              first: new Date(validBars[0].time * 1000),
              last: new Date(validBars[validBars.length - 1].time * 1000)
            });

            setCandleHistory(validBars);
            oldestLoadedTimeRef.current = validBars[0].time;
            newestLoadedTimeRef.current = validBars[validBars.length - 1].time;

            if (seriesRef.current && chartRef.current) {
              try {
                console.log('Setting new data on chart series...');
                seriesRef.current.setData(validBars);
                console.log('New data set successfully');

                // Fit content first, then ensure newest data is visible on the left
                chartRef.current.timeScale().fitContent();
                console.log('Chart content fitted for new period');
                
                // Ensure newest data is visible on the left
                setTimeout(() => {
                  if (chartRef.current) {
                    chartRef.current.timeScale().scrollToPosition(1, false);
                    console.log('Scrolled to newest data on left for new period');
                  }
                }, 100);

                // Update limit lines with the latest price
                const latestClose = validBars[validBars.length - 1]?.close;
                if (Number.isFinite(latestClose)) {
                  lastPriceRef.current = latestClose;
                  onPrice?.(latestClose);
                  updateLimitLines(latestClose);
                }
              } catch (error) {
                console.error('Failed to set chart data for new period:', error);
              }
            }
          }
        }
      });
    }
  }, [selectedPeriod, symbol, updateLimitLines]);

  // Live updates (SideSwap for 1d, Binance WS for intraday)
  useEffect(() => {
    let stopped = false;
    let attempt = 0;

    const connectSideSwap = () => {
      if (stopped) return;
      try {
        const ws = new WebSocket(SIDESWAP_WS_URL);
        wsRef.current = ws;

        const req = {
          jsonrpc: "2.0",
          id: 1,
          method: "market",
          params: {
            chart_sub: {
              asset_pair: {
                base: SIDESWAP_PAIR.base,
                quote: SIDESWAP_PAIR.quote,
              },
            },
          },
        };

        ws.onopen = () => {
          attempt = 0;
          try { ws.send(JSON.stringify(req)); } catch {}
        };

        ws.onmessage = (evt) => {
          try {
            const payload = JSON.parse(evt.data);
            const data = payload?.result?.chart_sub?.data;
            if (!data) return;
            const arr = Array.isArray(data) ? data : [data];
            const newCandles: CandleData[] = arr.map((d: any) => {
              const tsSec = Math.floor(new Date(String(d.time) + "T00:00:00Z").getTime() / 1000) as UTCTimestamp;
              return {
                time: tsSec,
                open: Number(d.open),
                high: Number(d.high),
                low: Number(d.low),
                close: Number(d.close),
              };
            }).filter(c => Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close));
            if (newCandles.length === 0) return;
            setCandleHistory(prev => {
              const merged = mergeBars(newCandles, prev);
              if (seriesRef.current) {
                try { 
                  seriesRef.current.setData(merged); 
                  
                  // Ensure newest data stays visible on the left
                  if (chartRef.current) {
                    // Check if user is currently viewing recent data
                    const visibleRange = chartRef.current.timeScale().getVisibleRange();
                    if (visibleRange && visibleRange.from) {
                      const currentLeftEdge = visibleRange.from;
                      const newestTime = merged[merged.length - 1].time;
                      
                      // If user is viewing recent data, auto-scroll to keep newest visible on left
                      if (Math.abs(currentLeftEdge - newestTime) < 60) { // Within 1 minute
                        chartRef.current.timeScale().scrollToPosition(1, false);
                      }
                    }
                  }
                } catch {}
              }
              const latestClose = merged[merged.length - 1]?.close;
              if (Number.isFinite(latestClose)) {
                lastPriceRef.current = latestClose;
                onPrice?.(latestClose);
                updateLimitLines(latestClose);
              }
              return merged;
            });
          } catch {}
        };

        ws.onclose = () => {
          if (stopped) return;
          attempt += 1;
          const backoff = Math.min(15000, 500 * Math.pow(2, attempt));
          setTimeout(connectSideSwap, backoff);
        };

        ws.onerror = () => {
          try { ws.close(); } catch {}
        };
      } catch {}
    };

    const connectBinance = () => {
      if (stopped) return;
      try {
        const streamSym = (symbol || "btcusdt").toLowerCase();
        const interval = binanceIntervalFor(selectedPeriod);
        const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streamSym}@kline_${interval}`);
        wsRef.current = ws;

        ws.onopen = () => { attempt = 0; };
        ws.onmessage = (evt) => {
          try {
            const payload = JSON.parse(evt.data);
            const k = payload?.k;
            if (!k) return;
            const candle: CandleData = {
              time: Math.floor(Number(k.t) / 1000) as UTCTimestamp,
              open: Number(k.o),
              high: Number(k.h),
              low: Number(k.l),
              close: Number(k.c),
            };
            if (!Number.isFinite(candle.open) || !Number.isFinite(candle.high) || !Number.isFinite(candle.low) || !Number.isFinite(candle.close)) {
              return;
            }
            setCandleHistory(prev => {
              const merged = mergeBars([candle], prev);
              if (seriesRef.current) {
                try { 
                  seriesRef.current.setData(merged); 
                  
                  // Ensure newest data stays visible on the right
                  if (chartRef.current) {
                    // Check if user is currently viewing recent data
                    const visibleRange = chartRef.current.timeScale().getVisibleRange();
                    if (visibleRange && visibleRange.to) {
                      const currentRightEdge = visibleRange.to;
                      const newestTime = merged[merged.length - 1].time;
                      
                      // If user is viewing recent data, auto-scroll to keep newest visible
                      if (Math.abs(currentRightEdge - newestTime) < 60) { // Within 1 minute
                        chartRef.current.timeScale().scrollToPosition(0, false);
                      }
                    }
                  }
                } catch {}
              }
              const latestClose = merged[merged.length - 1]?.close;
              if (Number.isFinite(latestClose)) {
                lastPriceRef.current = latestClose;
                onPrice?.(latestClose);
                updateLimitLines(latestClose);
              }
              return merged;
            });
          } catch {}
        };
        ws.onclose = () => {
          if (stopped) return;
          attempt += 1;
          const backoff = Math.min(15000, 500 * Math.pow(2, attempt));
          setTimeout(connectBinance, backoff);
        };
        ws.onerror = () => { try { ws.close(); } catch {} };
      } catch {}
    };

    if (selectedPeriod === "1d") {
      connectSideSwap();
    } else {
      connectBinance();
    }

    return () => { stopped = true; try { wsRef.current?.close(); } catch {} };
  }, [symbol, selectedPeriod, updateLimitLines, onPrice]);

  // Separate real-time price feed for continuous updates
  useEffect(() => {
    let stopped = false;
    
    const connectTicker = () => {
      if (stopped) return;
      try {
        const streamSym = (symbol || "btcusdt").toLowerCase();
        const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streamSym}@ticker`);
        tickerWsRef.current = ws;

        ws.onopen = () => {
          console.log('Connected to Binance ticker stream');
        };

        ws.onmessage = (evt) => {
          try {
            const payload = JSON.parse(evt.data);
            const price = Number(payload?.c); // Current price from ticker
            if (Number.isFinite(price) && price > 0) {
              lastPriceRef.current = price;
              onPrice?.(price);
              updateLimitLines(price);
            }
          } catch {}
        };

        ws.onclose = () => {
          if (stopped) return;
          console.log('Ticker stream disconnected, reconnecting...');
          setTimeout(connectTicker, 1000);
        };

        ws.onerror = () => {
          try { ws.close(); } catch {}
        };
      } catch {}
    };

    connectTicker();

    return () => {
      stopped = true;
      try { tickerWsRef.current?.close(); } catch {}
    };
  }, [symbol, updateLimitLines, onPrice]);

  const timePeriods: TimePeriod[] = ["1m", "30m", "1h", "1d"];

  return (
    <div style={{ width: "100%", height }}>
      {/* Time Selector */}
      <div className="flex justify-center mb-4">
        <div className="flex bg-[#2A2A2A] rounded-lg p-1 gap-1">
          {timePeriods.map((period) => (
            <button
              key={period}
              onClick={() => {
                setSelectedPeriod(period);
              }}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${selectedPeriod === period
                  ? "bg-[#3A3A3A] border-white text-white"
                  : "text-[#B6B6B6] hover:text-white hover:bg-[#3A3A3A]"
                }`}
              title={`${period} candle intervals`}
            >
              {period}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Container */}
      <div 
        ref={containerRef} 
        style={{ 
          width: "100%", 
          height: height - 60,
          minHeight: "200px",
          backgroundColor: "#111111"
        }} 
      />
      {!isChartReady && (
        <div className="flex items-center justify-center h-32 text-gray-400">
          Loading chart...
        </div>
      )}
    </div>
  );
}
