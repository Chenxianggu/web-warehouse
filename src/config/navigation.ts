type NavigationGroup = {
  title: string;
  items: { label: string; href: string }[];
};

export const navigation: NavigationGroup[] = [
  {
    title: "工作台",
    items: [{ label: "首页概览", href: "/" }],
  },
  {
    title: "基础资料",
    items: [
      { label: "物料分类", href: "/material-categories" },
      { label: "物料管理", href: "/materials" },
      { label: "客户管理", href: "/customers" },
      { label: "供应商管理", href: "/suppliers" },
      { label: "仓库资料", href: "/warehouses" },
    ],
  },
  {
    title: "库存业务",
    items: [
      { label: "入库单", href: "/inbound-orders" },
      { label: "出库单", href: "/outbound-orders" },
      { label: "寄存货管理", href: "/consignments" },
      { label: "归属转移单", href: "/ownership-transfers" },
      { label: "盘点调整", href: "/stock-adjustments" },
    ],
  },
  {
    title: "库存查询",
    items: [
      { label: "库存余额", href: "/stock" },
      { label: "库存流水", href: "/stock-ledger" },
      { label: "欠库清单", href: "/shortages" },
    ],
  },
  {
    title: "系统管理",
    items: [{ label: "用户与权限", href: "/users" }],
  },
];

export const modulePages = navigation.flatMap((group) => group.items).filter((item) => item.href !== "/");
