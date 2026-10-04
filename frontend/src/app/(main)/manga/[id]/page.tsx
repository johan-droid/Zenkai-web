import { MediaDetailView } from "@/components/detail/media-detail-view";

export default async function MangaDetailPage({ params }: PageProps<"/manga/[id]">) {
  const { id } = await params;
  return <MediaDetailView id={id} kind="manga" />;
}
