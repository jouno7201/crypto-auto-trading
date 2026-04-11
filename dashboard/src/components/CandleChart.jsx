import { useEffect, useRef } from 'react';
import { createChart } from 'lightweight-charts';

export default function CandleChart({ candles, trades, height = 380 }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const markerCache = useRef([]);

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { color: '#161b22' }, textColor: '#8b949e' },
      grid: { vertLines: { color: '#21262d' }, horzLines: { color: '#21262d' } },
      crosshair: { mode: 0 },
      timeScale: { timeVisible: true, secondsVisible: false },
      width: containerRef.current.clientWidth,
      height,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#3fb950',
      downColor: '#f85149',
      borderVisible: false,
      wickUpColor: '#3fb950',
      wickDownColor: '#f85149',
    });

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    });
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [height]);

  // Update data
  useEffect(() => {
    if (!candleSeriesRef.current || !candles?.length) return;

    const mapped = candles.map((c) => ({
      time: Math.floor(new Date(c.timestamp).getTime() / 1000),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    candleSeriesRef.current.setData(mapped);

    // Volume bars
    const volumes = candles.map((c) => ({
      time: Math.floor(new Date(c.timestamp).getTime() / 1000),
      value: c.volume || 0,
      color: c.close >= c.open ? 'rgba(63,185,80,0.3)' : 'rgba(248,81,73,0.3)',
    }));
    volumeSeriesRef.current.setData(volumes);

    // Trade markers
    if (trades?.length && candleSeriesRef.current) {
      const markers = trades
        .filter((t) => t.timestamp || t.time)
        .map((t) => ({
          time: Math.floor(new Date(t.timestamp || t.time).getTime() / 1000),
          position: (t.type || t.side) === 'sell' ? 'aboveBar' : 'belowBar',
          color: (t.type || t.side) === 'sell' ? '#f85149' : '#3fb950',
          shape: (t.type || t.side) === 'sell' ? 'arrowDown' : 'arrowUp',
          text: (t.type || t.side) === 'sell' ? 'S' : 'B',
        }))
        .sort((a, b) => a.time - b.time);
      candleSeriesRef.current.setMarkers(markers);
      markerCache.current = markers;
    }
  }, [candles, trades]);

  return <div ref={containerRef} style={{ height }} />;
}
