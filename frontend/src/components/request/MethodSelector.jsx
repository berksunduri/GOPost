import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui";
import { cn } from "@/lib/utils";

const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];

const methodColors = {
  GET: "text-green-400",
  POST: "text-yellow-400",
  PUT: "text-blue-400",
  DELETE: "text-red-400",
  PATCH: "text-purple-400",
  HEAD: "text-gray-400",
  OPTIONS: "text-gray-400",
};

export function MethodSelector({ value = "GET", onChange, className }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("w-[110px] font-mono font-bold", methodColors[value], className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {HTTP_METHODS.map((method) => (
          <SelectItem key={method} value={method} className={cn("font-mono font-bold", methodColors[method])}>
            {method}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
