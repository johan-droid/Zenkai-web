import { ReadView } from "@/components/reader/read-view";

/**
 * Manga reader route (P17).
 *
 * The URL uses AniList ids — that is what browse, search and the library link
 * to — and the canonical backend bridges that id to the MangaDex catalogue
 * internally. The frontend no longer calls AniList or MangaDex directly: one
 * validated request resolves the title, and the reader component fetches
 * chapters and pages from the same backend.
 *
 * Failure semantics match the contract: a 404 is a missing title, a network or
 * contract failure is an unavailable title, and a partial payload is never
 * rendered as a full reader.
 */
export default async function ReadPage({
  params,
}: {
  params: Promise<{ id: string; chapter: string }>;
}) {
  const { id, chapter } = await params;
  return <ReadView id={id} chapter={chapter} />;
}


