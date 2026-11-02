import { describe, expect, it } from 'vitest';

import { HELP_GROUPS, type HelpGroup } from './help-content';
import { queryWords, searchTopics, stem, tokenize } from './help-search';

// Steps resolve to themselves here; the dialog maps a "@token" to the
// control's name before it reaches the search, and that mapping is the
// dialog's to test.
const name = (step: string) => step;

const topicIds = (groups: ReturnType<typeof searchTopics>) =>
  groups.flatMap((g) => g.topics.map((t) => t.topic.id));

describe('stem', () => {
  it('takes one inflection off, when enough word is left', () => {
    expect(stem('nets')).toBe('net');
    expect(stem('adding')).toBe('add');
    expect(stem('deleted')).toBe('delet');
    expect(stem('services')).toBe('servic');
    // Too short to be a stem of anything: left alone.
    expect(stem('is')).toBe('is');
    expect(stem('pace')).toBe('pace');
  });
});

describe('tokenize', () => {
  it('drops stop words, splits on punctuation, lowercases and stems', () => {
    expect(tokenize('How do I add a net?')).toEqual(['add', 'net']);
    expect(tokenize('Import & Export')).toEqual(['import', 'export']);
    expect(tokenize('CIR/MIR, Mbps')).toEqual(['cir', 'mir', 'mbp']);
  });

  it('is empty for nothing but stop words', () => {
    expect(tokenize('how do i')).toEqual([]);
    expect(queryWords('  How To ')).toEqual([]);
  });
});

describe('searchTopics over the real help content', () => {
  const first = (query: string) => topicIds(searchTopics(HELP_GROUPS, query, name))[0];

  it('finds "How do I add a net?" from the words, not the phrase', () => {
    // The question this exists for: the old search matched the whole typed
    // string, so one filler word it lacked ("to") returned nothing.
    expect(first('how to add a net')).toBe('add-net');
    expect(first('how do i add a net')).toBe('add-net');
    expect(first('add net')).toBe('add-net');
  });

  it('meets the question through stemming and prefixes', () => {
    expect(first('adding nets')).toBe('add-net');
    expect(topicIds(searchTopics(HELP_GROUPS, 'net', name))).toContain('add-net');
    expect(topicIds(searchTopics(HELP_GROUPS, 'ne', name))).toContain('add-net');
  });

  it('shows only the topics matching every word when any do', () => {
    // Every "add" topic also matches one word; they are a lower tier and
    // stay out of the way of the one that matches both.
    const ids = topicIds(searchTopics(HELP_GROUPS, 'add net', name));
    expect(ids).toContain('add-net');
    expect(ids).not.toContain('add-terminal');
  });

  it('treats a query of stop words as no query', () => {
    const all = searchTopics(HELP_GROUPS, 'how do i', name);
    expect(all.map((g) => g.group.id)).toEqual(HELP_GROUPS.map((g) => g.id));
    expect(all.every((g) => g.topics.every((t) => t.matchedIn === 'question'))).toBe(true);
  });

  it('returns nothing for a word that is nowhere', () => {
    expect(searchTopics(HELP_GROUPS, 'zzznotarealterm', name)).toEqual([]);
  });
});

describe('searchTopics ranking and matchedIn', () => {
  const groups: HelpGroup[] = [
    {
      id: 'g1',
      title: 'First',
      topics: [
        { id: 'q', question: 'How do I print a wheel?', roles: 'all', keywords: ['hub'] },
        { id: 'n', question: 'Why is the card blank?', roles: 'all', note: 'Print it from the wheel page.' },
        { id: 's', question: 'Where is the emblem?', roles: 'all', steps: ['Print / Save PDF'] },
      ],
    },
    {
      id: 'g2',
      title: 'Second',
      topics: [
        { id: 'k', question: 'What is a theater?', roles: 'all', keywords: ['print', 'wheel', 'conus'] },
      ],
    },
  ];

  it('falls back to the topics matching the most words when none match all', () => {
    // "print" is everywhere, "spigot" nowhere: the one-word tier is the best.
    const ids = topicIds(searchTopics(groups, 'print spigot', name));
    expect(ids).toEqual(expect.arrayContaining(['q', 'n', 's', 'k']));
  });

  it('names the strongest field a word was found in', () => {
    const byId = Object.fromEntries(
      searchTopics(groups, 'print', name).flatMap((g) => g.topics.map((t) => [t.topic.id, t.matchedIn])),
    );
    expect(byId.q).toBe('question');
    expect(byId.k).toBe('keywords');
    expect(byId.s).toBe('steps');
    expect(byId.n).toBe('note');
  });

  it('orders by matched words, then field weight, then source order', () => {
    // "print wheel": q has both in the question (3+3), k both in keywords
    // (3+3), n both in the note (1+1). q and k tie and keep source order.
    expect(topicIds(searchTopics(groups, 'print wheel', name))).toEqual(['q', 'n', 'k']);
    // Groups order by their best topic: g2's k (6) outranks g1 only if it
    // beats q (6); a tie keeps source order, so g1 stays first.
    const ordered = searchTopics(groups, 'wheel hub', name);
    expect(ordered[0]?.group.id).toBe('g1');
  });
});
