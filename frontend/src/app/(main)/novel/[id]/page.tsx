import { NovelDetailView } from "@/components/detail/novel-detail-view";

export default async function NovelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NovelDetailView id={id} />;
}
