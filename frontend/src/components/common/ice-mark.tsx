/**
 * The Instant Connect Enterprise (ICE) designator, marking a net carried over
 * IP rather than RF alone.
 *
 * **Provenance.** This is the "o" device from the Instant Connect wordmark -
 * the warm-grey node and the gold arc that together replace the letter in
 * "c(o)nnect" - lifted verbatim from the two paths that draw it. The full
 * wordmark is `viewBox="0 0 800 90"`, an 8.9:1 ratio that is 124px wide at the
 * 14px height this sits at, so the wordmark itself can never be the inline
 * mark. The device alone is 64.3 x 84.2, near enough square to follow a name.
 *
 * Two earlier candidates were drawn from memory - concentric rings with
 * gradients - and both were wrong. The device is not a ring pair and has no
 * gradients: it is two flat fills, `#BAAB95` and `#DDA926`. Do not redraw it.
 * If it ever needs replacing, take the geometry from the wordmark again.
 *
 * It is a third-party trademark used here as a status designator at the
 * maintainer's direction. Do not restyle the fills to the app palette - a
 * recoloured trademark is a worse position than an accurate one, and the gold
 * already sits a few degrees off `--shf-amber` without clashing.
 */

/** The device's own bounding box within the wordmark's 800x90 coordinate space. */
export const ICE_VIEWBOX = '424.3 5 64.3 84.2';

/** Width-to-height ratio, so a caller sets one dimension and derives the other. */
export const ICE_ASPECT = 64.3 / 84.2;

/**
 * The symbol id the SVG sites reference.
 *
 * The wheel renders up to 16 channels and a sheet carries two wheels, so the
 * mark can appear 32 times in one document. Each instance redeclaring the paths
 * would be 32 copies; worse, the gradient-bearing candidates would have
 * redeclared ids and every instance after the first would have resolved to the
 * first one's definition. One `<symbol>` plus N `<use>` avoids both, which is
 * why `IceMarkDefs` exists separately from `IceMark`.
 */
export const ICE_SYMBOL_ID = 'ice-mark';

const NODE_PATH =
  'M440,62.8c8.6,0,15.7-7.1,15.7-15.7s-7-15.7-15.7-15.7s-15.7,7-15.7,15.7S431.4,62.8,440,62.8z';

const ARC_PATH =
  'M485.3,29.4c-0.6-1.6-1.3-3.1-2.1-4.6c-4.3-8.3-10.9-15.1-18.9-19.8l-8,13.8c9.8,5.6,16.3,16.2,16.3,28.3' +
  's-6.6,22.6-16.3,28.3l8,13.8c5.1-2.9,9.6-6.8,13.3-11.3c1.9-2.3,3.5-4.7,4.9-7.2c3.9-7,6.1-15,6.1-23.6' +
  'C488.6,40.9,487.4,34.9,485.3,29.4z';

const NODE_FILL = '#BAAB95';
const ARC_FILL = '#DDA926';

function Paths() {
  return (
    <>
      <path fill={NODE_FILL} d={NODE_PATH} />
      <path fill={ARC_FILL} d={ARC_PATH} />
    </>
  );
}

interface IceMarkProps {
  /** Rendered height in px. Width follows from ICE_ASPECT. */
  height?: number;
}

/**
 * The DOM form: a standalone inline SVG, for a table cell or any HTML context.
 *
 * 14px by default, which is the cap height of the 13px net name it follows, so
 * it reads as part of the line rather than as something sitting beside it.
 *
 * `aria-label` rather than `aria-hidden`, because this is the only thing on the
 * row that says the net is ROIP - it replaced a dedicated column that carried
 * its own label.
 */
export function IceMark({ height = 14 }: IceMarkProps) {
  return (
    <svg
      role="img"
      aria-label="ICE"
      height={height}
      width={Math.round(height * ICE_ASPECT)}
      viewBox={ICE_VIEWBOX}
      style={{ flexShrink: 0, verticalAlign: 'middle' }}
    >
      <Paths />
    </svg>
  );
}

/**
 * The SVG form's definition. Render this **once** per SVG document, then draw
 * each instance with `<use href={`#${ICE_SYMBOL_ID}`} />`.
 *
 * A `<symbol>` rather than a bare `<g>` so the instances carry their own
 * viewBox scaling and a `<use>` needs only x/y/width/height.
 */
export function IceMarkDefs() {
  return (
    <defs>
      <symbol id={ICE_SYMBOL_ID} viewBox={ICE_VIEWBOX}>
        <Paths />
      </symbol>
    </defs>
  );
}
