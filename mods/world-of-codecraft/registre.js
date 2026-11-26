// The register (a popup from a header plaque), one list per plaque (props.list): "envoys" (the
// person's own PRs) or "petitioners" (PRs waiting for their review), most urgent first, with what
// changed since they last looked marked by a gold dot. Click a line: open the PR in the browser.
// Older petitioners (no activity in 30 days) fold away at the bottom. Opening it marks its list as seen.

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { exec, shared, setShared, props, closeOverlay } from "herdr";
import { KEY, PANEL, NEEDS_YOU, unseen, markSeen, refresh, label } from "./prs.js";
import { t } from "./i18n.js";
import { P, txt, title, well } from "./ui.js";

export const W = 620, H = 560; // the popup's size (a popup's content needs a definite height)
const TONE = { fail: P.blocked, changes: P.blocked, comments: P.done, waiting: P.idle, draft: P.dim, ready: P.working, returns: P.done, asked: P.cream };

function ago(ms) {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (m < 60) return t("prMin", m);
  const h = Math.round(m / 60);
  return h < 48 ? t("prHours", h) : t("prDays", Math.round(h / 24));
}

export default class Registre {
  init() {
    this.list = props()?.list === "petitioners" ? "petitioners" : "envoys";
    this.fresh = unseen(shared(KEY), this.list); // what to mark as new while this stays open
    this.showOld = false;
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

  heading(text, count, extra) {
    return h_flex().flex_none().h(30).px(14).gap(8).items_center().bg(P.leather)
      .child(title(text, 17, P.goldHi))
      .child(txt(count, 15, P.muted, 800))
      .child(div().flex_1())
      .when(Boolean(extra), (e) => e.child(extra));
  }

  line(p, { dim = false } = {}) {
    const tone = TONE[p.state] ?? P.cream;
    const what = p.state ? t("prState")[p.state] : "";
    const bits = [];
    if (p.open) bits.push(t("prOpen", p.open));
    if (p.adds != null) bits.push(`+${p.adds} −${p.dels}`);
    if (!("ci" in p)) bits.push(`@${p.author}`); // a petitioner: whose PR it is
    bits.push(ago(p.updatedAt));
    return h_flex().id(`pr-${p.key}`).flex_none().h(44).px(14).gap(10).items_center().cursor_pointer()
      .hover((s) => s.bg(P.enamelHi))
      .tooltip(`${p.repo}#${p.number}\n${p.title}`)
      .on_click(() => this.open(p.url))
      .child(div().w(8).h(8).rounded(4).flex_none().when(this.fresh.has(p.key), (e) => e.bg(P.gold)))
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(h_flex().min_w(0).gap(8)
          .child(txt(label(p), 14, dim ? P.faint : P.muted, 800).flex_none())
          .child(txt(p.title, 15, dim ? P.dim : P.cream, 700).min_w(0).truncate()))
        .child(txt(bits.join(" · "), 13, dim ? P.faint : P.dim, 700).truncate()))
      .when(Boolean(what), (e) => e.child(txt(what, 14, tone, 800).flex_none()));
  }

  render() {
    const d = shared(KEY);
    const mine = this.list === "envoys";
    const items = d?.[this.list] ?? [];
    const old = mine ? [] : d?.old ?? [];
    const need = mine ? items.filter((p) => NEEDS_YOU.has(p.state)).length : 0;
    const status = d?.error ? t("prError", d.error) : d?.at ? t("prUpdated", ago(d.at)) : t("prLoading");

    const empty = (s) => div().px(36).py(10).child(txt(s, 14, P.dim, 700));
    const toggle = old.length > 0 && h_flex().id("anciens").px(14).h(30).items_center().cursor_pointer()
      .hover((s) => s.bg(P.enamelHi))
      .on_click((_e, cx) => { this.showOld = !this.showOld; cx.notify(); })
      .child(txt(`${this.showOld ? "▾" : "▸"} ${t("prOld", old.length)}`, 14, P.dim, 800));

    return well(v_flex().w(W).h(H).overflow_hidden(), { bg: P.night })
      .child(v_flex().id("registre").flex_1().min_h(0).overflow_y_scrollbar()
        .child(this.heading(t(this.list), items.length, need ? txt(t("prNeedYou", need), 14, P.blocked, 800) : null))
        .children(items.length ? items.map((p) => this.line(p)) : [empty(t(mine ? "prNoEnvoys" : "prNoPetitioners"))])
        .when(Boolean(toggle), (e) => e.child(toggle))
        .when(this.showOld, (e) => e.children(old.map((p) => this.line(p, { dim: true })))))
      .child(h_flex().flex_none().h(28).px(14).gap(8).items_center().bg(P.leather)
        .child(txt(status, 13, d?.error ? P.blocked : P.dim, 700).flex_1().min_w(0).truncate())
        .child(h_flex().id("rafraichir").cursor_pointer().hover((s) => s.opacity(0.7))
          .on_click((_e, cx) => cx.spawn(async (cx) => { await refresh(); cx.notify(); }))
          .child(txt(t("prRefresh"), 13, P.gold, 800))));
  }
}
