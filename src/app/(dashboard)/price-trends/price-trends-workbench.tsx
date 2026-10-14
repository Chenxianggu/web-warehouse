"use client";

import dynamic from "next/dynamic";
import { useRef, useState, useTransition } from "react";
import { ChartNoAxesCombined, Search } from "lucide-react";
import { toast } from "sonner";
import type { PricePoint, PriceTrendQuery } from "@/features/price-trends/schema";
import { queryPriceHistory, queryPriceItemCodes } from "./actions";
import { ItemCodeSelect } from "./item-code-select";
import styles from "./price-trends.module.css";

const PriceHistoryChart = dynamic(() => import("./price-history-chart"), { ssr: false, loading: () => <div className={styles.empty} role="status">正在载入图表…</div> });

export function PriceTrendsWorkbench({ initialCodes, initialPoints, initialError, years }: {
  initialCodes: string[]; initialPoints: PricePoint[]; initialError: string; years: number[];
}) {
  const [codes, setCodes] = useState(initialCodes);
  const [query, setQuery] = useState<PriceTrendQuery>({ itemCode: initialCodes[0] ?? "", year: years[0] });
  const [points, setPoints] = useState(initialPoints);
  const [error, setError] = useState(initialError);
  const [loading, startLoad] = useTransition();
  const requestId = useRef(0);

  function load(next: PriceTrendQuery, refreshCodes = false) {
    const request = ++requestId.current;
    setQuery(next); setPoints([]); setError("");
    if (!next.itemCode && !refreshCodes) return;
    startLoad(async () => {
      try {
        let itemCode = next.itemCode;
        if (refreshCodes) {
          const freshCodes = await queryPriceItemCodes();
          if (request !== requestId.current) return;
          setCodes(freshCodes);
          if (!itemCode && !codes.length) itemCode = freshCodes[0] ?? "";
        }
        const history = itemCode ? await queryPriceHistory({ itemCode, year: next.year }) : [];
        if (request !== requestId.current) return;
        setQuery({ itemCode, year: next.year }); setPoints(history);
      } catch {
        if (request !== requestId.current) return;
        setError("加载价格数据失败，请检查连接后重新查询。"); toast.error("加载价格数据失败");
      }
    });
  }

  return <div className={styles.page}>
    <header className={styles.hero}><div><h1>价格趋势</h1><p>按货号与年份，查看订货单价的历史变化。</p></div><ChartNoAxesCombined aria-hidden="true" /></header>
    <section className={styles.panel} aria-label="货号价格趋势" aria-busy={loading}>
      <form className={styles.controls} onSubmit={(event) => { event.preventDefault(); load(query, true); }}>
        <div className={styles.field}><label htmlFor="trend-item-code">货号</label><ItemCodeSelect value={query.itemCode} options={codes} onChange={(itemCode) => load({ ...query, itemCode })} /></div>
        <div className={`${styles.field} ${styles.yearField}`}><label htmlFor="trend-year">年份</label><select id="trend-year" value={query.year} onChange={(event) => load({ ...query, year: Number(event.target.value) })}>{years.map((year) => <option key={year} value={year}>{year} 年</option>)}</select></div>
        <button className={styles.primaryButton} disabled={loading}><Search aria-hidden="true" />{loading ? "查询中…" : "查询"}</button>
      </form>
      <div className={styles.chartHeader}><h2>货号价格趋势</h2><span>{query.itemCode ? `${query.itemCode} · ${query.year} 年` : "单价（元/吨）"}</span></div>
      <div className={styles.chartArea}>
        {loading && query.itemCode ? <div className={styles.empty} role="status">正在加载价格记录…</div> : error ? <div className={`${styles.empty} ${styles.error}`} role="alert"><strong>价格数据加载失败</strong><span>{error}</span></div> : points.length ?
          <PriceHistoryChart key={`${query.itemCode}-${query.year}`} points={points} itemCode={query.itemCode} year={query.year} /> :
          <div className={styles.empty} role="status"><ChartNoAxesCombined aria-hidden="true" /><strong>{query.itemCode ? `当前货号「${query.itemCode}」在 ${query.year} 年暂无订货记录` : "请选择货号查看价格趋势"}</strong>{!codes.length && <span>暂无订货货号，录入订货记录后可在此查询。</span>}</div>}
      </div>
      <div className={styles.chartFooter}><span>价格来自订货记录，单位：元/吨。</span><span>同日同价合并，同日不同价分别展示。</span></div>
    </section>
  </div>;
}
