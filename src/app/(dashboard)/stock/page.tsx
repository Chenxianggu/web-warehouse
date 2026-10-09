import { InventoryWorkbench } from "./inventory-workbench";
import { listMaterials } from "./actions";

export default async function StockPage() {
  const initialData = await listMaterials("", 1, 10);
  return <InventoryWorkbench initialData={initialData} />;
}
