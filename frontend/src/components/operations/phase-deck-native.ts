import { operationStem } from '@/components/common/sheet-export/sheet-export';
import type { NativeDeckSpec } from '@/components/common/sheet-export/sheet-export';
import { WIDE_SLIDE } from '@/components/common/sheet-export/slide-geometry';
import { toHexColor } from '@/components/common/sheet-export/pace-text-runs';
import type { Site } from '@/types';
import type { DeckPlan } from './phase-deck-plan';
import { buildNativeSlide, layoutNativePhase, nativeLayoutWidth } from './phase-native';
import type { ResolveColor } from './phase-native';

/**
 * The deck as native PowerPoint objects rather than a picture of each phase:
 * one slide per phase, 16:9, in phase order, each drawn in the Show mode the
 * screen is in. See `phase-native.ts` for what each part of a slide becomes.
 *
 * Nothing is mounted or captured: the deck asks the layout for geometry, the
 * same `layoutPhase` and `layoutFocus` the screen asks, and writes shapes.
 */

/** A CSS colour as the browser computes it, as six hex digits; a token such as `var(--fg-1)` is read off the document. */
export const browserColor: ResolveColor = (css) => {
  const probe = document.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.color = css;
  document.body.appendChild(probe);
  const hex = toHexColor(getComputedStyle(probe).color);
  probe.remove();
  return hex ?? '000000';
};

/** `resolve` is the colour source; the browser's by default, and a table in a test. */
export function phaseNativeDeckSpec(plan: DeckPlan, sites: Site[], operationName: string, resolve: ResolveColor = browserColor): NativeDeckSpec {
  return {
    stem: operationStem(operationName),
    slide: WIDE_SLIDE,
    count: plan.slides.length,
    buildSlide: async (index) => {
      const slide = plan.slides[index];
      if (!slide) throw new Error('There is no such slide.');
      const laid = await layoutNativePhase(slide, sites, plan, nativeLayoutWidth(WIDE_SLIDE));
      return buildNativeSlide({ slide, plan, laid, size: WIDE_SLIDE, resolve });
    },
  };
}
