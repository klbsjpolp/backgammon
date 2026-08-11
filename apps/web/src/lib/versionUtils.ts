/**
 * Version strings reach the app from two places with two spellings: the release
 * tag (`v1.2.3`, injected as `VITE_APP_VERSION` and published in
 * `runtime-config.json`) and `package.json` (`1.2.3`). Normalizing the `v` away
 * is left to the parser so the tag can still be displayed as it was written.
 */
const VERSION_PATTERN = /^v?(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

type PrereleaseSegment = number | string;

interface ParsedVersion {
  release: number[];
  /** Absent on a plain release, which outranks any prerelease of itself. */
  prerelease: PrereleaseSegment[] | null;
}

/** Trims a config value down to a usable tag, or null when it carries nothing. */
export const normalizeVersion = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const parseVersion = (value: string): ParsedVersion | null => {
  const match = VERSION_PATTERN.exec(value);
  if (!match) return null;

  return {
    release: match[1].split('.').map(Number),
    prerelease: match[2] ? match[2].split('.').map((s) => (/^\d+$/.test(s) ? Number(s) : s)) : null,
  };
};

const compareRelease = (left: number[], right: number[]): number => {
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    // A missing segment is zero, so `v1.2` and `v1.2.0` compare equal.
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
};

const comparePrerelease = (left: PrereleaseSegment[] | null, right: PrereleaseSegment[] | null): number => {
  if (!left && !right) return 0;
  // Semver: a release outranks any prerelease built towards it.
  if (!left) return 1;
  if (!right) return -1;

  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const a = left[i];
    const b = right[i];
    // The shorter identifier list is the lower version (`1.0.0-rc < 1.0.0-rc.1`).
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    if (a === b) continue;
    if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : 1;
    // Numeric identifiers always rank below alphanumeric ones.
    if (typeof a === 'number') return -1;
    if (typeof b === 'number') return 1;
    return String(a).localeCompare(String(b));
  }

  return 0;
};

/**
 * Orders two version tags: negative when `left` is older, 0 when they match,
 * positive when `left` is newer. A missing version counts as the oldest, and two
 * unparseable tags fall back to a string comparison so an unexpected format can
 * still tell "changed" from "unchanged".
 */
export const compareVersions = (left: string | null | undefined, right: string | null | undefined): number => {
  const a = normalizeVersion(left);
  const b = normalizeVersion(right);

  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  if (a === b) return 0;

  const parsedA = parseVersion(a);
  const parsedB = parseVersion(b);
  if (!parsedA || !parsedB) return a.localeCompare(b);

  return compareRelease(parsedA.release, parsedB.release) || comparePrerelease(parsedA.prerelease, parsedB.prerelease);
};
