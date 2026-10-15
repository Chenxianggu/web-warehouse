"use client";

import { useMemo } from "react";
import { SearchCombobox } from "@/components/search-combobox";

type MaterialOption = { code: string; name: string };

export function MaterialCodeCombobox({ options, ...props }: {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly MaterialOption[];
  label: string;
  disabled?: boolean;
  maxLength?: number;
}) {
  const items = useMemo(() => options.map((item) => ({
    id: item.code, value: item.code, label: item.code, description: item.name,
  })), [options]);

  return <SearchCombobox {...props} options={items} required placeholder="选择或输入编号" emptyMessage="暂无匹配库存，可继续使用当前编号。" />;
}
