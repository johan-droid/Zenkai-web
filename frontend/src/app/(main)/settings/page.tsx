import { PageHeader } from "@/components/layout/page-header";
import { ApiListPanel } from "@/components/settings/api-list-panel";
import { PreferencesPanel } from "@/components/settings/preferences-panel";

export const metadata = { title: "Settings · Zenkai" };

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="Preferences and data — all stored on this device." />
      <PreferencesPanel />
      <ApiListPanel />
    </div>
  );
}
