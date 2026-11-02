/**
 * Word search over the help topics.
 *
 * The search used to match the whole typed string with `includes`, so
 * "how do i add a net" found "How do I add a net?" and "how to add a net"
 * found nothing: one filler word the stored text lacked, and the reader had
 * to delete back to "net" to see a result. 59 of the 93 questions start
 * "How do I", so the shared words carry no signal; the distinctive ones are
 * what a reader means.
 *
 * So the query and every topic field are reduced to words: lowercased, split
 * on anything that is not a letter or digit, stop words dropped, and a light
 * stem taken so "adding nets" and "add a net" meet in the middle. A query word
 * matches a field word it is a prefix of, so "ne" finds "nets" while the
 * reader is still typing. Topics score by how many distinct query words they
 * match, then by the weight of the best field each word was found in. Only
 * the best tier is shown: the topics matching every word, or, when none do,
 * those matching the most.
 *
 * Pure, so the rule is asserted directly. The dialog owns rendering.
 */
import type { HelpGroup, HelpTopic } from './help-content';

/**
 * Where in a topic a hit was found. The question is the only field drawn on
 * a collapsed row, so a hit there is marked in place; a hit anywhere else is
 * named by a caption until the reader opens the topic, and keywords are never
 * drawn at all.
 */
export type MatchedIn = 'question' | 'steps' | 'note' | 'keywords';

/**
 * Words that appear in most questions and distinguish nothing. Short on
 * purpose: a stop list that grows past the obvious starts eating real words
 * ("can" is the gate word in "Who can ...", and still carries no signal).
 */
const STOP_WORDS = new Set([
  'how', 'do', 'does', 'i', 'to', 'a', 'an', 'the', 'my', 'can', 'is', 'it',
  'in', 'on', 'of', 'for', 'what', 'where', 'why', 'who', 'you', 'me', 'and',
  'or', 'with',
]);

/**
 * Field weights: a word in the question or the keywords is what the topic is
 * about; a word in a step is a control it mentions; a word in the note is
 * incidental. Also the tie-break for `matchedIn`, so the caption names the
 * strongest field rather than the first one checked.
 */
const WEIGHT: Record<MatchedIn, number> = { question: 3, keywords: 3, steps: 2, note: 1 };
const FIELDS: MatchedIn[] = ['question', 'keywords', 'steps', 'note'];

/**
 * A light stem: one trailing inflection off, when enough word is left to be
 * a word. Applied to both sides, so it only has to be consistent. "nets" and
 * "net" meet at "net"; "adding" and "add" at "add"; "services" at "servic",
 * which is fine because nobody sees it.
 */
export function stem(word: string): string {
  for (const suffix of ['ing', 'ed', 'es', 's']) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}

/** The searchable words of a string: lowercased, split, stop words dropped, stemmed. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w !== '' && !STOP_WORDS.has(w))
    .map(stem);
}

export interface TopicIndex {
  topic: HelpTopic;
  fields: Record<MatchedIn, string[]>;
}

/**
 * The words of each field, once. `stepName` resolves a `@token` step to the
 * control's real name, because a tokenised step is stored as "@share" and
 * the reader searches for the words on the control, not the token.
 */
export function indexTopic(topic: HelpTopic, stepName: (step: string) => string): TopicIndex {
  return {
    topic,
    fields: {
      question: tokenize(topic.question),
      keywords: tokenize((topic.keywords ?? []).join(' ')),
      steps: tokenize((topic.steps ?? []).map(stepName).join(' ')),
      note: tokenize(topic.note ?? ''),
    },
  };
}

export interface TopicHit {
  topic: HelpTopic;
  matchedIn: MatchedIn;
  /** Distinct query words found, then the weights of the best field per word. */
  score: [matched: number, weight: number];
}

export interface GroupHit {
  group: HelpGroup;
  topics: TopicHit[];
}

function scoreTopic(index: TopicIndex, words: string[]): TopicHit | null {
  let matched = 0;
  let weight = 0;
  let best: MatchedIn | null = null;
  for (const word of words) {
    let bestField: MatchedIn | null = null;
    for (const field of FIELDS) {
      if (index.fields[field].some((w) => w.startsWith(word))) {
        if (bestField === null || WEIGHT[field] > WEIGHT[bestField]) bestField = field;
      }
    }
    if (bestField === null) continue;
    matched += 1;
    weight += WEIGHT[bestField];
    if (best === null || WEIGHT[bestField] > WEIGHT[best]) best = bestField;
  }
  if (best === null) return null;
  return { topic: index.topic, matchedIn: best, score: [matched, weight] };
}

/**
 * The groups and topics that match `query`, best first.
 *
 * An empty query, or one made only of stop words ("how do i"), is no query:
 * every group and topic in source order, matched in the question, so the
 * dialog draws the whole list with nothing marked. Otherwise only the best
 * tier survives, ordered by score within a group and by best topic across
 * groups, with source order as the final tie-break so two equal hits keep the
 * order the file gives them.
 */
export function searchTopics(
  groups: HelpGroup[],
  query: string,
  stepName: (step: string) => string,
): GroupHit[] {
  const words = [...new Set(tokenize(query))];
  if (words.length === 0) {
    return groups.map((group) => ({
      group,
      topics: group.topics.map((topic) => ({ topic, matchedIn: 'question' as const, score: [0, 0] })),
    }));
  }

  const scored = groups.map((group) => ({
    group,
    topics: group.topics.flatMap((topic) => {
      const hit = scoreTopic(indexTopic(topic, stepName), words);
      return hit === null ? [] : [hit];
    }),
  }));

  const bestMatched = Math.max(0, ...scored.flatMap((g) => g.topics.map((t) => t.score[0])));
  if (bestMatched === 0) return [];

  const byScore = (a: TopicHit, b: TopicHit) => b.score[1] - a.score[1];
  const tiered = scored
    .map((g) => ({ group: g.group, topics: g.topics.filter((t) => t.score[0] === bestMatched).sort(byScore) }))
    .filter((g) => g.topics.length > 0);
  // Stable sort, so groups with an equal best keep source order. The first
  // topic is the best, since each group was just sorted by score.
  const best = (g: GroupHit) => g.topics[0]?.score[1] ?? 0;
  return tiered.sort((a, b) => best(b) - best(a));
}

/** The query words the highlighter should mark: what `searchTopics` matched on. */
export function queryWords(query: string): string[] {
  return [...new Set(tokenize(query))];
}
