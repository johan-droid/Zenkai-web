import { TimelineView } from "@/components/schedule/timeline-view";

export const metadata = { title: "Schedule · Zenkai" };

export default function SchedulePage() {
  return <TimelineView initialTimeZone="UTC" />;
}
