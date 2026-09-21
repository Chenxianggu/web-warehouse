import { requirePageAccess } from "@/server/menu-permissions";
import { TaxCalculator } from "@/components/tax-calculator";

export default async function TaxCalculatorPage() {
  await requirePageAccess("/tax-calculator");

  return <TaxCalculator />;
}
