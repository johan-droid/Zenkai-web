export function evaluateUrlTemplate(
  template: string,
  params: {
    episode: number;
    externalIds: Record<string, string>;
  }
): string | null {
  let url = template;

  // Replace episode placeholder
  url = url.replaceAll("{episode}", params.episode.toString());

  // Replace external ID placeholders
  for (const [idType, idVal] of Object.entries(params.externalIds)) {
    url = url.replaceAll(`{${idType}_id}`, idVal);
    url = url.replaceAll(`{${idType}}`, idVal);
  }

  // If unreplaced placeholders remain, URL resolution fails
  if (/\{[a-zA-Z0-9_]+\}/.test(url)) {
    return null;
  }

  return url;
}
