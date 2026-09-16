export type NavigationItem = {
  label: string;
  href: string;
  description: string;
};

export type NavigationGroup = {
  title: string;
  items: NavigationItem[];
};

export const navigation: NavigationGroup[] = [
  {
    title: "工作台",
    items: [{ label: "首页", href: "/", description: "返回业务总览与功能入口" }],
  },
  {
    title: "库存作业",
    items: [
      { label: "库存管理", href: "/stock", description: "查看当前库存与可用数量" },
      { label: "入库登记", href: "/inbound-orders", description: "登记到货与入库信息" },
      { label: "发货出库", href: "/outbound-orders", description: "处理发货与库存扣减" },
      { label: "客户寄存", href: "/consignments", description: "管理客户寄存货物" },
    ],
  },
  {
    title: "客户与订单",
    items: [
      { label: "客户资料", href: "/customers", description: "维护客户档案与联系信息" },
      { label: "客户订单", href: "/customer-orders", description: "录入并跟进客户订单" },
      { label: "订单查询", href: "/order-search", description: "按条件检索订单记录" },
      { label: "应收账款", href: "/receivables", description: "查看客户应收与回款" },
    ],
  },
  {
    title: "采购与销售",
    items: [
      { label: "订货管理", href: "/purchase-orders", description: "安排采购与补货计划" },
      { label: "价格趋势", href: "/price-trends", description: "查看历史价格变化" },
      { label: "售整柜货", href: "/full-container-sales", description: "登记整柜销售业务" },
    ],
  },
  {
    title: "系统工具",
    items: [
      { label: "税点计算器", href: "/tax-calculator", description: "换算含税与未税金额" },
      { label: "菜单管理", href: "/menu-management", description: "配置系统功能菜单" },
      { label: "用户管理", href: "/users", description: "维护账号与访问权限" },
    ],
  },
];

export const modulePages = navigation.flatMap((group) => group.items).filter((item) => item.href !== "/");
