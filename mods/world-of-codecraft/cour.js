// The town hall's court: the person's pull requests (prs.js, shared "wocc.prs") as villagers.
//   petitioners  PRs waiting for the person's review queue at the town-hall door, longest wait first
//                (peasant woman and farmer by turns); one back with new commits wears the gold "?"
//   envoys       the person's own PRs wait on the cobbles facing the hall (merchants): CI failed or
//                changes requested = turned away from the door with the "!", unresolved comments =
//                the "!" facing the door, approved = the gold "?"; drafts stay home (the list has them)
//   raven        perches on the hall's gilded rod while something changed since the person last looked;
//                click it: the list with the news
// Hover a villager: its PR; click: open it on GitHub. Drawn whether or not the village is animated
// (still sprites then); only the markers and the raven move.

import { div, image } from "gpui-kit";
import { exec, run, shared } from "herdr";
import { CREATURES } from "./creatures-data.js";
import { KEY as PRS, unseen } from "./prs.js";
import { stop } from "./kit.js";
import { t as tr } from "./i18n.js";

const CRE = "mods/world-of-codecraft/art/creatures";
const MONDE = "mods/world-of-codecraft/art/monde";

// Feet points (world px). The queue runs from the door down towards the road; envoys stand on the
// cobbles between the hall and the well. The last spot of each holds "+N" when there are more.
const QUEUE = [[1214, 340], [1174, 352], [1134, 364], [1094, 378], [1054, 392]];
const ENVOYS = [[1262, 366], [1308, 366], [1354, 366], [1284, 394], [1330, 394], [1376, 394]];
const PERCH = [1318, 121]; // the tip of the gilded rod on the clock tower

const NEEDS = new Set(["fail", "changes", "comments"]);
const AWAY = new Set(["fail", "changes"]); // turned away from the door

/** A near-instant swap between two frames: `b` shows half the period (as in ambiance.js). */
const swap = (el, period) => el.loop("opacity", { from: -6, to: 7, period, easing: "linear" });
const unswap = (el, period) => el.loop("opacity", { from: 7, to: -6, period, easing: "linear" });

export class Cour {
  /** Depth-sorted world elements: [{ z, el, box }], like Ambiance.things. */
  things(night, live) {
    const d = shared(PRS);
    if (!d?.envoys) return [];
    const n = night ? "-n" : "";
    const out = [];

    const sprite = (kind, face) => {
      const p = CREATURES[kind]?.debout;
      return p && image(`${CRE}/${kind}/debout${face}${n}.png`).absolute().left(-p.ax).top(-p.ay).w(p.w).h(p.h);
    };

    const villager = (id, kind, [x, y], face, pr, { mark = null, bob = false } = {}) => {
      const p = CREATURES[kind].debout;
      const head = -p.ay;
      let el = div().id(id).absolute().left(x).top(y).w(0).h(0)
        .child(div().absolute().left(-11).top(-4).w(22).h(7).rounded_full().bg("#00000033"))
        .child(div().absolute().left(0).top(0).w(0).h(0)
          .when(bob && live, (e) => e.loop("top", { from: 0, to: -2, period: 700 }))
          .child(sprite(kind, face)));
      if (mark === "blocked") {
        el = el.child(image(`${MONDE}/m-blocked.png`).absolute().left(-8).top(head - 28).w(16).h(25)
          .when(live, (e) => e.loop("opacity", { from: 0.35, to: 1, period: 520 })));
      } else if (mark === "done") {
        el = el.child(image(`${MONDE}/m-done.png`).absolute().left(-9).top(head - 28).w(19).h(25)
          .when(live, (e) => e.loop("top", { from: head - 27, to: head - 32, period: 900 })));
      }
      el = el.child(div().id(`${id}-clic`).absolute().left(-p.ax).top(-p.ay).w(p.w).h(p.h).cursor_pointer()
        .tooltip(`${pr.repo}#${pr.number} ${pr.title}\n${tr("prState")[pr.state] ?? ""}${"ci" in pr ? "" : ` · @${pr.author}`}\n${tr("prOpenTip")}`)
        .on_mouse_down("left", stop)
        .on_click(() => exec("open", [pr.url])));
      return { z: y + 3, el, box: { x: x - p.ax, y: y - p.ay, w: p.w, h: p.h, fy: y } };
    };

    const more = (id, [x, y], count, list) => ({
      z: y + 4,
      el: div().id(id).absolute().left(x - 14).top(y - 92).h(18).px(5).rounded(3).bg("#f0e2c0").border_1().border_color("#5a3c22")
        .flex().items_center().text_size(12).text_color("#5a2a1a").cursor_pointer()
        .tooltip(tr("courMore", count))
        .on_mouse_down("left", stop)
        .on_click(() => run(`world-of-codecraft.${list}`))
        .child(`+${count}`),
    });

    // petitioners: the queue at the door, longest wait first
    const pets = [...d.petitioners].sort((a, b) => (a.state === "returns" ? 0 : 1) - (b.state === "returns" ? 0 : 1) || a.updatedAt - b.updatedAt);
    pets.slice(0, QUEUE.length).forEach((p, i) => {
      const waited = Date.now() - p.updatedAt > 3 * 86_400_000; // three days: impatient
      out.push(villager(`petition-${p.key}`, i % 2 ? "fermier" : "paysanne", QUEUE[i], "-g", p,
        { mark: p.state === "returns" ? "done" : null, bob: waited }));
    });
    if (pets.length > QUEUE.length) out.push(more("petition-plus", QUEUE[QUEUE.length - 1], pets.length - QUEUE.length, "petitioners"));

    // envoys: facing the hall, or turned away
    const envoys = d.envoys.filter((p) => p.state !== "draft");
    envoys.slice(0, ENVOYS.length).forEach((p, i) => {
      out.push(villager(`envoy-${p.key}`, "marchand", ENVOYS[i], AWAY.has(p.state) ? "-g" : "", p,
        { mark: NEEDS.has(p.state) ? "blocked" : p.state === "ready" ? "done" : null }));
    });
    if (envoys.length > ENVOYS.length) out.push(more("envoy-plus", ENVOYS[ENVOYS.length - 1], envoys.length - ENVOYS.length, "envoys"));

    // the raven: news since the person last looked
    const newsE = unseen(d, "envoys").size, newsP = unseen(d, "petitioners").size;
    if (newsE + newsP > 0) {
      const raven = (pose) => {
        const p = CREATURES.corbeau[pose];
        return image(`${CRE}/corbeau/${pose}${n}.png`).absolute().left(-p.ax).top(-p.ay).w(p.w).h(p.h);
      };
      const p = CREATURES.corbeau.perche;
      out.push({ z: 0, el: div().id("corbeau-nouvelles").absolute().left(PERCH[0]).top(PERCH[1]).w(0).h(0)
        .child(live ? unswap(raven("perche"), 2600) : raven("perche"))
        .when(live, (e) => e.child(swap(raven("croasse"), 2600)))
        .child(div().id("corbeau-clic").absolute().left(-p.ax - 4).top(-p.ay - 4).w(p.w + 8).h(p.h + 8).cursor_pointer()
          .tooltip(tr("courRaven", newsE, newsP))
          .on_mouse_down("left", stop)
          .on_click(() => run(`world-of-codecraft.${newsE ? "envoys" : "petitioners"}`))) });
    }
    return out;
  }
}
