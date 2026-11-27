/** 一服点て: 左手は縁を押さえ、右手は W の字に振る。hint が残っているあいだだけ出す。 */
import * as C from "../engine/constants.mjs";
import {
  drawHoldGuide,
  drawTravelGuide,
  guideNow,
  pathWM,
  prefersReducedMotion,
} from "./motion-guide.mjs";

const BOWL_CX = C.BOWL_CX ?? 208;
const BOWL_CY = C.BOWL_CY ?? 196;
const BOWL_R = C.BOWL_VISUAL_R ?? C.BOWL_R ?? 86;

export function drawMotionGuides(ctx, view, state) {
  if (state?.status !== "playing") return;
  if (state.phase !== "pour" && state.phase !== "whisk") return;
  const reduced = prefersReducedMotion();
  const t = guideNow();
  if (state.hintLeft !== false) {
    drawHoldGuide(ctx, view, BOWL_CX - (BOWL_R - 6), BOWL_CY, t, {
      reduced,
      ring: 30,
      startAng: Math.PI,
      arrows: 3,
      alpha: 0.44,
    });
  }
  if (state.hintRight !== false) {
    // 右域の中央。茶碗（中心 208、半径 86）にはかからない。
    const pts = pathWM(508, 208, 100, 78, 48);
    drawTravelGuide(ctx, view, pts, t, {
      period: 2.0,
      loop: "pingpong",
      reduced,
      alpha: 0.58,
      pathDashed: false,
      pathWidth: 3.4,
      pathAlpha: 0.58,
      pathHalo: true,
    });
  }
}
