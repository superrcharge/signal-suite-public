/**
 * Rendering a net's TX/RX pair as one string.
 *
 * Lives beside the net types rather than inside the wheel, because the wheel,
 * the Nets Library table, and the printed sheet must all read identically --
 * two separate implementations of this had already drifted apart once.
 */
export function formatNetFrequency(
  txFreq: string | undefined,
  rxFreq: string | undefined,
  freqUnit: string | undefined,
): string {
  const tx = (txFreq ?? '').trim();
  const rx = (rxFreq ?? '').trim();
  const unit = (freqUnit ?? '').trim();

  if (!tx && !rx) return '';

  // The unit is only appended when there is a figure for it to qualify. The
  // fields are freeform, so a value may be a word rather than a number, and
  // "TBD MHz" is nonsense on a printed wheel.
  const hasFigure = /\d/.test(tx) || /\d/.test(rx);
  const suffix = unit && hasFigure ? ` ${unit}` : '';

  // A simplex net reads as one figure, not "TX x / RX x".
  if (tx && rx && tx === rx) return `${tx}${suffix}`;
  if (tx && rx) return `TX ${tx} / RX ${rx}${suffix}`;
  if (tx) return `TX ${tx}${suffix}`;
  return `RX ${rx}${suffix}`;
}

/**
 * The same pair, split for the wheel, where horizontal room is the scarce
 * resource and vertical room is not.
 *
 * A split TX/RX pair on one line is the single widest thing on the sheet -- 211
 * viewBox units at its worst, against 137 available. Broken over two lines the
 * widest is 104, which lets the whole wheel be drawn larger. Only genuinely
 * split pairs take the second line; simplex and single-sided nets stay on one,
 * so most labels are unchanged.
 */
export function formatNetFrequencyLines(
  txFreq: string | undefined,
  rxFreq: string | undefined,
  freqUnit: string | undefined,
): string[] {
  const tx = (txFreq ?? '').trim();
  const rx = (rxFreq ?? '').trim();
  const unit = (freqUnit ?? '').trim();

  if (!tx && !rx) return [];

  const hasFigure = /\d/.test(tx) || /\d/.test(rx);
  const suffix = unit && hasFigure ? ` ${unit}` : '';

  if (tx && rx && tx !== rx) return [`TX ${tx}`, `RX ${rx}${suffix}`];

  // Everything else is short enough to stay on one line.
  return [formatNetFrequency(tx, rx, unit)];
}
