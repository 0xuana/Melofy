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
    let closest = null;
    for (let index = 0; index < translatedLines.length; index++) {
      const candidate = translatedLines[index];
      if (usedTranslations.has(index)) continue;
      const distance = Math.abs(candidate.at - line.at);
      if (distance === 0) {
        closest = { index, distance, text: candidate.text };
        break;
      }
      if (distance <= 1_500 && (!closest || distance < closest.distance)) {
        closest = { index, distance, text: candidate.text };
      }
    }
    if (closest) usedTranslations.add(closest.index);
    return { ...line, translation: closest?.text || "" };
  });
}
