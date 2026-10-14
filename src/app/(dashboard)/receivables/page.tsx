import { queryReceivables } from "./actions";
import { ReceivablesWorkbench } from "./receivables-workbench";

export default async function ReceivablesPage() {
  return <ReceivablesWorkbench initial={await queryReceivables()} />;
}
