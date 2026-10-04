import { PageHeader } from "@/components/layout/page-header";
import { ScheduleView } from "@/components/schedule/schedule-view";

export const metadata = { title: "Schedule · Zenkai" };

export default function SchedulePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Schedule"
        description="Everything airing this week, shown in your local timezone."
      />
      <ScheduleView />
    </div>
  );
}
