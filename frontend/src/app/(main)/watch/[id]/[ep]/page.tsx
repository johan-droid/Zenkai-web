import { WatchView } from "@/components/player/watch-view";

export default async function WatchPage({ params }: { params: Promise<{ id: string; ep: string }> }) {
  const { id, ep } = await params;
  // `params` is already resolved at this point in App Router.
  return <WatchView id={id} episode={ep} />;
}
