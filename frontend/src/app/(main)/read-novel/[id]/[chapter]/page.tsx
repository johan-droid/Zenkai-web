import { NovelReader } from "@/components/reader/novel-reader";

export default async function ReadNovelPage({
  params,
}: {
  params: Promise<{ id: string; chapter: string }>;
}) {
  const { id, chapter } = await params;
  const chapterNumber = Number(chapter) || 1;

  return <NovelReader novelId={id} chapterNumber={chapterNumber} />;
}
