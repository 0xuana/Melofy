export function isUnplayableTrack(track, reason) {
  return track?.playable === false || ["rights", "subscription", "region", "unavailable"].includes(reason);
}

export function unplayableLabel(reason) {
  return ({
    rights: "无版权",
    subscription: "需会员",
    region: "地区限制",
    unavailable: "暂不可播",
  })[reason] || "暂不可播";
}

export async function handlePlaybackFailure(track, reason, { markUnplayable, skip }) {
  if (!isUnplayableTrack(track, reason?.reason)) return false;
  markUnplayable(track.id, reason?.reason || "unavailable");
  await skip();
  return true;
}

export async function loadTrackStream(track, { resolve, setSource, markUnplayable, skip }) {
  try {
    const stream = await resolve(track.id);
    setSource(stream.url);
    return true;
  } catch (reason) {
    const handled = await handlePlaybackFailure(track, reason, { markUnplayable, skip });
    if (!handled) throw reason;
    return false;
  }
}
