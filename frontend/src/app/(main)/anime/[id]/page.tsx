import { AnimeDetailView } from "@/components/detail/anime-detail-view";

export default async function AnimeDetailPage({ params }: PageProps<"/anime/[id]">) {
  const { id } = await params;
  return <AnimeDetailView id={id} />;
}