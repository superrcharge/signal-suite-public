import { describe, expect, it } from 'vitest';

import { matrixPrintHref, printHref, readPrintParams } from './operation-print-params';

describe('the print route\'s query', () => {
  it('carries the screen\'s mode, unit and phase, and drops what the screen has not got', () => {
    expect(printHref('op-1', { show: 'gaps', focus: null, phase: null })).toBe('/operations/op-1/print?show=gaps');
    expect(printHref('op-1', { show: 'focus', focus: 'p-2', phase: 'ph-3' })).toBe('/operations/op-1/print?show=focus&focus=p-2&phase=ph-3');
  });

  it('reads back what it wrote', () => {
    const wrote = printHref('op-1', { show: 'focus', focus: 'p 2&', phase: 'ph-3' });
    expect(readPrintParams(new URLSearchParams(wrote.split('?')[1]))).toEqual({ show: 'focus', focus: 'p 2&', phase: 'ph-3' });
  });

  it('reads anything it does not know as All with no unit and no phase', () => {
    expect(readPrintParams(new URLSearchParams(''))).toEqual({ show: 'all', focus: null, phase: null });
    expect(readPrintParams(new URLSearchParams('show=everything'))).toEqual({ show: 'all', focus: null, phase: null });
  });
});

describe('the Matrix print route\'s query', () => {
  it('names the route under the operation, with the phase on screen when there is one', () => {
    expect(matrixPrintHref('op-1', { phase: null })).toBe('/operations/op-1/matrix/print');
    expect(matrixPrintHref('op-1', { phase: 'ph-3' })).toBe('/operations/op-1/matrix/print?phase=ph-3');
  });

  it('escapes a phase id that needs it', () => {
    expect(matrixPrintHref('op-1', { phase: 'a b&c' })).toBe('/operations/op-1/matrix/print?phase=a+b%26c');
  });
});
