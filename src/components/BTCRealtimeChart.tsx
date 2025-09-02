"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
  useMemo,
} from "react";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
  ColorType,
  CrosshairMode,
  Time,
  BusinessDay,
} from "lightweight-charts";

type Props = {
  percent?: number;
  height?: number;
  onPrice?: (price: number) => void;
  showBullBearTriggers?: boolean;
};

type CandleData = {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
};

export interface BTCRealtimeChartRef {
  showTwentyDays: () => void;
  showOneWeek: () => void;
  showOneDay: () => void;
  showFiveMinutes: () => void;
  showTimeRange: (timeIndex: number) => void; // For High/Low component time selection
  setTimeRange: (timeIndex: number) => void; // Non-intrusive time range setting
  toggleBullBearTriggers: (show: boolean) => void; // Toggle bull/bear trigger lines without affecting chart
}

const SIDESWAP_WS_URL = "wss://api.sideswap.io/json-rpc-ws";
const SIDESWAP_PAIR = {
  base: "6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d", // BTC
  quote: "ce091c998b83c78bb71a632313ba3760f1763d9cfcffae02258ffa9865a37bd2", // USDT
};

// Helper function to convert Time to number (seconds)
const timeToNumber = (time: Time): number => {
  if (typeof time === 'number') {
    return time;
  }
  if (typeof time === 'string') {
    return Math.floor(new Date(time).getTime() / 1000);
  }
  // Handle BusinessDay case
  const businessDay = time as BusinessDay;
  const date = new Date(businessDay.year, businessDay.month - 1, businessDay.day);
  return Math.floor(date.getTime() / 1000);
};

const BTCRealtimeChart = forwardRef<BTCRealtimeChartRef, Props>(
  (
    { percent = 0.02, height = 450, onPrice, showBullBearTriggers = true },
    ref
  ) => {
    // Memoize props to prevent unnecessary re-renders
    const memoizedProps = useMemo(() => ({
      percent,
      height,
      showBullBearTriggers
    }), [percent, height, showBullBearTriggers]);

    // Memoize the onPrice callback to prevent unnecessary re-renders
    const memoizedOnPrice = useCallback((price: number) => {
      onPrice?.(price);
    }, [onPrice]);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const dailySeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const fiveMinSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const upperLimitRef = useRef<ISeriesApi<"Line"> | null>(null);
    const lowerLimitRef = useRef<ISeriesApi<"Line"> | null>(null);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);

    const [dailyCandleHistory, setDailyCandleHistory] = useState<CandleData[]>([]);
    const [fiveMinCandleHistory, setFiveMinCandleHistory] = useState<CandleData[]>([]);
    const [currentPrice, setCurrentPrice] = useState<number>(0);
    const [isChartReady, setIsChartReady] = useState(false);
    const [currentView, setCurrentView] = useState<'daily' | 'fiveMin'>('daily');
    const [activeSeries, setActiveSeries] = useState<'daily' | 'fiveMin'>('daily');
    const [isAutoScroll, setIsAutoScroll] = useState(true);
    const [lastVisibleRange, setLastVisibleRange] = useState<{from: Time, to: Time} | null>(null);
    const [isUserInteracting, setIsUserInteracting] = useState(false);
    const [isChartLocked, setIsChartLocked] = useState(false);

    const updateLimitLines = useCallback(
      (price: number) => {
        if (!upperLimitRef.current || !lowerLimitRef.current || !memoizedProps.showBullBearTriggers) return;
        
        const upper = price * (1 + memoizedProps.percent);
        const lower = price * (1 - memoizedProps.percent);

        const start = Math.floor(Date.now() / 1000) - (24 * 60 * 60) as UTCTimestamp;
        const end = Math.floor(Date.now() / 1000) as UTCTimestamp;

        // Only update if lines should be visible
        if (memoizedProps.showBullBearTriggers) {
          upperLimitRef.current.setData([
            { time: start, value: upper },
            { time: end, value: upper },
          ]);
          lowerLimitRef.current.setData([
            { time: start, value: lower },
            { time: end, value: lower },
          ]);
        }
      },
      [memoizedProps.percent, memoizedProps.showBullBearTriggers]
    );

    // Function to manage which series is visible
    const setActiveSeriesData = useCallback((seriesType: 'daily' | 'fiveMin') => {
      if (!chartRef.current || !isChartReady) return;
      
      setActiveSeries(seriesType);
      
      if (seriesType === 'daily') {
        // Show daily series, hide 5-minute series
        if (dailySeriesRef.current && dailyCandleHistory.length > 0) {
          dailySeriesRef.current.setData(dailyCandleHistory);
        }
        if (fiveMinSeriesRef.current) {
          fiveMinSeriesRef.current.setData([]);
        }
      } else {
        // Show 5-minute series, hide daily series
        if (fiveMinSeriesRef.current && fiveMinCandleHistory.length > 0) {
          fiveMinSeriesRef.current.setData(fiveMinCandleHistory);
        }
        if (dailySeriesRef.current) {
          dailySeriesRef.current.setData([]);
        }
      }
    }, [isChartReady, dailyCandleHistory, fiveMinCandleHistory]);

    // Handle chart resize
    const handleResize = useCallback(() => {
      if (chartRef.current && containerRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: height,
        });
      }
    }, [height]);

    // Memoize chart configuration to prevent re-creation
    const chartConfig = useMemo(() => ({
      width: containerRef.current?.clientWidth || 800,
      height: memoizedProps.height,
      layout: {
        background: { type: ColorType.Solid, color: "#111" },
        textColor: "#d1d4dc",
      },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { 
        timeVisible: true, 
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 6, // Increased for better visibility
        fixLeftEdge: false,
        fixRightEdge: true, // Keep newest candle on right edge
        lockVisibleTimeRangeOnResize: true,
        rightBarStaysOnScroll: true,
        shiftVisibleRangeOnNewBar: true, // Allow shifting to keep newest candle visible
        minBarSpacing: 0.5, // Prevent oversized candles
      },
    }), [memoizedProps.height]);

    // Init chart - only create once
    useEffect(() => {
      if (!containerRef.current || chartRef.current) return;
      
      const chart = createChart(containerRef.current, chartConfig);
      
      // Daily candlestick series (base layer)
      const dailySeries = chart.addCandlestickSeries({
        upColor: "#009286",
        downColor: "#FF4747",
        borderVisible: false,
        wickUpColor: "#009286",
        wickDownColor: "#FF4747",
      });
      
      // 5-minute candlestick series (overlay layer - similar colors to blend with main chart)
      const fiveMinSeries = chart.addCandlestickSeries({
        upColor: "#00cc88",
        downColor: "#ff5555", 
        borderVisible: false,
        wickUpColor: "#00cc88",
        wickDownColor: "#ff5555",
        // Add slightly different colors to distinguish but blend well
      });
      
      chartRef.current = chart;
      dailySeriesRef.current = dailySeries;
      fiveMinSeriesRef.current = fiveMinSeries;
      // Don't create limit lines during initialization - they'll be created when needed
      upperLimitRef.current = null;
      lowerLimitRef.current = null;
      
      // Add scroll listener for auto-scroll behavior
      chart.timeScale().subscribeVisibleTimeRangeChange((timeRange) => {
        if (timeRange) {
          setLastVisibleRange(timeRange);
          
          // Check if user is close to the right edge (within 5% of the total range)
          const now = Math.floor(Date.now() / 1000);
          const timeTo = timeToNumber(timeRange.to);
          const timeFrom = timeToNumber(timeRange.from);
          
          const timeDiff = now - timeTo;
          const totalRange = timeTo - timeFrom;
          const threshold = totalRange * 0.05; // 5% threshold
          
          // Enable auto-scroll if user is close to the right edge and not actively interacting
          if (isAutoScroll && timeDiff < threshold && !isUserInteracting) {
            // Keep auto-scroll enabled - newest candle should stay on right
          } else if (timeDiff > threshold * 3) {
            // Disable auto-scroll if user has scrolled away significantly
            setIsAutoScroll(false);
          }
        }
      });
      
      // Add mouse event listeners to detect user interaction
      const handleMouseDown = () => {
        setIsUserInteracting(true);
        setIsChartLocked(true); // Lock chart when user starts interacting
      };
      const handleMouseUp = () => {
        setTimeout(() => {
          setIsUserInteracting(false);
          // Keep chart locked for a longer period to prevent navbar interference
          setTimeout(() => setIsChartLocked(false), 3000);
        }, 1000);
      };
      
      chart.subscribeCrosshairMove(() => {
        setIsUserInteracting(true);
        setIsChartLocked(true);
        setTimeout(() => {
          setIsUserInteracting(false);
          setTimeout(() => setIsChartLocked(false), 3000);
        }, 2000);
      });
      
      if (containerRef.current) {
        containerRef.current.addEventListener('mousedown', handleMouseDown);
        containerRef.current.addEventListener('mouseup', handleMouseUp);
        containerRef.current.addEventListener('wheel', () => {
          setIsUserInteracting(true);
          setIsChartLocked(true);
          setTimeout(() => {
            setIsUserInteracting(false);
            setTimeout(() => setIsChartLocked(false), 3000);
          }, 2000);
        });
      }
      
      // Set up resize observer for the container
      if (containerRef.current) {
        resizeObserverRef.current = new ResizeObserver(() => {
          handleResize();
        });
        resizeObserverRef.current.observe(containerRef.current);
      }
      
      setIsChartReady(true);
      
      return () => {
        if (resizeObserverRef.current) {
          resizeObserverRef.current.disconnect();
        }
        if (containerRef.current) {
          containerRef.current.removeEventListener('mousedown', handleMouseDown);
          containerRef.current.removeEventListener('mouseup', handleMouseUp);
          containerRef.current.removeEventListener('wheel', () => {});
        }
        // Clean up limit lines if they exist
        if (upperLimitRef.current) {
          chart.removeSeries(upperLimitRef.current);
          upperLimitRef.current = null;
        }
        if (lowerLimitRef.current) {
          chart.removeSeries(lowerLimitRef.current);
          lowerLimitRef.current = null;
        }
        chart.remove();
        setIsChartReady(false);
      };
    }, [chartConfig, handleResize]);

    // Handle showBullBearTriggers prop changes - only toggle line visibility, don't affect chart
    useEffect(() => {
      if (!chartRef.current || !isChartReady) return;
      
      // Create limit lines once when chart is ready, then just toggle their data
      if (memoizedProps.showBullBearTriggers && !upperLimitRef.current && !lowerLimitRef.current) {
        // Add limit lines only once
        const upper = chartRef.current.addLineSeries({ 
          color: "#00ff99", 
          lineWidth: 2, 
          title: "Bull Limit",
          visible: true
        });
        const lower = chartRef.current.addLineSeries({ 
          color: "#ff4747", 
          lineWidth: 2, 
          title: "Bear Limit",
          visible: true
        });
        upperLimitRef.current = upper;
        lowerLimitRef.current = lower;
        
        // Set initial data if price is available
        if (currentPrice > 0) {
          updateLimitLines(currentPrice);
        }
      } else if (!memoizedProps.showBullBearTriggers && upperLimitRef.current && lowerLimitRef.current) {
        // Hide lines by setting empty data instead of removing them
        upperLimitRef.current.setData([]);
        lowerLimitRef.current.setData([]);
      } else if (memoizedProps.showBullBearTriggers && upperLimitRef.current && lowerLimitRef.current && currentPrice > 0) {
        // Show lines by setting data
        updateLimitLines(currentPrice);
      }
    }, [memoizedProps.showBullBearTriggers, isChartReady, currentPrice, updateLimitLines]);

    // Handle window resize
    useEffect(() => {
      const handleWindowResize = () => {
        handleResize();
      };

      window.addEventListener('resize', handleWindowResize);
      return () => window.removeEventListener('resize', handleWindowResize);
    }, [handleResize]);

    // SideSwap WebSocket for daily data
    useEffect(() => {
      let ws: WebSocket | null = null;
      let retryTimeout: NodeJS.Timeout;

      const connect = () => {
        ws = new WebSocket(SIDESWAP_WS_URL);

        ws.onopen = () => {
          console.log("SideSwap WS connected for daily data");
          ws?.send(
            JSON.stringify({
              id: 1,
              jsonrpc: "2.0",
              method: "market",
              params: { chart_sub: { asset_pair: SIDESWAP_PAIR } },
            })
          );
        };

        ws.onmessage = (evt) => {
          const msg = JSON.parse(evt.data);

          // Initial batch of daily data
          if (msg.result?.chart_sub?.data) {
            const candles: CandleData[] = msg.result.chart_sub.data.map(
              (d: any) => ({
                time: Math.floor(new Date(d.time).getTime() / 1000) as UTCTimestamp,
                open: Number(d.open),
                high: Number(d.high),
                low: Number(d.low),
                close: Number(d.close),
              })
            );
            const sorted = candles.sort((a, b) => a.time - b.time);
            setDailyCandleHistory(sorted);
            if (dailySeriesRef.current) {
              dailySeriesRef.current.setData(sorted);
            }
          }

          // Realtime daily updates
          if (msg.params?.chart_update?.update) {
            const u = msg.params.chart_update.update;
            const c: CandleData = {
              time: Math.floor(new Date(u.time).getTime() / 1000) as UTCTimestamp,
              open: Number(u.open),
              high: Number(u.high),
              low: Number(u.low),
              close: Number(u.close),
            };

            setDailyCandleHistory((prev) => {
              if (prev.length === 0) {
                if (dailySeriesRef.current) {
                  dailySeriesRef.current.setData([c]);
                }
                return [c];
              }

              const last = prev[prev.length - 1];
              if (c.time === last.time) {
                // replace last candle
                const updated = [...prev.slice(0, -1), c];
                if (dailySeriesRef.current) {
                  dailySeriesRef.current.update(c);
                }
                return updated;
              } else if (c.time > last.time) {
                // new candle
                const updated = [...prev, c];
                if (dailySeriesRef.current) {
                  dailySeriesRef.current.update(c);
                }
                return updated;
              }
              return prev;
            });
          }
        };

        ws.onclose = () => {
          console.log("SideSwap WS closed, retrying...");
          retryTimeout = setTimeout(connect, 10000);
        };
        ws.onerror = (e) => {
          console.warn("SideSwap WS error", e);
          ws?.close();
        };
      };

      connect();
      return () => {
        ws?.close();
        clearTimeout(retryTimeout);
      };
    }, []);

    // 5-minute candle generation and real-time price updates
    useEffect(() => {
      if (!isChartReady || !fiveMinSeriesRef.current) return;

      const interval = setInterval(() => {
        const now = Math.floor(Date.now() / 1000);
        const fiveMinInterval = 5 * 60; // 5 minutes in seconds
        const currentFiveMinTime = Math.floor(now / fiveMinInterval) * fiveMinInterval;
        
        // Update current price (simulate real-time updates)
        if (dailyCandleHistory.length > 0) {
          const lastDaily = dailyCandleHistory[dailyCandleHistory.length - 1];
          const priceVariation = (Math.random() - 0.5) * 0.002; // ±0.1% variation
          const newPrice = lastDaily.close * (1 + priceVariation);
          setCurrentPrice(newPrice);
          
          // Update 5-minute candles
          setFiveMinCandleHistory((prev) => {
            if (prev.length === 0) {
              // First 5-minute candle
              const firstCandle: CandleData = {
                time: currentFiveMinTime as UTCTimestamp,
                open: lastDaily.close,
                high: Math.max(lastDaily.close, newPrice),
                low: Math.min(lastDaily.close, newPrice),
                close: newPrice,
              };
              
              // Always update the 5-minute series to keep it visible
              if (fiveMinSeriesRef.current) {
                fiveMinSeriesRef.current.setData([firstCandle]);
              }
              return [firstCandle];
            }

            const last = prev[prev.length - 1];
            
            if (currentFiveMinTime === last.time) {
              // Update current 5-minute candle
              const updatedCandle: CandleData = {
                ...last,
                high: Math.max(last.high, newPrice),
                low: Math.min(last.low, newPrice),
                close: newPrice,
              };
              
              // Always update the 5-minute series to keep it visible
              if (fiveMinSeriesRef.current) {
                fiveMinSeriesRef.current.update(updatedCandle);
              }
              
              // Auto-scroll to keep the latest candle visible (only if not user interacting)
              if (isAutoScroll && chartRef.current && !isUserInteracting) {
                // Always scroll to real time to keep newest candle on right edge
                chartRef.current.timeScale().scrollToRealTime();
              }
              
              return prev.map((candle, index) => 
                index === prev.length - 1 ? updatedCandle : candle
              );
            } else if (currentFiveMinTime > last.time) {
              // Create new 5-minute candle
              const newCandle: CandleData = {
                time: currentFiveMinTime as UTCTimestamp,
                open: last.close,
                high: Math.max(last.close, newPrice),
                low: Math.min(last.close, newPrice),
                close: newPrice,
              };
              
              const updated = [...prev, newCandle];
              
              // Keep only last 288 candles (24 hours worth of 5-minute candles)
              if (updated.length > 288) {
                updated.splice(0, updated.length - 288);
              }
              
              // Always update the 5-minute series to keep it visible
              if (fiveMinSeriesRef.current) {
                fiveMinSeriesRef.current.setData(updated);
              }
              
              // Auto-scroll to keep the latest candle visible (only if not user interacting)
              if (isAutoScroll && chartRef.current && !isUserInteracting) {
                // Always scroll to real time to keep newest candle on right edge
                chartRef.current.timeScale().scrollToRealTime();
              }
              
              return updated;
            }
            
            return prev;
          });
        }
      }, 1000); // Update every second

      return () => clearInterval(interval);
    }, [isChartReady, dailyCandleHistory]);

    // Side-effects when data changes
    useEffect(() => {
      if (currentPrice > 0) {
        memoizedOnPrice(currentPrice);
        // Only update limit lines if they should be visible
        if (memoizedProps.showBullBearTriggers) {
          updateLimitLines(currentPrice);
        }
      }
    }, [currentPrice, memoizedOnPrice, updateLimitLines, memoizedProps.showBullBearTriggers]);

    // Navigation methods - focused on 5-minute candles with different time ranges
    const showTwentyDays = useCallback(() => {
      if (!chartRef.current || !dailyCandleHistory.length || !isChartReady) return;
      try {
        setCurrentView('fiveMin');
        
        const now = Math.floor(Date.now() / 1000) as UTCTimestamp;
        const last = dailyCandleHistory[dailyCandleHistory.length - 1].time;
        const rightEdge = Math.max(last, now);
        
        chartRef.current.timeScale().setVisibleRange({
          from: (rightEdge - 20 * 24 * 60 * 60) as Time,
          to: rightEdge as Time,
        });
        
        // Ensure newest candle stays on right edge
        chartRef.current.timeScale().scrollToRealTime();
        
        // Disable auto-scroll when user manually navigates
        setIsAutoScroll(false);
      } catch (error) {
        console.warn('Error setting 20-day view:', error);
      }
    }, [dailyCandleHistory, isChartReady]);

    const showOneWeek = useCallback(() => {
      if (!chartRef.current || !dailyCandleHistory.length || !isChartReady) return;
      try {
        setCurrentView('fiveMin');
        
        const now = Math.floor(Date.now() / 1000) as UTCTimestamp;
        const last = dailyCandleHistory[dailyCandleHistory.length - 1].time;
        const rightEdge = Math.max(last, now);
        
        chartRef.current.timeScale().setVisibleRange({
          from: (rightEdge - 7 * 24 * 60 * 60) as Time,
          to: rightEdge as Time,
        });
        
        // Ensure newest candle stays on right edge
        chartRef.current.timeScale().scrollToRealTime();
        
        // Disable auto-scroll when user manually navigates
        setIsAutoScroll(false);
      } catch (error) {
        console.warn('Error setting 1-week view:', error);
      }
    }, [dailyCandleHistory, isChartReady]);

    const showOneDay = useCallback(() => {
      if (!chartRef.current || !dailyCandleHistory.length || !isChartReady) return;
      try {
        setCurrentView('fiveMin');
        
        const now = Math.floor(Date.now() / 1000) as UTCTimestamp;
        const last = dailyCandleHistory[dailyCandleHistory.length - 1].time;
        const rightEdge = Math.max(last, now);
        
        chartRef.current.timeScale().setVisibleRange({
          from: (rightEdge - 24 * 60 * 60) as Time,
          to: rightEdge as Time,
        });
        
        // Ensure newest candle stays on right edge
        chartRef.current.timeScale().scrollToRealTime();
        
        // Disable auto-scroll when user manually navigates
        setIsAutoScroll(false);
      } catch (error) {
        console.warn('Error setting 1-day view:', error);
      }
    }, [dailyCandleHistory, isChartReady]);

    const showFiveMinutes = useCallback(() => {
      if (!chartRef.current || !fiveMinCandleHistory.length || !isChartReady) return;
      try {
        setCurrentView('fiveMin');
        
        const now = Math.floor(Date.now() / 1000) as UTCTimestamp;
        const last = fiveMinCandleHistory[fiveMinCandleHistory.length - 1].time;
        const rightEdge = Math.max(last, now);
        
        chartRef.current.timeScale().setVisibleRange({
          from: (rightEdge - 4 * 60 * 60) as Time, // Show last 4 hours
          to: rightEdge as Time,
        });
        
        // Ensure newest candle stays on right edge
        chartRef.current.timeScale().scrollToRealTime();
        
        // Enable auto-scroll for 5-minute view
        setIsAutoScroll(true);
      } catch (error) {
        console.warn('Error setting 5-minute view:', error);
      }
    }, [fiveMinCandleHistory, isChartReady]);

    // Method for High/Low component time selection
    const showTimeRange = useCallback((timeIndex: number) => {
      if (!chartRef.current || !isChartReady) return;
      
      // Time values: 2m, 10m, 30m, 1h, 6h, 12h, 24h
      const timeValues = [2, 10, 30, 60, 360, 720, 1440]; // in minutes
      const selectedMinutes = timeValues[timeIndex] || 2;
      
      try {
        setCurrentView('fiveMin');
        
        const now = Math.floor(Date.now() / 1000) as UTCTimestamp;
        const last = fiveMinCandleHistory.length > 0 
          ? fiveMinCandleHistory[fiveMinCandleHistory.length - 1].time
          : now;
        const rightEdge = Math.max(last, now);
        
        // Calculate appropriate bar spacing based on time range
        const barSpacing = Math.max(0.5, Math.min(20, selectedMinutes / 2));
        
        // Update time scale options for better candle sizing
        chartRef.current.timeScale().applyOptions({
          barSpacing: barSpacing,
          minBarSpacing: 0.5,
        });
        
        chartRef.current.timeScale().setVisibleRange({
          from: (rightEdge - selectedMinutes * 60) as Time,
          to: rightEdge as Time,
        });
        
        // Ensure newest candle stays on right edge
        chartRef.current.timeScale().scrollToRealTime();
        
        // Enable auto-scroll for short time ranges, disable for longer ones
        setIsAutoScroll(selectedMinutes <= 30);
      } catch (error) {
        console.warn('Error setting time range view:', error);
      }
    }, [fiveMinCandleHistory, isChartReady]);

    // Non-intrusive time range setting that doesn't affect auto-scroll
    const setTimeRange = useCallback((timeIndex: number) => {
      if (!chartRef.current || !isChartReady || isChartLocked) return;
      
      // Time values: 2m, 10m, 30m, 1h, 6h, 12h, 24h
      const timeValues = [2, 10, 30, 60, 360, 720, 1440]; // in minutes
      const selectedMinutes = timeValues[timeIndex] || 2;
      
      try {
        // Switch to 5-minute series for High/Low tab
        setActiveSeriesData('fiveMin');
        
        const now = Math.floor(Date.now() / 1000) as UTCTimestamp;
        const last = fiveMinCandleHistory.length > 0 
          ? fiveMinCandleHistory[fiveMinCandleHistory.length - 1].time
          : now;
        const rightEdge = Math.max(last, now);
        
        // Calculate appropriate bar spacing based on time range
        const barSpacing = Math.max(0.5, Math.min(20, selectedMinutes / 2));
        
        // Update time scale options for better candle sizing
        chartRef.current.timeScale().applyOptions({
          barSpacing: barSpacing,
          minBarSpacing: 0.5,
        });
        
        chartRef.current.timeScale().setVisibleRange({
          from: (rightEdge - selectedMinutes * 60) as Time,
          to: rightEdge as Time,
        });
        
        // Don't call scrollToRealTime() to avoid interfering with user's current view
        // Don't change auto-scroll state
      } catch (error) {
        console.warn('Error setting time range:', error);
      }
    }, [fiveMinCandleHistory, isChartReady, isChartLocked, setActiveSeriesData]);

    // Toggle bull/bear trigger lines without affecting chart state
    const toggleBullBearTriggers = useCallback((show: boolean) => {
      if (!chartRef.current || !isChartReady) return;
      
      if (show && !upperLimitRef.current && !lowerLimitRef.current) {
        // Create limit lines if they don't exist
        const upper = chartRef.current.addLineSeries({ 
          color: "#00ff99", 
          lineWidth: 2, 
          title: "Bull Limit",
          visible: true
        });
        const lower = chartRef.current.addLineSeries({ 
          color: "#ff4747", 
          lineWidth: 2, 
          title: "Bear Limit",
          visible: true
        });
        upperLimitRef.current = upper;
        lowerLimitRef.current = lower;
        
        // Set data if price is available
        if (currentPrice > 0) {
          updateLimitLines(currentPrice);
        }
      } else if (!show && upperLimitRef.current && lowerLimitRef.current) {
        // Hide lines by setting empty data
        upperLimitRef.current.setData([]);
        lowerLimitRef.current.setData([]);
      } else if (show && upperLimitRef.current && lowerLimitRef.current && currentPrice > 0) {
        // Show lines by setting data
        updateLimitLines(currentPrice);
      }
    }, [isChartReady, currentPrice, updateLimitLines]);

    useImperativeHandle(ref, () => ({
      showTwentyDays,
      showOneWeek,
      showOneDay,
      showFiveMinutes,
      showTimeRange,
      setTimeRange,
      toggleBullBearTriggers,
    }));

    // Initial chart setup when daily data is ready
    useEffect(() => {
      if (dailyCandleHistory.length > 0 && isChartReady) {
        const timer = setTimeout(() => {
          // Show one month of data (approximately 30 days) but align to the right
          const last = dailyCandleHistory[dailyCandleHistory.length - 1].time;
          const now = Math.floor(Date.now() / 1000) as UTCTimestamp;
          
          // Use the more recent of last candle time or current time
          const rightEdge = Math.max(last, now);
          
          chartRef.current?.timeScale().setVisibleRange({
            from: (rightEdge - 30 * 24 * 60 * 60) as Time,
            to: rightEdge as Time,
          });
          
          // Ensure the newest candle is visible on the right edge
          chartRef.current?.timeScale().scrollToRealTime();
          
          // Enable auto-scroll initially
          setIsAutoScroll(true);
        }, 100);
        return () => clearTimeout(timer);
      }
    }, [dailyCandleHistory, isChartReady]);

    // Start generating 5-minute candles when chart is ready
    useEffect(() => {
      if (isChartReady && dailyCandleHistory.length > 0 && fiveMinSeriesRef.current) {
        // Initialize first 5-minute candle
        const now = Math.floor(Date.now() / 1000);
        const fiveMinInterval = 5 * 60;
        const currentFiveMinTime = Math.floor(now / fiveMinInterval) * fiveMinInterval;
        
        const lastDaily = dailyCandleHistory[dailyCandleHistory.length - 1];
        const firstCandle: CandleData = {
          time: currentFiveMinTime as UTCTimestamp,
          open: lastDaily.close,
          high: lastDaily.close,
          low: lastDaily.close,
          close: lastDaily.close,
        };
        
        setFiveMinCandleHistory([firstCandle]);
        setCurrentPrice(lastDaily.close);
      }
    }, [isChartReady, dailyCandleHistory]);

    return <div ref={containerRef} style={{ width: "100%", height: memoizedProps.height }} />;
  }
);

// Memoized wrapper to prevent unnecessary re-renders
const MemoizedBTCRealtimeChart = React.memo(BTCRealtimeChart, (prevProps, nextProps) => {
  // Only re-render if essential props change
  return (
    prevProps.height === nextProps.height &&
    prevProps.percent === nextProps.percent &&
    prevProps.showBullBearTriggers === nextProps.showBullBearTriggers &&
    prevProps.onPrice === nextProps.onPrice
  );
});

export default MemoizedBTCRealtimeChart;
