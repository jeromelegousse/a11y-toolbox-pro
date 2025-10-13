const SEMVER_REGEX = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;

const PRERELEASE_REGEX = /^(?:0|[1-9]\d*|[0-9A-Za-z-]+)$/;

function normalizeSegment(segment = '') {
  return segment.trim();
}

function parseIdentifiers(segment = '', { numericOnly = false } = {}) {
  if (!segment) return [];
  return segment.split('.').map((identifier) => {
    const value = normalizeSegment(identifier);
    if (!value) return '';
    if (!numericOnly && PRERELEASE_REGEX.test(value)) {
      if (/^\d+$/.test(value)) {
        return Number.parseInt(value, 10);
      }
      return value;
    }
    if (numericOnly && /^\d+$/.test(value)) {
      return Number.parseInt(value, 10);
    }
    return value;
  });
}

export function isValidSemver(version) {
  if (typeof version !== 'string') return false;
  return SEMVER_REGEX.test(version.trim());
}

export function parseSemver(version) {
  if (!isValidSemver(version)) return null;
  const trimmed = version.trim();
  const [corePart, buildPart] = trimmed.split('+');
  const [mainPart, prereleasePart] = corePart.split('-');
  const [major, minor, patch] = mainPart.split('.').map((value) => Number.parseInt(value, 10));
  const prerelease = prereleasePart ? parseIdentifiers(prereleasePart) : [];
  const build = buildPart ? parseIdentifiers(buildPart, { numericOnly: false }) : [];
  return Object.freeze({
    raw: trimmed,
    major,
    minor,
    patch,
    prerelease: Object.freeze(prerelease),
    build: Object.freeze(build)
  });
}

function compareIdentifiers(a = [], b = []) {
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const aIdentifier = a[index];
    const bIdentifier = b[index];
    if (aIdentifier === undefined) return -1;
    if (bIdentifier === undefined) return 1;
    const aIsNumber = typeof aIdentifier === 'number';
    const bIsNumber = typeof bIdentifier === 'number';
    if (aIsNumber && bIsNumber) {
      if (aIdentifier > bIdentifier) return 1;
      if (aIdentifier < bIdentifier) return -1;
      continue;
    }
    if (aIsNumber && !bIsNumber) return -1;
    if (!aIsNumber && bIsNumber) return 1;
    if (aIdentifier > bIdentifier) return 1;
    if (aIdentifier < bIdentifier) return -1;
  }
  return 0;
}

export function compareSemver(a, b) {
  const parsedA = parseSemver(a);
  const parsedB = parseSemver(b);
  if (!parsedA && !parsedB) return 0;
  if (!parsedA) return -1;
  if (!parsedB) return 1;
  if (parsedA.major !== parsedB.major) {
    return parsedA.major > parsedB.major ? 1 : -1;
  }
  if (parsedA.minor !== parsedB.minor) {
    return parsedA.minor > parsedB.minor ? 1 : -1;
  }
  if (parsedA.patch !== parsedB.patch) {
    return parsedA.patch > parsedB.patch ? 1 : -1;
  }
  const hasPrereleaseA = parsedA.prerelease.length > 0;
  const hasPrereleaseB = parsedB.prerelease.length > 0;
  if (!hasPrereleaseA && hasPrereleaseB) return 1;
  if (hasPrereleaseA && !hasPrereleaseB) return -1;
  if (!hasPrereleaseA && !hasPrereleaseB) return 0;
  return compareIdentifiers(parsedA.prerelease, parsedB.prerelease);
}

export { SEMVER_REGEX };

export default {
  SEMVER_REGEX,
  isValidSemver,
  parseSemver,
  compareSemver
};
