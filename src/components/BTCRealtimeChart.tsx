"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  UTCTimestamp,
  ColorType,
} from "lightweight-charts";

type Props = {
  percent?: number;
  symbol?: string; // e.g. "btcusdt"
  height?: number;
  showControls?: boolean; // kept for API parity; unused below
  onPrice?: (price: number) => void;
};

type CandleData = {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
};

interface BinanceKline {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
  quoteAssetVolume: string;
  numberOfTrades: number;
  takerBuyBaseAssetVolume: string;
  takerBuyQuoteAssetVolume: string;
  ignore: string;
}

interface BinanceKlineWebSocket {
  e: string; // Event type
  E: number; // Event time
  s: string; // Symbol
  k: {
    t: number; // Kline start time
    T: number; // Kline close time
    s: string; // Symbol
    i: string; // Interval
    f: number; // First trade ID
    L: number; // Last trade ID
    o: string; // Open price
    c: string; // Close price
    h: string; // High price
    l: string; // Low price
    v: string; // Base asset volume
    n: number; // Number of trades
    x: boolean; // Is this kline closed?
    q: string; // Quote asset volume
    V: string; // Taker buy base asset volume
    Q: string; // Taker buy quote asset volume
    B: string; // Ignore
  };
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

// Helper functions
const normalizeCandle = (kline: BinanceKline): CandleData | null => {
  const time = Math.floor(kline.openTime / 1000) as UTCTimestamp;
  const open = parseFloat(kline.open);
  const high = parseFloat(kline.high);
  const low = parseFloat(kline.low);
  const close = parseFloat(kline.close);
  
  if (!isFinite(open) || !isFinite(high) || !isFinite(low) || !isFinite(close) || time <= 0) {
    return null;
  }
  
  return { time, open, high, low, close };
};

const normalizeWebSocketCandle = (kline: BinanceKlineWebSocket['k']): CandleData | null => {
  const time = Math.floor(kline.t / 1000) as UTCTimestamp;
  const open = parseFloat(kline.o);
  const high = parseFloat(kline.h);
  const low = parseFloat(kline.l);
  const close = parseFloat(kline.c);
  
  if (!isFinite(open) || !isFinite(high) || !isFinite(low) || !isFinite(close) || time <= 0) {
    return null;
  }
  
  return { time, open, high, low, close };
};

const fetchHistory = async (
  symbol: string,
  startTime: number,
  endTime: number
): Promise<CandleData[]> => {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=1m&startTime=${startTime}&endTime=${endTime}&limit=1000`;
  
  console.log('Fetching history:', new Date(startTime), 'to', new Date(endTime));
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data: BinanceKline[] = await response.json();
    const normalizedData = data.map(normalizeCandle).filter((candle): candle is CandleData => candle !== null);
    console.log('Fetched', normalizedData.length, 'candles');
    return normalizedData;
  } catch (error) {
    console.error('Failed to fetch history:', error);
    return [];
  }
};

const mergeBars = (newBars: CandleData[], existingBars: CandleData[]): CandleData[] => {
  const allBars = [...newBars, ...existingBars];
  const uniqueBars = new Map<UTCTimestamp, CandleData>();
  
  allBars.forEach(bar => {
    uniqueBars.set(bar.time, bar);
  });
  
  return Array.from(uniqueBars.values()).sort((a, b) => a.time - b.time);
};

const cacheBars = (symbol: string, bars: CandleData[]) => {
  try {
    localStorage.setItem(`btc_chart_${symbol}`, JSON.stringify({
      bars,
      timestamp: Date.now()
    }));
  } catch (error) {
    console.error('Failed to cache bars:', error);
  }
};

const getCachedBars = (symbol: string): CandleData[] => {
  try {
    const cached = localStorage.getItem(`btc_chart_${symbol}`);
    if (!cached) return [];
    
    const data = JSON.parse(cached);
    const cacheAge = Date.now() - data.timestamp;
    
    // Cache is valid for 1 hour
    if (cacheAge > 60 * 60 * 1000) {
      localStorage.removeItem(`btc_chart_${symbol}`);
      return [];
    }
    
    return data.bars;
  } catch (error) {
    console.error('Failed to get cached bars:', error);
    return [];
  }
};

export default function BTCRealtimeChart({
  percent = 0.02,
  symbol = "btcusdt",
  height = 420,
  showControls = true,
  onPrice,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const upperLimitRef = useRef<ISeriesApi<"Line"> | null>(null);
  const lowerLimitRef = useRef<ISeriesApi<"Line"> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const resizeObsRef = useRef<ResizeObserver | null>(null);

  const [pct, setPct] = useState<number>(percent);
  const lastPriceRef = useRef<number | null>(null);
  const [candleHistory, setCandleHistory] = useState<CandleData[]>([]);
  const oldestLoadedTimeRef = useRef<UTCTimestamp | null>(null);
  const newestLoadedTimeRef = useRef<UTCTimestamp | null>(null);
  const isUpdatingRef = useRef<boolean>(false);

  const updateLimitLines = useCallback(
    (currentPrice: number) => {
      if (!upperLimitRef.current || !lowerLimitRef.current) return;
      
      const upperLimitPrice = currentPrice * (1 + pct);
      const lowerLimitPrice = currentPrice * (1 - pct);
      
      // Use the chart's actual data range instead of fixed time
      const now = Math.floor(Date.now() / 1000) as UTCTimestamp;
      const startTime = oldestLoadedTimeRef.current || (now - 7 * 24 * 60 * 60) as UTCTimestamp;
      
      console.log('Updating limit lines:', {
        price: currentPrice,
        upper: upperLimitPrice,
        lower: lowerLimitPrice,
        pct: pct
      });
      
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

  const loadInitialData = useCallback(async () => {
    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    
    // Try to load from cache first
    let bars = getCachedBars(symbol);
    
    if (bars.length === 0) {
      // Fetch from API
      bars = await fetchHistory(symbol, oneWeekAgo, now);
      if (bars.length > 0) {
        cacheBars(symbol, bars);
      }
    }
    
    if (bars && bars.length > 0) {
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
      
      if (validBars.length > 0) {
        setCandleHistory(validBars);
        oldestLoadedTimeRef.current = validBars[0].time;
        newestLoadedTimeRef.current = validBars[validBars.length - 1].time;
        
        if (seriesRef.current && chartRef.current) {
          try {
            seriesRef.current.setData(validBars);
            
            // Update limit lines with the latest price
            if (lastPriceRef.current) {
              updateLimitLines(lastPriceRef.current);
            }
          } catch (error) {
            console.error('Failed to set chart data:', error);
          }
        }
      }
    }
    
    return bars;
  }, [symbol]);

  const loadMoreRecentData = useCallback(async (to: UTCTimestamp) => {
    console.log('loadMoreRecentData called with to:', new Date(to * 1000), 'newestLoaded:', newestLoadedTimeRef.current ? new Date(newestLoadedTimeRef.current * 1000) : 'null');
    if (!newestLoadedTimeRef.current || Number(to) <= Number(newestLoadedTimeRef.current)) {
      console.log('Skipping loadMoreRecentData - no need to load more recent data');
      return;
    }
    
    const startTime = Number(newestLoadedTimeRef.current) * 1000;
    const endTime = Number(to) * 1000;
    
    const newBars = await fetchHistory(symbol, startTime, endTime);
    if (newBars.length === 0) return;
    
    // Use functional state update to avoid dependency on candleHistory
    setCandleHistory(currentHistory => {
      console.log('Current history length:', currentHistory.length, 'New recent bars:', newBars.length);
      const mergedBars = mergeBars(newBars, currentHistory);
      console.log('Merged recent bars length:', mergedBars.length);
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
    console.log('loadMoreHistory called with from:', new Date(from * 1000), 'oldestLoaded:', oldestLoadedTimeRef.current ? new Date(oldestLoadedTimeRef.current * 1000) : 'null');
    if (!oldestLoadedTimeRef.current || Number(from) >= Number(oldestLoadedTimeRef.current)) {
      console.log('Skipping loadMoreHistory - no need to load more data');
      return;
    }
    
    const newStartTime = Math.max(Number(from) - 7 * 24 * 60 * 60, 0) * 1000; // 1 week ago
    const endTime = Number(oldestLoadedTimeRef.current) * 1000;
    
    // Don't load data older than 30 days
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    if (newStartTime < thirtyDaysAgo) {
      console.log('Skipping - data would be too old');
      return;
    }
    
    const newBars = await fetchHistory(symbol, newStartTime, endTime);
    if (newBars.length === 0) return;
    
    // Use functional state update to avoid dependency on candleHistory
    setCandleHistory(currentHistory => {
      console.log('Current history length:', currentHistory.length, 'New bars:', newBars.length);
      const mergedBars = mergeBars(newBars, currentHistory);
      console.log('Merged bars length:', mergedBars.length);
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

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: { background: { type: ColorType.Solid, color: "#131313" }, textColor: "#d1d4dc" },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { borderVisible: false },
      timeScale: { 
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 3,
        fixLeftEdge: false,
        fixRightEdge: true,
        lockVisibleTimeRangeOnResize: false,
        rightBarStaysOnScroll: true,
        visible: true,
        tickMarkFormatter: (time: number) => {
          const date = new Date(time * 1000);
          const day = date.getDate().toString().padStart(2, '0');
          const hours = date.getHours().toString().padStart(2, '0');
          return `${day} ${hours}`;
        }
      },
      crosshair: { mode: CrosshairMode.Normal },
    });

    const series = chart.addCandlestickSeries({
      upColor: "#009286",
      downColor: "#FF4747",
      borderVisible: false,
      wickUpColor: "#009286",
      wickDownColor: "#FF4747",
    });

    // Add upper limit line (green)
    const upperLimit = chart.addLineSeries({
      color: "#009286",
      lineWidth: 2,
      lineStyle: 1,
      title: "Max Limit",
    });

    // Add lower limit line (red)
    const lowerLimit = chart.addLineSeries({
      color: "#FF4747",
      lineWidth: 2,
      lineStyle: 1,
      title: "Min Limit",
    });

    chartRef.current = chart;
    seriesRef.current = series;
    upperLimitRef.current = upperLimit;
    lowerLimitRef.current = lowerLimit;

    // Load initial data and set up chart with a small delay to ensure chart is ready
    setTimeout(() => {
      loadInitialData().then((bars) => {
        // Set time range to show past week after data is loaded
        if (bars && bars.length > 0) {
          const now = Math.floor(Date.now() / 1000);
          const oneWeekAgo = now - 7 * 24 * 60 * 60;
          try {
            chart.timeScale().setVisibleRange({
              from: oneWeekAgo as UTCTimestamp,
              to: now as UTCTimestamp,
            });
            // Ensure the chart scrolls to the rightmost position (newest data)
            chart.timeScale().scrollToPosition(0, false);
          } catch (error) {
            // console.error('Failed to set visible range:', error);
          }
        }
      });
    }, 100);

    // Subscribe to visible time range changes for lazy loading
    chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
      if (range && range.from && !isUpdatingRef.current) {
        console.log('Visible range changed:', new Date(Number(range.from) * 1000), 'to', new Date(Number(range.to) * 1000));
        
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

    // Responsive width
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width);
        chart.applyOptions({ width: w });
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
    };
     }, [height]);

  // React to external height prop changes without recreating the chart
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.applyOptions({ height });
    }
  }, [height]);

  // Keep pct synced with prop
  useEffect(() => {
    setPct(clamp(percent, 0, 1));
  }, [percent]);

  // WebSocket: stream klines
  useEffect(() => {
    let stopped = false;
    let attempt = 0;

    const connect = () => {
      if (stopped) return;
      const url = `wss://stream.binance.com:9443/ws/${symbol}@kline_1m`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
      };

      ws.onmessage = (evt) => {
        try {
          const data: BinanceKlineWebSocket = JSON.parse(evt.data);
          const kline = data.k;
          
          if (!kline) return;

          const normalizedCandle = normalizeWebSocketCandle(kline);
          if (!normalizedCandle) return;
          
          const price = normalizedCandle.close;

          lastPriceRef.current = price;
          updateLimitLines(price);

          if (kline.x) {
            // Closed candle - add to history
            setCandleHistory(prev => {
              const newHistory = [...prev, normalizedCandle];
              cacheBars(symbol, newHistory);
              newestLoadedTimeRef.current = normalizedCandle.time;
              
              // Only update the specific candle, not the entire chart
              if (seriesRef.current && chartRef.current) {
                try {
                  seriesRef.current.update(normalizedCandle);
                } catch (error) {
                  console.error('Failed to update candle:', error);
                }
              }
              
              return newHistory;
            });
          } else {
            // Open candle - update in real-time
            if (seriesRef.current && chartRef.current) {
              try {
                seriesRef.current.update(normalizedCandle);
              } catch (error) {
                console.error('Failed to update candle:', error);
              }
            }
          }

          onPrice?.(price);
        } catch (error) {
          console.error('WebSocket message error:', error);
        }
      };

      ws.onclose = () => {
        if (stopped) return;
        attempt += 1;
        const backoff = Math.min(15000, 500 * 2 ** attempt);
        setTimeout(connect, backoff);
      };

      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      };
    };

    connect();

    return () => {
      stopped = true;
      try {
        wsRef.current?.close();
      } catch {
        /* ignore */
      }
    };
  }, [symbol, onPrice, updateLimitLines]);

  return <div ref={containerRef} style={{ width: "100%", height }} />;
}
