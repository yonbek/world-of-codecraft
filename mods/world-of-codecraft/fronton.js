// The pediment (top bar, window drag): a carved oak beam with iron straps and a gold bead.
// Left, the crest and title in a gold cartouche. Then ornate plaques, strategy-game
// style: Gold = Claude account A, Wood = account B (left this week, the 5-hour window under
// it), Heroes = agents at work / in the village, Fair = the next weekly reset.
// Gold, Wood and Fair are an optional cduo integration: they only appear when the quota
// files exist (see readQuotas in kit.js); without them the header shows Heroes only. In the middle,
// the district's banner and a parchment scroll with the district and quest. On the right,
// the waiting-heroes button (click: go to the next one), then the hour plaque.

import { div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, agents, run, props, layout, nextCommand, shared, setShared, openOverlay, closeOverlay, window as appWindow } from "herdr";
import { VILLAGE, district, clip, heroOf, heroTitle, hourName, hhmm, isNight, readQuotas, left } from "./kit.js";
import { P, DECO, TEXTE, bar, pic, txt, button, mark, banner } from "./ui.js";
import { DEMO_SPACES } from "./demo.js";
import { KEY as PRS, SEEN, PANEL, POLL_MS, NEEDS_YOU, refresh, unseen } from "./prs.js";
import { W as REG_W, H as REG_H } from "./registre.js";
import { t, detectLang } from "./i18n.js";

// Immersive mode lives in the one layout: the big village (place-immersion) and the command panel
// (commande) are shown, the bottom village (place) hidden, and the terminal (arene) shrinks to 400 px.
// These are layout clicks, so the mode survives restarts.
const node = (n, id) => (!n || typeof n !== "object" ? null : n.id === id ? n : (n.children ?? []).map((c) => node(c, id)).find(Boolean) ?? null);
export function immersive() {
  try { const n = node(layout(), "place-immersion"); return Boolean(n && !n.hidden); } catch { return false; }
}
function setMode(on) {
  run(on ? "layout.show" : "layout.hide", { id: "place-immersion" });
  run(on ? "layout.show" : "layout.hide", { id: "commande" });
  run(on ? "layout.hide" : "layout.show", { id: "place" });
  run("layout.resize", on ? { id: "arene", px: 400 } : { id: "arene", weight: 1 });
}
// Within immersive mode, fold the big village and the command panel away and let the terminal fill
// their place. "wocc.fold" remembers it, since a folded window looks like workshop mode with its strip hidden.
function toggleVillage() {
  let l; try { l = layout(); } catch { return; }
  const shown = (id) => { const n = node(l, id); return Boolean(n && !n.hidden); };
  if (shown("place-immersion")) {
    run("layout.hide", { id: "place-immersion" });
    run("layout.hide", { id: "commande" });
    run("layout.resize", { id: "arene", weight: 1 });
    setShared("wocc.fold", true);
  } else if (shared("wocc.fold")) {
    setShared("wocc.fold", false);
    if (!shown("place")) setMode(true);
  }
}

const PW = 136; // plaque width
const SEEN_STORE = "wocc.prs.seen"; // localStorage: what the person saw, across restarts

/** Opens the register of one list ("envoys" | "petitioners") as a popup at `at` (window px), else
 *  centered; closes it instead when it is open. A press beside a popup closes it before the click
 *  lands, so a register of this list closed a moment ago counts as open: the click toggles it shut. */
function toggleRegistre(list, at) {
  const st = shared(PANEL);
  if (st?.list === list && st.overlay) { closeOverlay(st.overlay); return; }
  if (st?.list === list && Date.now() - (st.closedAt ?? 0) < 500) return;
  openOverlay({ mod: "world-of-codecraft", props: { role: "registre", list }, kind: "popup", frame: "none", width: REG_W, height: REG_H, ...(at ? { at } : {}) });
}

export default class Fronton {
  init(_p, cx) {
    detectLang(cx); // the system language, shared with every copy of the mod
    this.now = new Date();
    this.q = [];
    const tick = (cx) => {
      this.now = new Date();
      cx.spawn(async (cx) => { this.q = await readQuotas(); cx.notify(); });
    };
    tick(cx);
    cx.timer.every(60_000, tick);
    // envoys and petitioners: this copy polls GitHub for every copy (paused while the window is hidden)
    if (!shared(SEEN)) { try { const s = JSON.parse(localStorage.getItem(SEEN_STORE) ?? "null"); if (s) setShared(SEEN, s); } catch {} }
    this.savedSeen = shared(SEEN);
    this.anchor = {}; // list → its plaque's bounds, from the last press on it
    cx.spawn(async () => { await refresh(); });
    cx.timer.every(POLL_MS, (cx) => { if (appWindow()?.visible !== false) cx.spawn(async () => { await refresh(); }); });
    // ctrl-shift-i (KEYS.json): "world-of-codecraft.mode"
    // ctrl-shift-k (keys.json): "world-of-codecraft.village"
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "mode") { setShared("wocc.fold", false); setMode(!immersive()); }
        else if (c === "village") toggleVillage();
        else if (c === "envoys" || c === "petitioners") toggleRegistre(c, this.under(c));
        else continue;
        cx.notify();
      }
    });
  }

  /** An ornate plaque: icon in its gold socket, the value, a caption. */
  plaque(id, icon, main, sub, tip, warn) {
    return div().id(id).relative().flex_none().w(PW).h(40).tooltip(tip)
      .child(pic("plaque", PW, 40).absolute().left(0).top(0))
      .child(div().absolute().left(4).top(4).w(32).h(32).flex().items_center().justify_center().child(icon))
      .child(v_flex().absolute().left(42).top(4).bottom(4).right(8).justify_center().gap(0)
        .child(txt(main, 18, warn ? P.blocked : P.cream, 800).line_height(1.05))
        .when(Boolean(sub), (el) => el.child(txt(sub, 13, P.muted, 700).line_height(1.05).truncate())));
  }

  quota(acc, label, icon) {
    const q = this.q.find((x) => x.acc === acc) ?? { missing: true };
    if (q.missing || !q.week) return null; // no quota file: no plaque at all
    const rem = Math.max(0, 100 - q.week.used);
    const five = q.five ? t("five", 100 - q.five.used) : t("account", acc);
    const tip = t("quotaTip", label, acc, rem, left(q.week.resets) || "?", q.five ? 100 - q.five.used : null, q.five?.resets ? left(q.five.resets) : "", q.stale);
    return this.plaque(`res-${acc}`, icon, `${t("pct", rem)}${q.stale ? " ?" : ""}`, five, tip, rem <= 20);
  }

  /** Where a list's register opens: its left edge under its plaque (null before the plaque was pressed). */
  under(list) {
    const b = this.anchor[list];
    return b ? { x: Math.round(b.x), y: Math.round(b.y + b.height + 4) } : null;
  }

  /** A plaque that opens the register, with a gold dot while something in it is new. */
  courrier(list, icon, main, sub, tip, warn, fresh) {
    return this.plaque(`res-${list}`, icon, main, sub, tip, warn).cursor_pointer()
      .on_mouse_down("left", (e) => { if (e.bounds) this.anchor[list] = e.bounds; })
      .on_click(() => toggleRegistre(list, this.under(list)))
      .when(fresh > 0, (el) => el.child(div().absolute().right(6).top(5).w(8).h(8).rounded(4).bg(P.gold)
        .loop("opacity", { from: 0.45, to: 1, period: 1400 })));
  }

  envoys(d, fresh) {
    const e = d.envoys;
    const n = (st) => e.filter((p) => p.state === st).length;
    const icon = image("mods/world-of-codecraft/art/creatures/marchand/debout.png").w(23).h(32);
    const main = d.error && !d.at ? "?" : String(e.length);
    return this.courrier("envoys", icon, main, t("envoysSub", n("fail"), n("changes"), n("comments"), n("ready")),
      `${t("envoysTip", e.length, n("fail"), n("changes"), n("comments"), n("waiting"), n("draft"), n("ready"))}${d.error ? `\n${t("prError", d.error)}` : ""}`,
      e.some((p) => NEEDS_YOU.has(p.state)), fresh);
  }

  petitioners(d, fresh) {
    const ps = d.petitioners.filter((p) => p.ready); // the ones waiting on the person
    const back = ps.filter((p) => p.state === "returns").length;
    const waiting = d.petitioners.length - ps.length;
    const icon = image("mods/world-of-codecraft/art/creatures/fermier/debout.png").w(29).h(31);
    const main = d.error && !d.at ? "?" : String(ps.length);
    return this.courrier("petitioners", icon, main, t("petitionersSub", back, waiting),
      `${t("petitionersTip", ps.length, back, waiting, d.old.length)}${d.error ? `\n${t("prError", d.error)}` : ""}`,
      false, fresh);
  }

  /** The immersive-mode switch: swaps the village (big) and the terminal (below), in the same layout. */
  mode() {
    const on = immersive();
    return button("mode", txt(on ? t("workshop") : t("immersion"), 16, P.cream, 800),
      () => setMode(!on),
      { h: 28, tip: on ? t("workshopTip") : t("immersionTip") });
  }

  render(_cx) {
    const sp = (props()?.demo ? DEMO_SPACES : spaces()).find((s) => s.active);
    const tab = sp?.tabs.find((t) => t.active);
    const d = sp ? district(sp) : null;
    const all = agents();
    const blocked = all.filter((a) => a.status === "blocked");
    const done = all.filter((a) => a.status === "done");
    const busy = all.filter((a) => a.status === "working").length;
    const win = appWindow();
    const mac = (win?.platform ?? "macos") === "macos" && !win?.fullscreen;
    const night = isNight(this.now);
    const resets = this.q.map((q) => q.week?.resets).filter(Boolean);
    const fair = resets.length ? left(Math.min(...resets)) : "";
    const gold = this.quota("A", t("gold"), pic("ic-or", 32, 24));
    const wood = this.quota("B", t("wood"), pic("ic-bois", 36, 28));
    const prs = shared(PRS);
    const seen = shared(SEEN);
    if (seen && seen !== this.savedSeen) { this.savedSeen = seen; try { localStorage.setItem(SEEN_STORE, JSON.stringify(seen)); } catch {} }


    const waiting = blocked.length ? blocked : done;
    let alert = null;
    if (waiting.length) {
      const isB = blocked.length > 0;
      const h = heroOf(waiting[0].address, waiting[0].program);
      alert = button("alerte", [
        mark(isB ? "blocked" : "done"),
        txt(waiting.length > 1 ? t("waitingMany", waiting.length, isB) : t("waitingOne", h.name, isB), 16, isB ? P.goldHi : P.cream, 800),
      ], () => run("agent.focus", { terminal: waiting[0].address }), {
        face: isB ? "or" : "", h: 28,
        tip: t("waitingTip", heroTitle(h), isB),
      });
    }

    // the district's banner and the parchment scroll (flat vellum behind the text)
    const scroll = d && h_flex().id("rouleau").tooltip(`${d.titre}${tab ? `\n${t("questTab", tab.name)}` : ""}`).flex_shrink(1).min_w(0).max_w(620).h(44).gap(4).items_center()
      .child(div().flex_none().h(40).mt(2).child(banner(d)))
      .child(div().relative().flex_shrink(1).min_w(0).h(34).pl(16).pr(16).flex().items_center().overflow_hidden()
        .children(bar("rouleau"))
        .child(h_flex().relative().min_w(0).gap(8).items_center()
          .child(txt(tab ? d.num : `${d.num} · ${d.nom}`, 16, P.ink2, 800).flex_none())
          .when(Boolean(tab), (e) => e
            .child(txt("›", 16, P.inkSoft, 800).flex_none())
            .child(txt(clip(tab.name, 44), 16, P.wax, 800).min_w(0).truncate()))));

    const hour = div().id("heure").relative().flex_none().w(170).h(40)
      .tooltip(t("hourTip", hourName(this.now), night))
      .child(pic("plaque-l", 170, 40).absolute().left(0).top(0))
      .child(div().absolute().left(10).top(10).child(pic(night ? "ic-lune" : "ic-soleil", 20, 20)))
      .child(h_flex().absolute().left(42).right(10).top(0).bottom(0).items_center().justify_between()
        .child(txt(hourName(this.now), 16, P.parch, 700))
        .child(txt(hhmm(this.now), 20, P.goldHi, 800)));

    return div().id("fronton").size_full().relative().overflow_hidden().bg(P.well)
      .children(bar("poutre"))
      .child(h_flex().absolute().left(mac ? 84 : 10).right(10).top(0).h(44).gap(8).items_center()
        // crest and title in their cartouche
        .child(div().relative().flex_none().w(284).h(42)
          .child(pic("cartouche", 284, 42).absolute().left(0).top(0))
          .child(div().absolute().left(10).top(3).child(pic("blason", 30, 36)))
          .child(v_flex().absolute().left(46).top(0).bottom(0).justify_center()
            .child(div().font_family(DECO).font_weight(700).text_size(17).line_height(1.1).text_color(P.goldHi).child("World of Codecraft"))
            .child(txt(t("villageOf", VILLAGE), 13, P.muted, 700).line_height(1.1))))
        .when(Boolean(gold), (el) => el.child(gold))
        .when(Boolean(wood), (el) => el.child(wood))
        .child(this.plaque("res-heros", pic("ic-heros", 26, 22), `${busy} / ${all.length}`, t("heroesAtWork"), t("heroesTip", busy, all.length)))
        .when(Boolean(prs?.envoys), (el) => el.child(this.envoys(prs, unseen(prs, "envoys").size)).child(this.petitioners(prs, unseen(prs, "petitioners").size)))
        .when(resets.length > 0, (el) => el.child(this.plaque("res-foire", pic("ic-sablier", 22, 28), fair || "—", t("untilFair"), t("fairTip"))))
        .child(div().flex_1().min_w(0).flex().justify_center().when(Boolean(scroll), (el) => el.child(scroll)))
        .when(Boolean(alert), (el) => el.child(alert))
        .child(this.mode())
        .child(hour));
  }
}
