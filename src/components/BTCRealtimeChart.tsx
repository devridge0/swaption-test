"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
  ColorType,
  CrosshairMode,
} from "lightweight-charts";

type Props = {
  percent?: number;               // e.g. 0.02 for ±2%
  height?: number;                // chart height
  onPrice?: (price: number) => void; // callback with latest price
  showBullBearTriggers?: boolean; // show/hide bull/bear trigger lines
};

type CandleData = {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
};

const SIDESWAP_WS_URL = "wss://api.sideswap.io/json-rpc-ws";

// BTC/L-USDt pair on Liquid mainnet
const SIDESWAP_PAIR = {
  base: "6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d",
  quote: "ce091c998b83c78bb71a632313ba3760f1763d9cfcffae02258ffa9865a37bd2",
};

export default function BTCRealtimeChart({
  percent = 0.02,
  height = 450,
  onPrice,
  showBullBearTriggers = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const upperLimitRef = useRef<ISeriesApi<"Line"> | null>(null);
  const lowerLimitRef = useRef<ISeriesApi<"Line"> | null>(null);

  const [candleHistory, setCandleHistory] = useState<CandleData[]>([]);
  const lastPriceRef = useRef<number | null>(null);

  // Convert SideSwap "YYYY-MM-DD" → UTCTimestamp
  const parseSideSwapTime = (t: string): UTCTimestamp =>
    Math.floor(new Date(`${t}T00:00:00Z`).getTime() / 1000) as UTCTimestamp;

  // Update bull/bear trigger lines
  const updateLimitLines = useCallback(
    (price: number) => {
      if (!upperLimitRef.current || !lowerLimitRef.current) return;
      const upper = price * (1 + percent);
      const lower = price * (1 - percent);

      const start = candleHistory[0]?.time ?? (Math.floor(Date.now() / 1000) as UTCTimestamp);
      const end = Math.floor(Date.now() / 1000) as UTCTimestamp;

      upperLimitRef.current.setData([
        { time: start, value: upper },
        { time: end, value: upper },
      ]);
      lowerLimitRef.current.setData([
        { time: start, value: lower },
        { time: end, value: lower },
      ]);
    },
    [percent, candleHistory]
  );

  // Init chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: { background: { type: ColorType.Solid, color: "#111" }, textColor: "#d1d4dc" },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { timeVisible: true },
    });

    const series = chart.addCandlestickSeries({
      upColor: "#009286",
      downColor: "#FF4747",
      borderVisible: false,
      wickUpColor: "#009286",
      wickDownColor: "#FF4747",
    });

    let upper: ISeriesApi<"Line"> | null = null;
    let lower: ISeriesApi<"Line"> | null = null;
    if (showBullBearTriggers) {
      upper = chart.addLineSeries({ color: "#00ff99", lineWidth: 2 });
      lower = chart.addLineSeries({ color: "#ff4747", lineWidth: 2 });
    }

    chartRef.current = chart;
    seriesRef.current = series;
    upperLimitRef.current = upper;
    lowerLimitRef.current = lower;

    return () => chart.remove();
  }, [height, showBullBearTriggers]);

  // Load historical candles from SideSwap
  useEffect(() => {
    const ws = new WebSocket(SIDESWAP_WS_URL);

    ws.onopen = () => {
      const req = {
        id: 1,
        jsonrpc: "2.0",
        method: "market",
        params: {
          chart_sub: { asset_pair: { base: SIDESWAP_PAIR.base, quote: SIDESWAP_PAIR.quote } },
        },
      };
      ws.send(JSON.stringify(req));
    };

    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);

      if (msg.result?.chart_sub?.data) {
        const candles: CandleData[] = msg.result.chart_sub.data.map((d: any) => ({
          time: parseSideSwapTime(d.time),
          open: Number(d.open),
          high: Number(d.high),
          low: Number(d.low),
          close: Number(d.close),
        }));
        setCandleHistory(candles);
        seriesRef.current?.setData(candles);

        const latest = candles[candles.length - 1]?.close;
        if (latest) {
          lastPriceRef.current = latest;
          onPrice?.(latest);
          updateLimitLines(latest);
        }
      }
    };

    return () => ws.close();
  }, [onPrice, updateLimitLines]);

  // Realtime price updates from Binance ticker, throttled to ~10s
  useEffect(() => {
    const ws = new WebSocket("wss://stream.binance.com:9443/ws/btcusdt@ticker");
    let lastUpdate = 0;

    ws.onmessage = (evt) => {
      const now = Date.now();
      if (now - lastUpdate < 10_000) return; // throttle 10s
      lastUpdate = now;

      try {
        const msg = JSON.parse(evt.data);
        const price = Number(msg.c);
        if (!Number.isFinite(price)) return;

        // update last candle
        setCandleHistory((prev) => {
          if (prev.length === 0) return prev;
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            close: price,
          };
          seriesRef.current?.setData(updated);

          lastPriceRef.current = price;
          onPrice?.(price);
          updateLimitLines(price);

          return updated;
        });
      } catch (e) {
        console.error("Binance WS parse error", e);
      }
    };

    return () => ws.close();
  }, [onPrice, updateLimitLines]);

  return <div ref={containerRef} style={{ width: "100%", height }} />;
}
