import { AnimeDetailView } from "@/components/detail/anime-detail-view";

export default async function AnimeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AnimeDetailView id={id} />;
}