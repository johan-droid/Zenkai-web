import { MediaDetailView } from "@/components/detail/media-detail-view";

export default async function AnimeDetailPage({ params }: PageProps<"/anime/[id]">) {
  const { id } = await params;
  return <MediaDetailView id={id} kind="anime" />;
}
