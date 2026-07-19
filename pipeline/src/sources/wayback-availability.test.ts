import { describe, expect, it, vi } from 'vitest';

import { checkChaptersInventory, type ChapterInventory } from '../admission/completeness.ts';
import type { SnapshotSource } from '../snapshot/manifest.ts';
import { chapterSourceId, type ChapterLink } from './html-chapters.ts';
import {
  buildAvailabilityUrl,
  CHAPTER_CAPTURE_TARGETS,
  isCaptureInBallotYear,
  parseAvailabilityClosest,
  resolveChapterCapture,
  resolveWaybackChapterSources,
  type AvailabilityFetcher,
} from './wayback-availability.ts';

const INDEX: SnapshotSource = {
  id: 'ptb-programme-2024',
  label: 'PTB — Programme',
  originUrl: 'https://www.ptb.be/programme',
  fetchUrl: 'https://web.archive.org/web/20240618091111id_/https://www.ptb.be/programme',
  channel: 'wayback',
  mediaType: 'text/html',
  provenance: 'note',
};

/** Availability JSON with a `closest` snapshot. */
const closest = (status: string, timestamp: string): unknown => ({
  archived_snapshots: { closest: { status, timestamp, available: true } },
});
/** Availability JSON with NO capture (the capricious empty response). */
const noCapture: unknown = { archived_snapshots: {} };

/**
 * A fetcher driven by a per-URL script: maps an availability URL (by the target
 * timestamp it carries) to a canned JSON response, keyed by chapter origin URL.
 */
function scriptedFetcher(script: Record<string, Record<string, unknown>>): AvailabilityFetcher {
  return (url: string) => {
    const parsed = new URL(url);
    const origin = decodeURIComponent(parsed.searchParams.get('url') ?? '');
    const target = parsed.searchParams.get('timestamp') ?? '';
    const perTarget = script[origin];
    if (perTarget === undefined || !(target in perTarget)) {
      return Promise.reject(new Error(`no scripted response for ${origin} @ ${target}`));
    }
    return Promise.resolve(perTarget[target]);
  };
}

describe('buildAvailabilityUrl', () => {
  it('encodes the origin URL and carries the target timestamp', () => {
    expect(buildAvailabilityUrl('https://www.ptb.be/programme/x', '20240609')).toBe(
      'https://archive.org/wayback/available?url=https%3A%2F%2Fwww.ptb.be%2Fprogramme%2Fx&timestamp=20240609',
    );
  });
});

describe('parseAvailabilityClosest', () => {
  it('extracts a well-formed closest', () => {
    expect(parseAvailabilityClosest(closest('200', '20240602182158'))).toEqual({
      status: '200',
      timestamp: '20240602182158',
    });
  });
  it('returns null when no capture / malformed', () => {
    expect(parseAvailabilityClosest(noCapture)).toBeNull();
    expect(parseAvailabilityClosest({})).toBeNull();
    expect(parseAvailabilityClosest(null)).toBeNull();
    expect(parseAvailabilityClosest({ archived_snapshots: { closest: { status: 200 } } })).toBeNull();
  });
});

describe('isCaptureInBallotYear', () => {
  it('accepts a 2024, HTTP-200 capture only', () => {
    expect(isCaptureInBallotYear({ status: '200', timestamp: '20240602182158' })).toBe(true);
    expect(isCaptureInBallotYear({ status: '404', timestamp: '20240602182158' })).toBe(false);
    expect(isCaptureInBallotYear({ status: '200', timestamp: '20231201000000' })).toBe(false);
    expect(isCaptureInBallotYear({ status: '200', timestamp: '20250101000000' })).toBe(false);
    expect(isCaptureInBallotYear(null)).toBe(false);
  });
});

describe('resolveChapterCapture', () => {
  const url = 'https://www.ptb.be/programme/justice-fiscale';

  it('resolves on the primary target when the closest is a 2024/200 capture', async () => {
    const fetchJson = scriptedFetcher({ [url]: { '20240609': closest('200', '20240602182158') } });
    expect(await resolveChapterCapture(url, fetchJson)).toBe('20240602182158');
  });

  it('falls back to a later target when the primary reports NO capture (API caprice)', async () => {
    // Mirrors the real justice-fiscale case: empty @20240609, resolves @20240701.
    const fetchJson = scriptedFetcher({
      [url]: { '20240609': noCapture, '20240701': closest('200', '20240602182158') },
    });
    expect(await resolveChapterCapture(url, fetchJson)).toBe('20240602182158');
  });

  it('falls through a network error on one target to the next', async () => {
    const fetchJson: AvailabilityFetcher = vi
      .fn<AvailabilityFetcher>()
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValueOnce(closest('200', '20240526120000'));
    expect(await resolveChapterCapture(url, fetchJson, ['20240609', '20240701'])).toBe(
      '20240526120000',
    );
  });

  it('rejects an out-of-2024 capture — returns null even when a 200 closest exists', async () => {
    const fetchJson = scriptedFetcher({
      [url]: {
        '20240609': closest('200', '20231115000000'),
        '20240701': closest('200', '20250101000000'),
        '20240601': noCapture,
        '20240515': closest('200', '20230601000000'),
      },
    });
    expect(await resolveChapterCapture(url, fetchJson)).toBeNull();
  });

  it('returns null when every target reports no capture', async () => {
    const perTarget = Object.fromEntries(CHAPTER_CAPTURE_TARGETS.map((t) => [t, noCapture]));
    expect(await resolveChapterCapture(url, scriptedFetcher({ [url]: perTarget }))).toBeNull();
  });
});

describe('resolveWaybackChapterSources', () => {
  const links: ChapterLink[] = [
    { slug: 'agriculture', url: 'https://www.ptb.be/programme/agriculture' },
    { slug: 'justice-fiscale', url: 'https://www.ptb.be/programme/justice-fiscale' },
    { slug: 'obsolete', url: 'https://www.ptb.be/programme/obsolete' },
  ];

  it('dates resolved chapters per capture and flags the out-of-2024 one as unavailable', async () => {
    const fetchJson = scriptedFetcher({
      'https://www.ptb.be/programme/agriculture': { '20240609': closest('200', '20240602000000') },
      // Empty @20240609, resolves @20240701 (fallback exercised end-to-end).
      'https://www.ptb.be/programme/justice-fiscale': {
        '20240609': noCapture,
        '20240701': closest('200', '20240526000000'),
      },
      // Only a 2023 capture exists → rejected → unavailable → missing → FAIL.
      'https://www.ptb.be/programme/obsolete': {
        '20240609': closest('200', '20231201000000'),
        '20240701': noCapture,
        '20240601': noCapture,
        '20240515': noCapture,
      },
    });

    const { sources, unavailable } = await resolveWaybackChapterSources(INDEX, links, fetchJson);

    expect(unavailable).toEqual(['obsolete']);
    expect(sources.map((s) => s.id)).toEqual([
      chapterSourceId(INDEX.id, 'agriculture'),
      chapterSourceId(INDEX.id, 'justice-fiscale'),
    ]);
    // Each resolved chapter is fetched from ITS OWN dated capture; origin stays canonical.
    expect(sources[0]).toMatchObject({
      originUrl: 'https://www.ptb.be/programme/agriculture',
      fetchUrl: 'https://web.archive.org/web/20240602000000id_/https://www.ptb.be/programme/agriculture',
      channel: 'wayback',
      mediaType: 'text/html',
    });
    expect(sources[1]?.fetchUrl).toBe(
      'https://web.archive.org/web/20240526000000id_/https://www.ptb.be/programme/justice-fiscale',
    );

    // Fail-closed chain: the committed index still EXPECTS every slug, so the
    // unavailable chapter is missing → chapters-inventory is incomplete → FAIL.
    const expectedSlugs = links.map((l) => l.slug).sort();
    const presentSlugs = sources
      .map((s) => s.id.slice(`${INDEX.id}-chapitre-`.length))
      .sort();
    const inventory: ChapterInventory = {
      expected: expectedSlugs,
      present: presentSlugs,
      missing: expectedSlugs.filter((s) => !presentSlugs.includes(s)),
    };
    expect(inventory.missing).toEqual(['obsolete']);
    expect(checkChaptersInventory([inventory]).status).toBe('incomplete');
  });
});
