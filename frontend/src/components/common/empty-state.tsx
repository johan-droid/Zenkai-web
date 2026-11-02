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
    <div className="flex flex-col items-center gap-3 border-y border-white/[0.07] px-6 py-14 text-center">
      <Icon className="size-6 text-ink-3" aria-hidden="true" />
      <h2 className="text-base font-semibold text-ink-1">{title}</h2>
      {description ? (
        <p className="max-w-md text-sm leading-relaxed text-ink-3">{description}</p>
      ) : null}
      {action}
    </div>
  );
}
