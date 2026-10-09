import { InboundWorkbench } from "./inbound-workbench";
import { listInboundMaterials, listInboundRecords } from "./actions";

export default async function InboundOrdersPage() {
  const [initialData, materials] = await Promise.all([
    listInboundRecords("", "", 1, 10),
    listInboundMaterials(),
  ]);

  return <InboundWorkbench initialData={initialData} materials={materials} />;
}
