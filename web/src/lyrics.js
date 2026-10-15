function timedLines(value) {
  const result = [];
  for (const source of value.split(/\r?\n/)) {
    const stamps = [...source.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    const text = source.replace(/\[[^\]]+\]/g, "").trim();
    if (!text) continue;
    for (const stamp of stamps) result.push({ at: (Number(stamp[1]) * 60 + Number(stamp[2])) * 1_000, text });
  }
  return result.sort((left, right) => left.at - right.at);
}

export function parseLyrics(lyric, translation = "") {
  const sourceLines = timedLines(lyric);
  const translatedLines = timedLines(translation);
  const usedTranslations = new Set();
  return sourceLines.map((line) => {
    const exact = translatedLines.find((candidate) => candidate.at === line.at);
    if (exact) return { ...line, translation: exact.text };
    let closest = null;
    const previousAt = sourceLines.findLast((candidate) => candidate.at < line.at)?.at ?? Number.NEGATIVE_INFINITY;
    const nextAt = sourceLines.find((candidate) => candidate.at > line.at)?.at ?? Number.POSITIVE_INFINITY;
    const midpointBefore = Number.isFinite(previousAt) ? (previousAt + line.at) / 2 : Number.NEGATIVE_INFINITY;
    const midpointAfter = Number.isFinite(nextAt) ? (line.at + nextAt) / 2 : Number.POSITIVE_INFINITY;
    for (let index = 0; index < translatedLines.length; index++) {
      const candidate = translatedLines[index];
      if (usedTranslations.has(index) || candidate.at < midpointBefore || candidate.at >= midpointAfter) continue;
      const distance = Math.abs(candidate.at - line.at);
      if (distance <= 1_500 && (!closest || distance < closest.distance)) {
        closest = { index, distance, text: candidate.text };
      }
    }
    if (closest) usedTranslations.add(closest.index);
    return { ...line, translation: closest?.text || "" };
  });
}
