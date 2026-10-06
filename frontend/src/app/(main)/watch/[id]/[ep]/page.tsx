import { WatchView } from "@/components/player/watch-view";

export default async function WatchPage({ params }: PageProps<"/watch/[id]/[ep]">) {
  const { id, ep } = await params;
  // `params` is already resolved at this point in App Router.
  return <WatchView id={id} episode={ep} />;
}
