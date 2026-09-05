import { TtlDeduper } from "../runtime/ttl-deduper.mjs";
import { clusterAttentionSamples } from "./cluster.mjs";
import { matchNarrativeToMint } from "./matcher.mjs";
import { scoreNarrativeMatch } from "./scorer.mjs";

export class NarrativeIndex {
  #samples = [];
  #mints = [];
  #sampleKeys = new Set();
  #alerts;
  #clock;
  #maximumSamples;
  #maximumMints;
  #horizonMs;
  #competitionWindowMs;

  constructor({
    now = () => new Date(),
    maximumSamples = 10_000,
    maximumMints = 5_000,
    horizonMs = 60 * 60 * 1_000,
    competitionWindowMs = 15 * 60 * 1_000,
    alertDedupeTtlMs = 24 * 60 * 60 * 1_000,
  } = {}) {
    if (typeof now !== "function") throw new TypeError("now must be a function");
    this.#clock = now;
    this.#maximumSamples = maximumSamples;
    this.#maximumMints = maximumMints;
    this.#horizonMs = horizonMs;
    this.#competitionWindowMs = competitionWindowMs;
    this.#alerts = new TtlDeduper({
      ttlMs: alertDedupeTtlMs,
      maxEntries: maximumMints * 4,
      now: () => new Date(this.#clock()).valueOf(),
    });
  }

  #prune() {
    const nowMs = new Date(this.#clock()).valueOf();
    this.#samples = this.#samples.filter((sample) =>
      nowMs - new Date(sample.observedAt).valueOf() <= this.#horizonMs,
    ).slice(-this.#maximumSamples);
    this.#sampleKeys = new Set(
      this.#samples.map((sample) => `${sample.provider}:${sample.sourceItemId}`),
    );
    this.#mints = this.#mints.filter((candidate) =>
      nowMs - new Date(candidate.observedAt).valueOf() <= this.#horizonMs,
    ).slice(-this.#maximumMints);
  }

  ingestAttention(samples) {
    if (!Array.isArray(samples)) throw new TypeError("samples must be an array");
    let accepted = 0;
    for (const sample of samples) {
      const key = `${sample.provider}:${sample.sourceItemId}`;
      if (this.#sampleKeys.has(key)) continue;
      this.#sampleKeys.add(key);
      this.#samples.push(sample);
      accepted += 1;
    }
    this.#prune();
    return accepted;
  }

  ingestMint(candidate) {
    const existing = this.#mints.findIndex((item) => item.mint === candidate.mint);
    if (existing >= 0) this.#mints.splice(existing, 1);
    this.#mints.push(candidate);
    this.#prune();
  }

  narratives() {
    this.#prune();
    return clusterAttentionSamples(this.#samples, {
      now: this.#clock(),
      horizonMs: this.#horizonMs,
    });
  }

  matchesForMint(candidate) {
    this.ingestMint(candidate);
    const now = this.#clock();
    const nowMs = new Date(now).valueOf();
    const narratives = this.narratives();
    const matches = [];
    for (const narrative of narratives) {
      const match = matchNarrativeToMint(narrative, candidate);
      if (!match) continue;
      const competingMintCount = this.#mints.filter((other) => {
        const age = nowMs - new Date(other.observedAt).valueOf();
        return age <= this.#competitionWindowMs &&
          matchNarrativeToMint(narrative, other) !== null;
      }).length;
      const score = scoreNarrativeMatch({
        narrative,
        match,
        mintCandidate: candidate,
        competingMintCount,
        now,
      });
      matches.push(Object.freeze({
        narrative,
        mintCandidate: candidate,
        match,
        competingMintCount,
        score,
        runtimeAuthority: false,
      }));
    }
    return Object.freeze(matches.sort((a, b) =>
      b.score.priorityScore - a.score.priorityScore,
    ));
  }

  alertOnce(match) {
    const key = `${match.narrative.id}:${match.mintCandidate.mint}`;
    return this.#alerts.remember(key);
  }

  recentMints() {
    this.#prune();
    return Object.freeze([...this.#mints]);
  }

  get sampleCount() { return this.#samples.length; }
  get mintCount() { return this.#mints.length; }
}
