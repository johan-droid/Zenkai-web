import { Play } from "lucide-react";

import { WatchView } from "@/components/player/watch-view";

export default function WatchPage({ params }: PageProps<"/watch/[id]/[ep]">) {
  // `params` is already resolved at this point in App Router.
  return <WatchView />;
}
