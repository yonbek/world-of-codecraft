// Envoys and Petitioners: the person's pull requests, from GitHub through `gh` (its own auth).
//   envoys       the person's own open PRs, in every repo
//   petitioners  open PRs that ask the person's review by name, or that they reviewed (not approved)
//                and that got new commits since; only those updated in the last RECENT_DAYS
//   old          the petitioners past that, listed apart and never counted or announced
// One copy polls (the header's) and publishes the result in shared "wocc.prs"; every copy reads it.
// What the person has seen is shared "wocc.prs.seen" (key → signature), kept by the header.

import { exec, notify, shared, setShared } from "herdr";
import { t } from "./i18n.js";

export const KEY = "wocc.prs";
export const SEEN = "wocc.prs.seen";
export const PANEL = "wocc.prs.panel"; // the register: { list, overlay } while open, { list, closedAt } after
export const POLL_MS = 120_000;
const RECENT_DAYS = 30;
const BATCH = 20; // PRs per details query: bigger ones time out on GitHub's side (HTTP 502)

const OPEN = "is:pr is:open archived:false";
const LIST = "number title url updatedAt author { login } repository { nameWithOwner }";
const SEARCH = `{
  viewer { login }
  mine: search(query: "${OPEN} author:@me", type: ISSUE, first: 50) { nodes { ... on PullRequest { id } } }
  asked: search(query: "${OPEN} user-review-requested:@me", type: ISSUE, first: 100) { nodes { ... on PullRequest { id ${LIST} } } }
  reviewed: search(query: "${OPEN} reviewed-by:@me -author:@me", type: ISSUE, first: 50) { nodes { ... on PullRequest { id updatedAt } } }
}`;
const DETAILS = `${LIST} isDraft reviewDecision additions deletions
  commits(last: 1) { nodes { commit { committedDate statusCheckRollup { state } } } }
  reviewThreads(first: 50) { nodes { isResolved } }
  latestReviews(first: 20) { nodes { author { login } state submittedAt } }`;

/** Envoy states, most urgent first. */
export const ENVOY_ORDER = ["fail", "changes", "comments", "waiting", "draft", "ready"];
export const NEEDS_YOU = new Set(["fail", "changes", "comments"]);

async function gql(query) {
  const r = await exec("gh", ["api", "graphql", "-f", `query=${query}`], { timeout: 60_000 });
  if (r.code !== 0) throw new Error((r.stderr || r.stdout || `gh exited ${r.code}`).trim().split("\n")[0]);
  const j = JSON.parse(r.stdout);
  if (j.errors?.length) throw new Error(j.errors[0].message);
  return j.data;
}

async function details(ids) {
  const batches = [];
  for (let i = 0; i < ids.length; i += BATCH) batches.push(ids.slice(i, i + BATCH));
  const parts = await Promise.all(batches.map((b) =>
    gql(`{ nodes(ids: ${JSON.stringify(b)}) { ... on PullRequest { id ${DETAILS} } } }`)));
  return new Map(parts.flatMap((d) => d.nodes).filter(Boolean).map((n) => [n.id, n]));
}

function base(n) {
  const repo = n.repository.nameWithOwner;
  return {
    key: `${repo}#${n.number}`, repo, short: repo.split("/")[1], number: n.number, title: n.title,
    url: n.url, author: n.author?.login ?? "ghost", updatedAt: Date.parse(n.updatedAt),
  };
}

function envoy(n) {
  const c = n.commits.nodes[0]?.commit;
  const ci = c?.statusCheckRollup?.state ?? null;
  const open = n.reviewThreads.nodes.filter((x) => !x.isResolved).length;
  const decision = n.reviewDecision;
  const state = ci === "FAILURE" || ci === "ERROR" ? "fail"
    : decision === "CHANGES_REQUESTED" ? "changes"
    : open > 0 ? "comments"
    : n.isDraft ? "draft"
    : decision === "APPROVED" && ci !== "PENDING" ? "ready"
    : "waiting";
  return { ...base(n), draft: n.isDraft, ci, decision, open, adds: n.additions, dels: n.deletions, state,
    sig: `${state}|${ci}|${decision}|${open}|${c?.committedDate}` };
}

function petitioner(n, state) {
  const c = n.commits.nodes[0]?.commit;
  return { ...base(n), adds: n.additions, dels: n.deletions, state, sig: `${state}|${c?.committedDate}` };
}

/** The new commits of a PR the person reviewed without approving, since that review. */
function returns(n, me) {
  const mine = n.latestReviews.nodes.filter((r) => r.author?.login === me);
  const last = mine.sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt))[0];
  if (!last || last.state === "APPROVED") return false;
  const commit = n.commits.nodes[0]?.commit?.committedDate;
  return Boolean(commit) && Date.parse(commit) > Date.parse(last.submittedAt);
}

async function load() {
  const s = await gql(SEARCH);
  const me = s.viewer.login;
  const cutoff = Date.now() - RECENT_DAYS * 86_400_000;
  const askedIds = new Set(s.asked.nodes.map((n) => n.id));
  const recentAsked = s.asked.nodes.filter((n) => Date.parse(n.updatedAt) >= cutoff);
  const old = s.asked.nodes.filter((n) => Date.parse(n.updatedAt) < cutoff).map(base)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const reviewed = s.reviewed.nodes.filter((n) => !askedIds.has(n.id) && Date.parse(n.updatedAt) >= cutoff);

  const d = await details([...s.mine.nodes, ...recentAsked, ...reviewed].map((n) => n.id));
  const envoys = s.mine.nodes.map((n) => d.get(n.id)).filter(Boolean).map(envoy)
    .sort((a, b) => ENVOY_ORDER.indexOf(a.state) - ENVOY_ORDER.indexOf(b.state) || b.updatedAt - a.updatedAt);
  const petitioners = [
    ...reviewed.map((n) => d.get(n.id)).filter((n) => n && returns(n, me)).map((n) => petitioner(n, "returns")),
    ...recentAsked.map((n) => d.get(n.id)).filter(Boolean).map((n) => petitioner(n, "asked")),
  ].sort((a, b) => (a.state === "returns" ? 0 : 1) - (b.state === "returns" ? 0 : 1) || a.updatedAt - b.updatedAt);
  return { me, envoys, petitioners, old };
}

/** What changed between two polls, as toasts (a summary past three). */
function announce(prev, next) {
  if (!prev) return;
  const was = new Map([...prev.envoys, ...prev.petitioners].map((p) => [p.key, p]));
  const petitionerNews = [];
  const envoyNews = [];
  for (const p of next.envoys) {
    const o = was.get(p.key);
    if (!o) continue;
    const label = `${p.short}#${p.number} ${p.title}`;
    if (p.state === "fail" && o.state !== "fail") envoyNews.push({ level: "error", title: t("prToastFail"), body: label });
    else if (o.state === "fail" && p.ci === "SUCCESS") envoyNews.push({ level: "success", title: t("prToastFixed"), body: label });
    if (p.decision !== o.decision && p.decision === "CHANGES_REQUESTED") envoyNews.push({ level: "warning", title: t("prToastChanges"), body: label });
    if (p.decision !== o.decision && p.decision === "APPROVED") envoyNews.push({ level: "success", title: t("prToastApproved"), body: label });
    if (p.open > o.open) envoyNews.push({ level: "warning", title: t("prToastComments", p.open - o.open), body: label });
  }
  for (const p of next.petitioners) {
    const o = was.get(p.key);
    if (o && o.state === p.state) continue;
    petitionerNews.push({ level: "info", title: t(p.state === "returns" ? "prToastReturns" : "prToastAsked", p.author), body: `${p.short}#${p.number} ${p.title}` });
  }
  const all = [
    ...envoyNews.map((n) => ({ ...n, action: { name: "world-of-codecraft.envoys" } })),
    ...petitionerNews.map((n) => ({ ...n, action: { name: "world-of-codecraft.petitioners" } })),
  ];
  if (all.length > 3) notify({ level: "info", title: t("prToastMany", all.length), action: all[0].action });
  else for (const n of all) notify(n);
}

/** A PR's signature, by key: what "seen" compares against. */
export const signatures = (d) => Object.fromEntries([...d.envoys, ...d.petitioners].map((p) => [p.key, p.sig]));

/** Keys of the PRs in a list ("envoys" | "petitioners") that changed since the person last opened it. */
export function unseen(d, list) {
  const seen = shared(SEEN);
  if (!d?.[list] || !seen) return new Set();
  return new Set(d[list].filter((p) => seen[p.key] !== p.sig).map((p) => p.key));
}

/** Marks every PR of a list as seen. */
export function markSeen(list) {
  const d = shared(KEY);
  if (!d?.[list]) return;
  setShared(SEEN, { ...(shared(SEEN) ?? {}), ...Object.fromEntries(d[list].map((p) => [p.key, p.sig])) });
}

let running = false;

/** Polls GitHub once and publishes the result; on failure keeps the last data with its error. */
export async function refresh() {
  if (running) return;
  running = true;
  const prev = shared(KEY);
  try {
    const next = { ...(await load()), at: Date.now(), error: null };
    announce(prev?.envoys ? prev : null, next);
    setShared(KEY, next);
    if (!shared(SEEN)) setShared(SEEN, signatures(next)); // first run ever: nothing is "new"
  } catch (e) {
    setShared(KEY, { ...(prev ?? { envoys: [], petitioners: [], old: [] }), error: String(e?.message ?? e), failedAt: Date.now() });
  } finally {
    running = false;
  }
}

/** "#1183" → the repo and number shown on a line. */
export const label = (p) => `${p.short}#${p.number}`;
