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

type TimePeriod = "1h" | "24h" | "7D" | "1M" | "3M" | "1Y";

type CandleData = {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
};

// Binance API returns klines as arrays, not objects
type BinanceKline = [
  number, // openTime
  string, // open
  string, // high
  string, // low
  string, // close
  string, // volume
  number, // closeTime
  string, // quoteAssetVolume
  number, // numberOfTrades
  string, // takerBuyBaseAssetVolume
  string, // takerBuyQuoteAssetVolume
  string  // ignore
];

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
  const openTime = kline[0];
  const open = parseFloat(kline[1]);
  const high = parseFloat(kline[2]);
  const low = parseFloat(kline[3]);
  const close = parseFloat(kline[4]);
  
  const time = Math.floor(openTime / 1000) as UTCTimestamp;
  
  // Debug the first few items to see what's happening
  if (Math.random() < 0.1) { // Only log 10% of items to avoid spam
    console.log('Normalizing candle:', {
      openTime,
      time,
      open,
      high,
      low,
      close,
      isValid: isFinite(open) && isFinite(high) && isFinite(low) && isFinite(close) && time > 0
    });
  }
  
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
  endTime: number,
  interval: string = "1m"
): Promise<CandleData[]> => {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&startTime=${startTime}&endTime=${endTime}&limit=1000`;

  console.log('Fetching from URL:', url);
  
  try {
    const response = await fetch(url);
    console.log('Response status:', response.status);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data: BinanceKline[] = await response.json();
    console.log('Raw data received:', data.length, 'items');
    
    // Log the first item to see the structure
    if (data.length > 0) {
      console.log('First raw item:', data[0]);
    }
    
    const normalizedData = data.map(normalizeCandle).filter((candle): candle is CandleData => candle !== null);
    console.log('Normalized data:', normalizedData.length, 'candles');
    return normalizedData;
  } catch (error) {
    console.error('Fetch error:', error);
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

const getTimeRange = (period: TimePeriod): { startTime: number; endTime: number } => {
  const now = Date.now();
  const endTime = now;
  
  let startTime: number;
  
  switch (period) {
    case "1h":
      startTime = now - 60 * 60 * 1000; // 1 hour ago
      break;
    case "24h":
      startTime = now - 24 * 60 * 60 * 1000; // 24 hours ago
      break;
    case "7D":
      startTime = now - 7 * 24 * 60 * 60 * 1000; // 7 days ago
      break;
    case "1M":
      startTime = now - 30 * 24 * 60 * 60 * 1000; // 30 days ago
      break;
    case "3M":
      startTime = now - 90 * 24 * 60 * 60 * 1000; // 90 days ago
      break;
    case "1Y":
      startTime = now - 365 * 24 * 60 * 60 * 1000; // 365 days ago
      break;
    default:
      startTime = now - 7 * 24 * 60 * 60 * 1000; // Default to 7 days
  }
  
  return { startTime, endTime };
};

const getIntervalForPeriod = (period: TimePeriod): string => {
  switch (period) {
    case "1h":
      return "1m";
    case "24h":
      return "5m";
    case "7D":
      return "1h";
    case "1M":
      return "4h";
    case "3M":
      return "1d";
    case "1Y":
      return "1d";
    default:
      return "1h";
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
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>("7D");
  const [isChartReady, setIsChartReady] = useState<boolean>(false);
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
    const { startTime, endTime } = getTimeRange(selectedPeriod);
    const interval = getIntervalForPeriod(selectedPeriod);
    
    console.log('loadInitialData called for period:', selectedPeriod, 'interval:', interval);
    console.log('Time range:', new Date(startTime), 'to', new Date(endTime));
    console.log('Time range timestamps:', startTime, 'to', endTime);
    
    // Try to load from cache first
    let bars = getCachedBars(symbol, selectedPeriod);
    console.log('Cached bars:', bars.length);
    
    if (bars.length === 0) {
      console.log('No cached data, fetching from API...');
      // Fetch from API
      bars = await fetchHistory(symbol, startTime, endTime, interval);
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
        
        // Check if data timestamps are within expected range
        const { startTime, endTime } = getTimeRange(selectedPeriod);
        const expectedStart = Math.floor(startTime / 1000);
        const expectedEnd = Math.floor(endTime / 1000);
        
        console.log('Timestamp range check:', {
          dataStart: validBars[0].time,
          dataEnd: validBars[validBars.length - 1].time,
          expectedStart,
          expectedEnd,
          dataInRange: validBars[0].time >= expectedStart && validBars[validBars.length - 1].time <= expectedEnd
        });
        
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
        fixRightEdge: true,
        lockVisibleTimeRangeOnResize: false,
        rightBarStaysOnScroll: true,
        visible: true,
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
      title: "Bull Trigger",
    });

    // Add lower limit line (red)
    const lowerLimit = chart.addLineSeries({
      color: "#FF4747",
      lineWidth: 2,
      lineStyle: 1,
      title: "Bear Trigger",
    });

    chartRef.current = chart;
    seriesRef.current = series;
    upperLimitRef.current = upperLimit;
    lowerLimitRef.current = lowerLimit;
    
    // Mark chart as ready
    setIsChartReady(true);



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
      setIsChartReady(false);
    };
     }, [height]);

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

  // Monitor candle history changes
  useEffect(() => {
  }, [candleHistory]);

  // Load initial data when chart is ready
  useEffect(() => {
    if (isChartReady && chartRef.current && seriesRef.current) {
      console.log('Loading initial data for chart...');
      loadInitialData().then((bars) => {
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
            } catch (error) {
              console.error('Failed to set initial chart data:', error);
            }
          }
          
          const { startTime, endTime } = getTimeRange(selectedPeriod);
          console.log('Setting visible range:', {
            from: new Date(startTime),
            to: new Date(endTime),
            fromTimestamp: Math.floor(startTime / 1000),
            toTimestamp: Math.floor(endTime / 1000)
          });
          
          try {
            chartRef.current?.timeScale().setVisibleRange({
              from: Math.floor(startTime / 1000) as UTCTimestamp,
              to: Math.floor(endTime / 1000) as UTCTimestamp,
            });
            chartRef.current?.timeScale().scrollToPosition(0, false);
            console.log('Visible range set successfully');
          } catch (error) {
            console.error('Failed to set visible range:', error);
          }
        }
      });
    }
  }, [isChartReady, loadInitialData]);

  // Reload data when selected period changes
  useEffect(() => {
    if (chartRef.current && seriesRef.current) {
      // Update tick mark formatter based on selected period
      if (chartRef.current) {
        chartRef.current.timeScale().applyOptions({
          tickMarkFormatter: (time: number) => {
            const date = new Date(time * 1000);
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const day = date.getDate().toString().padStart(2, '0');
            const hours = date.getHours().toString().padStart(2, '0');
            const year = date.getFullYear().toString().slice(-2);
            
            // Adapt format based on time period
            if (selectedPeriod === "1h") {
              return `${hours}:00`;
            } else if (selectedPeriod === "24h") {
              return `${day} ${hours}:00`;
            } else if (selectedPeriod === "7D") {
              return `${month}/${day}`;
            } else {
              return `${month}/${day}/${year}`;
            }
          }
        });
      }
      
      // Clear current data and reload for new period
      setCandleHistory([]);
      oldestLoadedTimeRef.current = null;
      newestLoadedTimeRef.current = null;
      
      const { startTime, endTime } = getTimeRange(selectedPeriod);
      const interval = getIntervalForPeriod(selectedPeriod);
      
      fetchHistory(symbol, startTime, endTime, interval).then((bars) => {
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
                
                // Set visible range for new period
                console.log('Setting new visible range:', {
                  from: new Date(startTime),
                  to: new Date(endTime)
                });
                
                chartRef.current.timeScale().setVisibleRange({
                  from: Math.floor(startTime / 1000) as UTCTimestamp,
                  to: Math.floor(endTime / 1000) as UTCTimestamp,
                });
                console.log('New visible range set successfully');
                
                // Update limit lines with the latest price
                if (lastPriceRef.current) {
                  updateLimitLines(lastPriceRef.current);
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

  // WebSocket: stream klines
  useEffect(() => {
    let stopped = false;
    let attempt = 0;

    const connect = () => {
      if (stopped) return;
      const interval = getIntervalForPeriod(selectedPeriod);
      const url = `wss://stream.binance.com:9443/ws/${symbol}@kline_${interval}`;
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
              cacheBars(symbol, newHistory, selectedPeriod);
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
  }, [symbol, selectedPeriod, onPrice, updateLimitLines]);

  const timePeriods: TimePeriod[] = ["1h", "24h", "7D", "1M", "3M", "1Y"];

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
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                selectedPeriod === period
                  ? "bg-[#3A3A3A] border-white text-white"
                  : "text-[#B6B6B6] hover:text-white hover:bg-[#3A3A3A]"
              }`}
            >
              {period}
            </button>
          ))}
        </div>
      </div>
      
      {/* Chart Container */}
      <div ref={containerRef} style={{ width: "100%", height: height - 60 }} />
    </div>
  );
}
