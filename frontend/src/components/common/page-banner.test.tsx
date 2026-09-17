import { describe, expect, it } from 'vitest';

import { render, screen } from '@/test/utils';
import { PageBanner, PageTitle, RailTitle } from './page-banner';

// The bleed itself is not asserted here. It lives in an MUI sx prop, which
// compiles to an emotion class jsdom does not resolve, so any assertion on the
// margins would be testing the styling engine rather than this component. It is
// verified in a real browser instead, by comparing the banner's left edge to
// the sidebar's right edge.
//
// What is worth pinning down here is the structure: that children render, and
// that the variant and sticky flags are honoured rather than silently dropped.
describe('PageBanner', () => {
  it('renders its children', () => {
    render(<PageBanner>bar contents</PageBanner>);

    expect(screen.getByText('bar contents')).toBeInTheDocument();
  });

  it('renders children in the plain variant too', () => {
    render(<PageBanner variant="plain">toolbar contents</PageBanner>);

    expect(screen.getByText('toolbar contents')).toBeInTheDocument();
  });

  it('is not sticky unless asked', () => {
    const { container } = render(<PageBanner>x</PageBanner>);
    const notSticky = container.firstElementChild?.className;

    const { container: stickyContainer } = render(<PageBanner sticky>x</PageBanner>);
    const sticky = stickyContainer.firstElementChild?.className;

    // Emotion hashes the rules into the class name, so a different class is the
    // observable difference between the two without reading computed styles.
    expect(sticky).not.toEqual(notSticky);
  });

  it('distinguishes the two variants', () => {
    const { container: rail } = render(<PageBanner>x</PageBanner>);
    const { container: plain } = render(<PageBanner variant="plain">x</PageBanner>);

    expect(rail.firstElementChild?.className).not.toEqual(
      plain.firstElementChild?.className,
    );
  });
});

// Size and colour are sx for the same reason the bleed is, so they were
// measured in a browser instead: 18px amber on every page that uses this. What
// is pinned here is that the title is the page's heading, which is what makes
// it one element shared by ten pages rather than a style each might skip.
describe('PageTitle', () => {
  it('renders its text as the page h1', () => {
    render(<PageTitle>Comms Library</PageTitle>);

    expect(screen.getByRole('heading', { level: 1, name: 'Comms Library' })).toBeInTheDocument();
  });
});

describe('RailTitle', () => {
  it('renders its text as the page h1 by default, and as the given element when told', () => {
    const { unmount } = render(<RailTitle width={240}>Equipment Editor</RailTitle>);
    expect(screen.getByRole('heading', { level: 1, name: 'Equipment Editor' })).toBeInTheDocument();
    unmount();
    render(<RailTitle width={200} component="div">Data Sheet</RailTitle>);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByText('Data Sheet')).toBeInTheDocument();
  });

  it('carries the rail width, so the rule can sit on the rail edge', () => {
    // jsdom does not resolve emotion classes, so the width is checked as the
    // prop that reaches the element rather than as a computed style.
    render(<RailTitle width={232}>Equipment Catalog</RailTitle>);
    const block = screen.getByText('Equipment Catalog').closest('[data-rail-title]');
    expect(block).not.toBeNull();
  });
});
