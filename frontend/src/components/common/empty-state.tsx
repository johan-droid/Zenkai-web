import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="glass-panel flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-400/30 to-brand-700/20">
        <Icon className="size-6 text-brand-400" />
      </span>
      <h2 className="text-base font-semibold">{title}</h2>
      {description ? (
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action}
    </div>
  );
}
