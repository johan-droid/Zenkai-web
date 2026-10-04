"use client";

import { Gauge } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function QualityMenu({
  rate,
  onRateChange,
}: {
  rate: number;
  onRateChange: (rate: number) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="glass rounded-xl">
          <Gauge />
          {rate}×
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="glass-strong">
        <DropdownMenuLabel>Playback speed</DropdownMenuLabel>
        {RATES.map((option) => (
          <DropdownMenuItem
            key={option}
            onSelect={() => onRateChange(option)}
            className={cn(option === rate && "text-brand-400")}
          >
            {option}× {option === 1 ? "(normal)" : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
