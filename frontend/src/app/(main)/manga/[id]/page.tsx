import { MediaDetailView } from "@/components/detail/media-detail-view";

export default async function MangaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MediaDetailView id={id} />;
}