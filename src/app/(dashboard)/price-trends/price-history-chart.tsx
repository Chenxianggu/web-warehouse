"use client";

import { useEffect, useId, useRef, useState } from "react";
import { init, use as registerCharts, type ComposeOption, type EChartsType } from "echarts/core";
import { LineChart, type LineSeriesOption } from "echarts/charts";
import { AriaComponent, GridComponent, TooltipComponent, type AriaComponentOption, type GridComponentOption, type TooltipComponentOption } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { priceAxisBounds, shouldSamplePrices, type PricePoint } from "@/features/price-trends/schema";
import styles from "./price-trends.module.css";

registerCharts([LineChart, GridComponent, TooltipComponent, AriaComponent, CanvasRenderer]);
type ChartOption = ComposeOption<LineSeriesOption | GridComponentOption | TooltipComponentOption | AriaComponentOption>;
const amount = (value: number) => `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PriceHistoryChart({ points, itemCode, year }: { points: PricePoint[]; itemCode: string; year: number }) {
  const canvas = useRef<HTMLDivElement>(null);
  const chart = useRef<EChartsType | null>(null);
  const hintId = useId();
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    if (!canvas.current) return;
    const host = canvas.current;
    const theme = getComputedStyle(host);
    const color = (token: string) => theme.getPropertyValue(token).trim();
    const gold = color("--rz-gold"), ivory = color("--rz-ivory"), panel = color("--rz-panel"), black = color("--rz-black");
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const instance = init(host, undefined, { renderer: "canvas" });
    chart.current = instance;
    const bounds = priceAxisBounds(points), sampling = shouldSamplePrices(points.length);
    const option: ChartOption = {
      useUTC: true, animation: !media.matches, animationDuration: 300,
      textStyle: { fontFamily: theme.fontFamily, color: ivory },
      aria: { enabled: true, label: { description: `${itemCode}，${year}年订货单价趋势，共${points.length}个日期价格点，单位元每吨。` } },
      tooltip: {
        trigger: "item", confine: true, backgroundColor: panel, borderColor: gold, borderWidth: 1,
        textStyle: { color: ivory, fontSize: 12 }, extraCssText: "border-radius:0;box-shadow:0 8px 24px rgba(0,0,0,.6)",
        formatter: (params) => {
          const entry = Array.isArray(params) ? params[0] : params;
          const value = entry.value;
          if (!Array.isArray(value)) return "";
          // Read the plotted point, not its pre-sampling index.
          return `${new Date(Number(value[0])).toISOString().slice(0, 10)}<br/>单价：${amount(Number(value[1]))}`;
        },
      },
      grid: { left: 14, right: 25, top: host.clientHeight < 380 ? 32 : 48, bottom: host.clientHeight < 380 ? 20 : 28, outerBoundsMode: "same", outerBoundsContain: "axisLabel" },
      xAxis: { type: "time", boundaryGap: [0, 0], splitNumber: host.clientWidth < 500 ? 4 : 8,
        axisLine: { lineStyle: { color: gold, opacity: 0.35 } }, axisTick: { show: false },
        axisLabel: { color: ivory, opacity: 0.6, fontSize: 11, rotate: 45, hideOverlap: true, formatter: (value: number) => { const date = new Date(value); return `${date.getUTCMonth() + 1}-${date.getUTCDate()}`; } },
      },
      yAxis: { type: "value", name: "单价（元/吨）", scale: true, min: bounds.min, max: bounds.max, minInterval: 50, splitNumber: host.clientHeight < 380 ? 4 : 8,
        nameTextStyle: { color: ivory, opacity: 0.65, fontSize: 11 },
        axisLabel: { color: ivory, opacity: 0.6, fontSize: 11, formatter: (value: number) => `¥${value.toLocaleString("zh-CN")}` },
        splitLine: { lineStyle: { color: ivory, opacity: 0.08 } },
      },
      series: [{ name: "单价", type: "line", smooth: false, symbol: "circle", symbolSize: sampling ? 4 : 6, sampling: sampling ? "lttb" : undefined,
        data: points.map((point) => [Date.parse(`${point.orderDate}T00:00:00Z`), point.unitPrice]),
        itemStyle: { color: gold, borderColor: black, borderWidth: 1 }, lineStyle: { color: gold, width: 2 },
        areaStyle: { color: gold, opacity: 0.055 }, emphasis: { scale: 1.7 },
      }],
    };
    instance.setOption(option);
    const resize = new ResizeObserver(() => {
      const short = host.clientHeight < 380;
      instance.resize();
      instance.setOption({ xAxis: { splitNumber: host.clientWidth < 500 ? 4 : 8 }, yAxis: { splitNumber: short ? 4 : 8 }, grid: { top: short ? 32 : 48, bottom: short ? 20 : 28 } });
    });
    resize.observe(host);
    const changeMotion = () => instance.setOption({ animation: !media.matches });
    media.addEventListener("change", changeMotion);
    return () => { resize.disconnect(); media.removeEventListener("change", changeMotion); chart.current = null; instance.dispose(); };
  }, [points, itemCode, year]);

  return <div className={styles.chartFrame}>
    <div ref={canvas} className={styles.chart} tabIndex={0} role="group" aria-label={`${itemCode} ${year}年价格趋势图`} aria-describedby={hintId}
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(event.key)) return;
        event.preventDefault();
        if (event.key === "Escape") { setSelected(null); chart.current?.dispatchAction({ type: "hideTip" }); return; }
        const next = event.key === "Home" ? 0 : event.key === "End" ? points.length - 1 : selected === null ? 0 : Math.max(0, Math.min(points.length - 1, selected + (event.key === "ArrowRight" ? 1 : -1)));
        setSelected(next);
      }} onBlur={() => setSelected(null)} />
    <div className={styles.chartHint} id={hintId}><span>悬停或轻触查看单价；聚焦图表后可用左右键逐点查看。</span>
      <output aria-live="polite">{selected !== null && points[selected] ? `${points[selected].orderDate}　单价：${amount(points[selected].unitPrice)}` : `${points.length} 个价格点`}</output></div>
  </div>;
}
