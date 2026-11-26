// The register (a popup from a header plaque), one list per plaque (props.list): "envoys" (the
// person's own PRs) or "petitioners" (PRs waiting for their review). Drawn like the board: a carved
// oak frame, a leather heading band, and one enamel card per repo (ruby-trimmed when one of its PRs
// needs you), each with its state counters and one line per PR, most urgent first. A gold dot marks
// what changed since the person last looked. Click a line: it opens up in place (full title, the
// facts, an Open button for GitHub); click again to fold it. Older
// petitioners (no activity in 30 days) fold away at the bottom. Opening it marks its list as seen.

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { exec, shared, setShared, props, closeOverlay } from "herdr";
import { KEY, PANEL, ENVOY_ORDER, NEEDS_YOU, unseen, markSeen, refresh, ago } from "./prs.js";
import { gradient } from "./kit.js";
import { t } from "./i18n.js";
import { P, txt, title, well, gem, bar, button, frame, frameT } from "./ui.js";

export const W = 640, H = 600; // the popup's size (a popup's content needs a definite height)

// Each PR state as one of the board's gems (blocked blinks red, done glows gold); draft has none.
export const GEM = { fail: "blocked", changes: "blocked", comments: "done", returns: "done", waiting: "idle", asked: "idle", ready: "working", draft: null, notready: null };
export const TONE = { fail: P.blocked, changes: P.blocked, comments: P.done, returns: P.done, waiting: P.idle, asked: P.idle, ready: P.working, draft: P.dim, notready: P.dim };
const RANK = [...ENVOY_ORDER, "returns", "asked", "notready"];
/** The state a line shows: a petitioner not ready for review is "not ready" whatever brought it. */
export const shown = (p) => (p.ready === false ? "notready" : p.state);

/** PRs grouped by repo, repos ordered by their most urgent PR, then name. */
function byRepo(prs) {
  const groups = new Map();
  for (const p of prs) groups.set(p.repo, [...(groups.get(p.repo) ?? []), p]);
  const rank = (ps) => Math.min(...ps.map((p) => RANK.indexOf(shown(p))));
  return [...groups].sort(([a, pa], [b, pb]) => rank(pa) - rank(pb) || a.localeCompare(b));
}

const dot = () => div().size(5).rounded(1).bg(P.faint);

export default class Registre {
  init() {
    this.list = props()?.list === "petitioners" ? "petitioners" : "envoys";
    this.fresh = unseen(shared(KEY), this.list); // what to mark as new while this stays open
    this.showOld = false;
    this.expanded = null; // the key of the line opened up
    markSeen(this.list);
    setShared(PANEL, { list: this.list, overlay: props()?.overlay });
  }

  async close() {
    setShared(PANEL, { list: this.list, closedAt: Date.now() });
  }

  open(url) {
    exec("open", [url]);
    const o = props()?.overlay;
    if (o) closeOverlay(o);
  }

  heading(text, extra) {
    return div().relative().flex_none().h(30)
      .children(bar("bandeau"))
      .child(h_flex().absolute().left(24).right(24).top(0).bottom(0).gap(8).items_center()
        .child(title(text, 17, P.goldHi).flex_1())
        .child(extra));
  }

  /** One state counter, as on the board: a gem, the number, the word, on a flat enamel well. */
  chip(st, n) {
    const red = GEM[st] === "blocked";
    return well(h_flex().flex_none().h(22).pl(3).pr(7).gap(3).items_center().rounded(2),
      { bg: red ? "#4a1418" : P.night, lit: red ? "#a0303a" : "#3e3040" })
      .child(GEM[st] ? gem(GEM[st], true) : div().w(15).flex().justify_center().child(dot()))
      .child(txt(`${n} ${t("prState")[st]}`, 14, red ? "#ffd8cc" : P.parch, 700));
  }

  line(p, dim) {
    const st = shown(p); // none for an older petitioner
    const meta = [];
    if (st === "notready") meta.push(`${t("prState").notready}: ${t("prNotReady")[p.notReady]}`);
    else if (st && st !== "comments") meta.push(t("prState")[st]);
    if (p.open) meta.push(t("prOpen", p.open));
    if (this.list === "petitioners") meta.push(`@${p.author}`);
    if (p.adds != null) meta.push(`+${p.adds} −${p.dels}`);
    meta.push(ago(p.updatedAt));
    const open = this.expanded === p.key;
    const row = h_flex().id(`pr-${p.key}`).relative().h(40).pl(5).pr(8).gap(6).items_center().rounded(2).cursor_pointer()
      .bg(GEM[st] === "blocked" ? "#3a1216" : open ? "#ffffff0c" : "#00000000").hover((s) => s.bg("#ffffff10"))
      .on_click((_e, cx) => { this.expanded = open ? null : p.key; cx.notify(); })
      .child(div().w(16).flex_none().flex().justify_center().child(GEM[st] ? gem(GEM[st], true) : dot()))
      .child(v_flex().flex_1().min_w(0).gap(0)
        .child(h_flex().min_w(0).gap(6)
          .child(txt(`#${p.number}`, 15, dim ? P.faint : P.muted, 800).flex_none())
          .child(txt(p.title, 15, dim ? P.dim : P.cream, 700).min_w(0).truncate()))
        .child(txt(meta.join(" · "), 13, dim || !st ? P.dim : TONE[st], 700).truncate()))
      .when(this.fresh.has(p.key), (e) => e.child(div().flex_none().size(8).rounded(4).bg(P.gold)))
      .child(txt(open ? "▾" : "▸", 13, P.dim, 800).flex_none());
    if (!open) return row;
    const facts = [`${p.repo}#${p.number}`];
    if ("ci" in p) facts.push(t("prFactCi", p.ci));
    else if (p.author) facts.push(`@${p.author}`);
    if (p.mine) facts.push(t("prFactMine", p.mine));
    return v_flex().rounded(2).bg("#ffffff0c")
      .child(row)
      .child(v_flex().pl(27).pr(8).pb(8).gap(4)
        .child(txt(p.title, 15, P.cream, 700))
        .child(txt(facts.join(" · "), 13, P.muted, 700))
        .child(h_flex().gap(6).pt(2)
          .child(button(`ouvrir-${p.key}`, txt(t("prOpenBtn"), 14, P.cream, 800), () => this.open(p.url), { h: 26, tip: t("prOpenTip") }))));
  }

  /** One repo, as one of the board's district cards. */
  repo(name, prs, dim = false) {
    const [owner, short] = name.split("/");
    const counts = RANK.map((st) => [st, prs.filter((p) => shown(p) === st).length]).filter(([, n]) => n > 0);
    const head = h_flex().h(34).pl(6).pr(4).gap(8).items_center()
      .child(v_flex().flex_1().min_w(0).gap(0)
        .child(txt(short, 17, dim ? P.muted : P.cream, 800).truncate())
        .child(txt(owner, 13, P.dim, 700).truncate()))
      .child(txt(String(prs.length), 17, dim ? P.muted : P.goldHi, 800).flex_none().mr(4));
    let inner = v_flex().relative().gap(2).p(6).child(head);
    if (counts.length) inner = inner.child(h_flex().flex_wrap().gap(4).px(2).pb(3).children(counts.map(([st, n]) => this.chip(st, n))));
    inner = inner.child(v_flex().gap(1).children(prs.map((p) => this.line(p, dim))));
    return div().id(`depot-${name}`).relative().flex_none().mx(2).mt(6)
      .bg(dim ? P.night : P.enamel)
      .child(inner)
      .children(frame(prs.some((p) => NEEDS_YOU.has(p.state)) ? "fin-rubis" : "fin"));
  }

  render() {
    const d = shared(KEY);
    const mine = this.list === "envoys";
    const items = d?.[this.list] ?? [];
    const old = mine ? [] : d?.old ?? [];
    const need = mine ? items.filter((p) => NEEDS_YOU.has(p.state)).length : 0;
    const status = d?.error ? t("prError", d.error) : d?.at ? t("prUpdated", ago(d.at)) : t("prLoading");
    const T = frameT("cadre");
    const toggle = old.length > 0 && h_flex().id("anciens").mx(2).mt(10).h(28).px(8).items_center().rounded(2).cursor_pointer()
      .hover((s) => s.bg("#ffffff10"))
      .on_click((_e, cx) => { this.showOld = !this.showOld; cx.notify(); })
      .child(txt(`${this.showOld ? "▾" : "▸"} ${t("prOld", old.length)}`, 14, P.muted, 800));

    return div().id("registre").w(W).h(H).relative().bg(P.leather)
      .child(gradient("#2b1e16", "#100b0a", 165))
      .child(v_flex().absolute().left(T).right(T).top(T).bottom(T)
        .child(this.heading(t(mine ? "envoysTitle" : "petitionersTitle"),
          need ? txt(t("prNeedYou", need), 14, P.blocked, 800) : txt(String(items.length), 14, P.muted, 700)))
        .child(v_flex().id("depots").flex_1().min_h(0).overflow_y_scrollbar().px(2).pb(10)
          .children(items.length ? byRepo(items).map(([name, prs]) => this.repo(name, prs))
            : [txt(t(mine ? "prNoEnvoys" : "prNoPetitioners"), 15, P.dim, 700).px(12).py(16)])
          .when(Boolean(toggle), (e) => e.child(toggle))
          .when(this.showOld, (e) => e.children(byRepo(old).map(([name, prs]) => this.repo(name, prs, true)))))
        .child(h_flex().flex_none().h(36).px(6).gap(8).items_center()
          .child(txt(status, 13, d?.error ? P.blocked : P.dim, 700).flex_1().min_w(0).truncate())
          .child(button("rafraichir", txt(t("prRefresh"), 14, P.cream, 800),
            (_e, cx) => cx.spawn(async (cx) => { await refresh(); cx.notify(); }), { h: 26 }))))
      .children(frame("cadre"));
  }
}
