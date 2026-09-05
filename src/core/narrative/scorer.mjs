function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function freshnessPoints(latestObservedAt, nowMs) {
  const ageMs = nowMs - new Date(latestObservedAt).valueOf();
  if (!Number.isFinite(ageMs) || ageMs < 0) return 0;
  return clamp(15 * (1 - ageMs / (60 * 60 * 1_000)), 0, 15);
}

function packagingPoints(candidate) {
  let points = 0;
  if (candidate.name) points += 3;
  if (candidate.symbol) points += 3;
  if (candidate.imageUrl) points += 5;
  if (candidate.socialLinks.length > 0) points += 4;
  return points;
}

export function scoreNarrativeMatch({
  narrative,
  match,
  mintCandidate,
  competingMintCount = 1,
  now = new Date(),
} = {}) {
  const nowMs = new Date(now).valueOf();
  if (!Number.isFinite(nowMs)) throw new TypeError("now is invalid");
  if (!narrative || !match || !mintCandidate) {
    throw new TypeError("narrative, match, and mintCandidate are required");
  }
  if (!Number.isSafeInteger(competingMintCount) || competingMintCount < 1) {
    throw new TypeError("competingMintCount must be a positive integer");
  }

  const components = Object.freeze({
    match: clamp(match.confidence * 35, 0, 35),
    sourceDiversity: clamp((narrative.evidenceChannelCount / 3) * 20, 0, 20),
    freshness: freshnessPoints(narrative.latestObservedAt, nowMs),
    velocity: narrative.velocity === null
      ? 0
      : clamp((Math.max(0, narrative.velocity) / 3) * 15, 0, 15),
    packaging: packagingPoints(mintCandidate),
    overcrowdingPenalty: clamp((competingMintCount - 1) * 4, 0, 20),
  });
  const priorityScore = clamp(
    components.match +
      components.sourceDiversity +
      components.freshness +
      components.velocity +
      components.packaging -
      components.overcrowdingPenalty,
    0,
    100,
  );

  return Object.freeze({
    schemaVersion: 1,
    scoreVersion: "narrative-research-priority.v1",
    priorityScore: Number(priorityScore.toFixed(2)),
    components,
    missingEvidence: Object.freeze([
      ...(narrative.velocity === null ? ["velocity_baseline"] : []),
      ...(narrative.uniqueAuthorCount === null ? ["unique_authors"] : []),
      ...(mintCandidate.socialLinks.length === 0 ? ["mint_social_links"] : []),
    ]),
    interpretation: "uncalibrated_research_routing_not_success_probability",
    runtimeAuthority: false,
  });
}
