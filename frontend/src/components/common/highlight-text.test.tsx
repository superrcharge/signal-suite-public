import { describe, expect, it } from 'vitest';

import { render, screen } from '@/test/utils';
import { HighlightText } from './highlight-text';
import { splitOnTerm, splitOnTerms } from './split-on-term';

describe('splitOnTerm', () => {
  it('returns the whole text unmarked for an empty term', () => {
    expect(splitOnTerm('Who can read the audit log?', '')).toEqual([
      { text: 'Who can read the audit log?', hit: false },
    ]);
  });

  it('returns empty text unmarked', () => {
    expect(splitOnTerm('', 'audit')).toEqual([{ text: '', hit: false }]);
  });

  it('returns the whole text unmarked when the term is absent', () => {
    expect(splitOnTerm('Who can read the audit log?', 'kit')).toEqual([
      { text: 'Who can read the audit log?', hit: false },
    ]);
  });

  it('returns the whole text unmarked when the term is longer than the text', () => {
    expect(splitOnTerm('audit', 'audit log')).toEqual([{ text: 'audit', hit: false }]);
  });

  it('marks one hit in the middle', () => {
    expect(splitOnTerm('Who can read the audit log?', 'audit')).toEqual([
      { text: 'Who can read the ', hit: false },
      { text: 'audit', hit: true },
      { text: ' log?', hit: false },
    ]);
  });

  it('marks a hit at the start and at the end without empty segments', () => {
    expect(splitOnTerm('audit log', 'audit')).toEqual([
      { text: 'audit', hit: true },
      { text: ' log', hit: false },
    ]);
    expect(splitOnTerm('audit log', 'log')).toEqual([
      { text: 'audit ', hit: false },
      { text: 'log', hit: true },
    ]);
  });

  it('marks the whole text when the term is the whole text', () => {
    expect(splitOnTerm('Export', 'export')).toEqual([{ text: 'Export', hit: true }]);
  });

  it('marks every occurrence', () => {
    expect(splitOnTerm('add a kit, then add a net', 'add')).toEqual([
      { text: 'add', hit: true },
      { text: ' a kit, then ', hit: false },
      { text: 'add', hit: true },
      { text: ' a net', hit: false },
    ]);
  });

  it('matches case-insensitively and keeps the original casing in the segment', () => {
    expect(splitOnTerm('Download CSV', 'csv')).toEqual([
      { text: 'Download ', hit: false },
      { text: 'CSV', hit: true },
    ]);
  });

  it('does not overlap hits', () => {
    // "aa" in "aaa": one hit and one leftover, never two overlapping hits.
    expect(splitOnTerm('aaa', 'aa')).toEqual([
      { text: 'aa', hit: true },
      { text: 'a', hit: false },
    ]);
  });

  it('matches the term as one phrase, not word by word', () => {
    expect(splitOnTerm('Import and export data', 'import and export')).toEqual([
      { text: 'Import and export', hit: true },
      { text: ' data', hit: false },
    ]);
    // The words present but not adjacent: no hit at all.
    expect(splitOnTerm('Import data and then export it', 'import and export')).toEqual([
      { text: 'Import data and then export it', hit: false },
    ]);
  });
});

describe('HighlightText', () => {
  it('renders the plain string when nothing matches', () => {
    const { container } = render(<HighlightText text="Who can read the audit log?" term="kit" />);

    expect(container.querySelector('mark')).toBeNull();
    expect(screen.getByText('Who can read the audit log?')).toBeInTheDocument();
  });

  it('renders the plain string for an empty term', () => {
    const { container } = render(<HighlightText text="Who can read the audit log?" term="" />);

    expect(container.querySelector('mark')).toBeNull();
  });

  it('wraps each hit in a mark and leaves the rest as text', () => {
    const { container } = render(<HighlightText text="add a kit, then add a net" term="ADD" />);

    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(2);
    expect(Array.from(marks).map((m) => m.textContent)).toEqual(['add', 'add']);
    expect(container).toHaveTextContent('add a kit, then add a net');
  });

  it('keeps the text colour it sits in rather than the browser default black', () => {
    const { container } = render(
      <p style={{ color: 'rgb(230, 237, 243)' }}>
        <HighlightText text="audit log" term="audit" />
      </p>,
    );

    const mark = container.querySelector('mark');
    expect(mark).not.toBeNull();
    // The UA stylesheet paints a mark black on yellow. Ours takes the colour
    // of the text around it, so the computed colour is the parent's.
    expect(getComputedStyle(mark as Element).color).toBe('rgb(230, 237, 243)');
  });
});

describe('splitOnTerms', () => {
  it('marks each word separately where it begins a word', () => {
    // Two words to the search, so two marks on the page - not one phrase.
    expect(splitOnTerms('Who can read the audit log?', ['audit', 'log'])).toEqual([
      { text: 'Who can read the ', hit: false },
      { text: 'audit', hit: true },
      { text: ' ', hit: false },
      { text: 'log', hit: true },
      { text: '?', hit: false },
    ]);
  });

  it('marks only the typed prefix, and only at the start of a word', () => {
    // "ne" is a prefix of "nets"; the "ne" inside "channel" is not a word start.
    expect(splitOnTerms('Add a net to a channel of nets', ['ne'])).toEqual([
      { text: 'Add a ', hit: false },
      { text: 'ne', hit: true },
      { text: 't to a channel of ', hit: false },
      { text: 'ne', hit: true },
      { text: 'ts', hit: false },
    ]);
  });

  it('matches the words in any order and with other words between', () => {
    expect(splitOnTerms('Import data and then export it', ['export', 'import'])).toEqual([
      { text: 'Import', hit: true },
      { text: ' data and then ', hit: false },
      { text: 'export', hit: true },
      { text: ' it', hit: false },
    ]);
  });

  it('returns the whole text unmarked with no terms, or no hit', () => {
    expect(splitOnTerms('Who can read the audit log?', [])).toEqual([
      { text: 'Who can read the audit log?', hit: false },
    ]);
    expect(splitOnTerms('Who can read the audit log?', ['kit'])).toEqual([
      { text: 'Who can read the audit log?', hit: false },
    ]);
  });
});

describe('HighlightText with terms', () => {
  it('wraps each word hit in its own mark', () => {
    const { container } = render(<HighlightText text="How do I add a net?" terms={['add', 'net']} />);

    const marks = container.querySelectorAll('mark');
    expect(Array.from(marks).map((m) => m.textContent)).toEqual(['add', 'net']);
    expect(container).toHaveTextContent('How do I add a net?');
  });
});
