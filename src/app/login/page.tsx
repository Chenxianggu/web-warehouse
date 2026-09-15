import {
  CircleAlert,
  Fingerprint,
  LockKeyhole,
  PackageOpen,
  RadioTower,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "./actions";
import styles from "./login.module.css";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; changed?: string }>;
}) {
  const query = await searchParams;

  return (
    <main className={styles.page}>
      <div className={styles.atmosphere} aria-hidden="true">
        <div className={styles.goldPlane} />
        <div className={styles.magentaSlash} />
        <div className={styles.dataColumns} />
        <div className={styles.scanBand} />
        <div className={styles.scanlines} />
      </div>

      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandGlyph}>RZ</span>
          <span>
            <strong>任仲塑料</strong>
            <small>仓储管理系统</small>
          </span>
        </div>
        <div className={styles.linkState}>
          <RadioTower aria-hidden="true" />
          <span>安全链路已建立</span>
        </div>
      </header>

      <section className={styles.composition}>
        <div className={styles.hero}>
          <div className={styles.nodeLabel}>
            <span>节点 01</span>
            <span>访问网关</span>
          </div>
          <h1 className={styles.glitchTitle} data-text="仁众仓储">
            任仲仓储
          </h1>
          <p className={styles.productName}>塑料仓储管理系统</p>
          <div className={styles.heroLine} />
          <p className={styles.heroDescription}>
            库存流转、批次追踪与仓库作业的统一入口。
          </p>

          <div className={styles.readout}>
            <div>
              <span>链路</span>
              <strong>在线</strong>
            </div>
            <div>
              <span>协议</span>
              <strong>加密</strong>
            </div>
            <div>
              <span>权限</span>
              <strong>待验证</strong>
            </div>
          </div>
        </div>

        <div className={styles.terminalFrame}>
          <div className={styles.terminal}>
            <div className={styles.terminalTopline}>
              <span>身份验证</span>
              <span className={styles.onlineState}>系统在线</span>
            </div>

            <div className={styles.terminalHeading}>
              <Fingerprint aria-hidden="true" />
              <div>
                <h2>登录系统</h2>
                <p>验证身份后进入仓储控制台</p>
              </div>
            </div>

            {query.error && (
              <Alert variant="destructive" className={styles.alert}>
                <CircleAlert aria-hidden="true" />
                <AlertDescription>
                  用户名或密码不正确，或账号已停用。
                </AlertDescription>
              </Alert>
            )}
            {query.changed && (
              <Alert className={styles.successAlert}>
                <AlertDescription>密码已修改，请重新登录。</AlertDescription>
              </Alert>
            )}

            <form action={loginAction} className={styles.form}>
              <div className={styles.field}>
                <div className={styles.fieldHeader}>
                  <span>01</span>
                  <Label htmlFor="username">用户名</Label>
                </div>
                <Input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  placeholder="输入用户名"
                  required
                  autoFocus
                  className={styles.input}
                />
              </div>
              <div className={styles.field}>
                <div className={styles.fieldHeader}>
                  <span>02</span>
                  <Label htmlFor="password">密码</Label>
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="输入密码"
                  required
                  className={styles.input}
                />
              </div>
              <Button type="submit" size="lg" className={styles.submitButton}>
                <span>确认登录</span>
                <span className={styles.buttonCode}>ENTER_01</span>
              </Button>
            </form>

            <div className={styles.accessNote}>
              <LockKeyhole aria-hidden="true" />
              未授权访问将被记录
            </div>
          </div>
        </div>
      </section>

      <footer className={styles.ticker}>
        <div className={styles.tickerTrack}>
          <span><PackageOpen /> 批次追踪</span>
          <span>库存同步</span>
          <span>入库管理</span>
          <span>出库管理</span>
          <span><PackageOpen /> 批次追踪</span>
          <span>库存同步</span>
          <span>入库管理</span>
          <span>出库管理</span>
        </div>
      </footer>
    </main>
  );
}
