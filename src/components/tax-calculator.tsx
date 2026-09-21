"use client";

import { useMemo, useState } from "react";
import { Calculator, RotateCcw, ArrowDownToLine, ArrowUpFromLine, Percent, ReceiptText } from "lucide-react";
import styles from "./tax-calculator.module.css";

const VAT_RATE = 0.13;
const TAX_INCLUDED_DIVISOR = 1.13;
const ADDITIONAL_TAX_BASE_RATE = 0.12;
const HALF_RATE = 0.5;
const STAMP_TAX_RATE = 0.0003;
const CORPORATE_INCOME_TAX_RATE = 0.05;

const money = (value: number) =>
  new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number.isFinite(value) ? value : 0,
  );

const percent = (value: number) => `${(Number.isFinite(value) ? value : 0) * 100 < 0 ? "−" : ""}${Math.abs((Number.isFinite(value) ? value : 0) * 100).toFixed(4)}%`;

function NumberField({
  value,
  onChange,
  step = 100,
  min = 0,
  max,
  suffix = "元",
}: {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  return (
    <label className={styles.numberField}>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = Number(event.target.value);
          onChange(Number.isFinite(next) ? next : 0);
        }}
      />
      <span>{suffix}</span>
    </label>
  );
}

function Metric({ label, value, accent = false }: { label: string; value?: string; accent?: boolean }) {
  return (
    <div className={`${styles.metric} ${accent ? styles.metricAccent : ""}`}>
      <span>{label}</span>
      <strong>{value ?? "—"}</strong>
    </div>
  );
}

function ResultRow({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`${styles.resultRow} ${emphasis ? styles.resultEmphasis : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function TaxCalculator() {
  const [supplierInvoiceAmount, setSupplierInvoiceAmount] = useState(7080);
  const [salesInvoiceAmount, setSalesInvoiceAmount] = useState(7480);
  const [costWithoutPublicTaxPoint, setCostWithoutPublicTaxPoint] = useState(8.5);
  const [costWithPublicTaxPoint, setCostWithPublicTaxPoint] = useState(8.5);

  const values = useMemo(() => {
    const supplierTaxExcludedAmount = supplierInvoiceAmount / TAX_INCLUDED_DIVISOR;
    const supplierInputTax = supplierTaxExcludedAmount * VAT_RATE;
    const salesTaxExcludedIncome = salesInvoiceAmount / TAX_INCLUDED_DIVISOR;
    const salesOutputVat = salesTaxExcludedIncome * VAT_RATE;
    const payableVat = (salesTaxExcludedIncome - supplierTaxExcludedAmount) * VAT_RATE;
    const additionalTax = payableVat * ADDITIONAL_TAX_BASE_RATE * HALF_RATE;
    const stampTax = (supplierInvoiceAmount + salesInvoiceAmount) * STAMP_TAX_RATE * HALF_RATE;
    const profitBeforeTax = salesTaxExcludedIncome - supplierTaxExcludedAmount - additionalTax - stampTax;
    const corporateIncomeTax = profitBeforeTax * CORPORATE_INCOME_TAX_RATE;
    const totalTax = payableVat + additionalTax + stampTax + corporateIncomeTax;

    return {
      supplierTaxExcludedAmount,
      supplierInputTax,
      salesTaxExcludedIncome,
      salesOutputVat,
      payableVat,
      additionalTax,
      stampTax,
      corporateIncomeTax,
      totalTax,
      vatBurdenRate: salesTaxExcludedIncome > 0 ? payableVat / salesTaxExcludedIncome : 0,
      corporateIncomeTaxBurdenRate: salesTaxExcludedIncome > 0 ? corporateIncomeTax / salesTaxExcludedIncome : 0,
      comprehensiveTaxBurdenRate: salesTaxExcludedIncome > 0 ? totalTax / salesTaxExcludedIncome : 0,
      extraTaxPointTotalRate: salesInvoiceAmount > 0 ? totalTax / salesInvoiceAmount : 0,
      costWithoutPublicAccount: supplierInvoiceAmount * (1 - costWithoutPublicTaxPoint / 100),
      costWithPublicAccount: salesInvoiceAmount * (1 - costWithPublicTaxPoint / 100),
    };
  }, [supplierInvoiceAmount, salesInvoiceAmount, costWithoutPublicTaxPoint, costWithPublicTaxPoint]);

  function reset() {
    setSupplierInvoiceAmount(7080);
    setSalesInvoiceAmount(7480);
    setCostWithoutPublicTaxPoint(8.5);
    setCostWithPublicTaxPoint(8.5);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}><Calculator aria-hidden="true" /> 财务工具 / 01</div>
          <h1>开票税点计算器</h1>
          <p>输入供应商与销售方的含税开票金额，实时拆解税额、税负与实际成本。</p>
        </div>
        <button type="button" className={styles.resetButton} onClick={reset}>
          <RotateCcw aria-hidden="true" /> 恢复示例
        </button>
      </header>

      <section className={styles.metrics} aria-label="税率参考">
        <Metric label="一般货物销项税率" value="13%" accent />
        <Metric label="增值税税负参考" value="0.20% — 0.22%" />
        <Metric label="企业所得税税率" value="5%" />
        <Metric label="其他批发业参考税负" value="0.85%" />
      </section>

      <section className={styles.workspace}>
        <article className={`${styles.panel} ${styles.inputPanel}`}>
          <div className={styles.panelHeader}>
            <div><span className={styles.panelKicker}>INPUT / A</span><h2>供应商</h2></div>
            <ArrowDownToLine aria-hidden="true" />
          </div>
          <div className={styles.amountBlock}>
            <span>含税开票金额</span>
            <NumberField value={supplierInvoiceAmount} onChange={setSupplierInvoiceAmount} />
          </div>
          <div className={styles.detailList}>
            <ResultRow label="不含税金额" value={`￥ ${money(values.supplierTaxExcludedAmount)}`} />
            <ResultRow label="进项税额" value={`￥ ${money(values.supplierInputTax)}`} />
          </div>
          <p className={styles.formula}>含税金额 ÷ 1.13 = 不含税金额</p>
        </article>

        <article className={`${styles.panel} ${styles.inputPanel}`}>
          <div className={styles.panelHeader}>
            <div><span className={styles.panelKicker}>INPUT / B</span><h2>销售方</h2></div>
            <ArrowUpFromLine aria-hidden="true" />
          </div>
          <div className={styles.amountBlock}>
            <span>含税开票金额</span>
            <NumberField value={salesInvoiceAmount} onChange={setSalesInvoiceAmount} />
          </div>
          <div className={styles.detailList}>
            <ResultRow label="不含税收入" value={`￥ ${money(values.salesTaxExcludedIncome)}`} />
            <ResultRow label="销项税额" value={`￥ ${money(values.salesOutputVat)}`} />
          </div>
          <p className={styles.formula}>金额变化后，右侧结果会自动更新</p>
        </article>

        <article className={`${styles.panel} ${styles.resultPanel}`}>
          <div className={styles.panelHeader}>
            <div><span className={styles.panelKicker}>OUTPUT / TAX</span><h2>税额拆解</h2></div>
            <ReceiptText aria-hidden="true" />
          </div>
          <div className={styles.resultGrid}>
            <ResultRow label="应交增值税" value={`￥ ${money(values.payableVat)}`} />
            <ResultRow label="附加税" value={`￥ ${money(values.additionalTax)}`} />
            <ResultRow label="印花税" value={`￥ ${money(values.stampTax)}`} />
            <ResultRow label="企业所得税" value={`￥ ${money(values.corporateIncomeTax)}`} />
            <ResultRow label="合计税额" value={`￥ ${money(values.totalTax)}`} emphasis />
          </div>
        </article>

        <article className={`${styles.panel} ${styles.resultPanel}`}>
          <div className={styles.panelHeader}>
            <div><span className={styles.panelKicker}>OUTPUT / RATE</span><h2>税负指标</h2></div>
            <Percent aria-hidden="true" />
          </div>
          <div className={styles.resultGrid}>
            <ResultRow label="增值税税负" value={percent(values.vatBurdenRate)} />
            <ResultRow label="企业所得税负" value={percent(values.corporateIncomeTaxBurdenRate)} />
            <ResultRow label="综合负税率" value={percent(values.comprehensiveTaxBurdenRate)} emphasis />
            <ResultRow label="开票加收税点合计" value={percent(values.extraTaxPointTotalRate)} emphasis />
          </div>
        </article>
      </section>

      <section className={styles.costSection}>
        <div className={styles.costIntro}><span className={styles.panelKicker}>COST ESTIMATE</span><h2>实际成本估算</h2><p>调整税点，快速比较两种入账方式。</p></div>
        <div className={styles.costCards}>
          <div className={styles.costCard}>
            <div><span>成本不过公户</span><small>税点</small></div>
            <NumberField value={costWithoutPublicTaxPoint} onChange={setCostWithoutPublicTaxPoint} step={0.1} max={100} suffix="%" />
            <strong>￥ {money(values.costWithoutPublicAccount)}</strong>
          </div>
          <div className={styles.costCard}>
            <div><span>成本过公户</span><small>税点</small></div>
            <NumberField value={costWithPublicTaxPoint} onChange={setCostWithPublicTaxPoint} step={0.1} max={100} suffix="%" />
            <strong>￥ {money(values.costWithPublicAccount)}</strong>
          </div>
        </div>
      </section>
      <footer className={styles.note}>计算结果仅供业务测算参考，实际申报请以财务制度与税务口径为准。</footer>
    </main>
  );
}
