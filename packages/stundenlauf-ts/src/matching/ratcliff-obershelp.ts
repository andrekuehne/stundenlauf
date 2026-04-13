/**
 * Ratcliff/Obershelp pattern matching — direct port of Python's
 * difflib.SequenceMatcher.ratio().
 *
 * The algorithm finds the longest common substring, then recursively
 * matches in the portions to the left and right of it.
 * ratio = 2.0 * matching_characters / total_characters
 *
 * Reference: F-TS03 §14 (SequenceMatcher Porting Strategy)
 */

/**
 * Find the longest common substring between a[aLo..aHi) and b[bLo..bHi).
 * Returns [bestI, bestJ, bestSize] — the match starts at a[bestI] and b[bestJ].
 *
 * This is a direct port of difflib.SequenceMatcher.find_longest_match().
 */
function findLongestMatch(
  a: string,
  b: string,
  aLo: number,
  aHi: number,
  bLo: number,
  bHi: number,
): [number, number, number] {
  let bestI = aLo;
  let bestJ = bLo;
  let bestSize = 0;

  // j2len[j] = length of longest match ending with a[i] and b[j]
  let j2len = new Map<number, number>();

  for (let i = aLo; i < aHi; i++) {
    const newJ2len = new Map<number, number>();
    for (let j = bLo; j < bHi; j++) {
      if (a[i] === b[j]) {
        const k = (j2len.get(j - 1) ?? 0) + 1;
        newJ2len.set(j, k);
        if (k > bestSize) {
          bestI = i - k + 1;
          bestJ = j - k + 1;
          bestSize = k;
        }
      }
    }
    j2len = newJ2len;
  }

  return [bestI, bestJ, bestSize];
}

/**
 * Recursively count matching characters using the Ratcliff/Obershelp algorithm.
 * This mirrors difflib.SequenceMatcher.get_matching_blocks().
 */
function countMatchingChars(
  a: string,
  b: string,
  aLo: number,
  aHi: number,
  bLo: number,
  bHi: number,
): number {
  const [bestI, bestJ, bestSize] = findLongestMatch(a, b, aLo, aHi, bLo, bHi);
  if (bestSize === 0) return 0;

  let total = bestSize;

  // Recurse on left portion
  if (aLo < bestI && bLo < bestJ) {
    total += countMatchingChars(a, b, aLo, bestI, bLo, bestJ);
  }

  // Recurse on right portion
  if (bestI + bestSize < aHi && bestJ + bestSize < bHi) {
    total += countMatchingChars(
      a,
      b,
      bestI + bestSize,
      aHi,
      bestJ + bestSize,
      bHi,
    );
  }

  return total;
}

/**
 * Compute the similarity ratio between two strings using the
 * Ratcliff/Obershelp algorithm, matching Python's
 * difflib.SequenceMatcher(None, a, b).ratio().
 */
export function sequenceMatcherRatio(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1.0;
  if (a.length === 0 || b.length === 0) return 0.0;

  const matches = countMatchingChars(a, b, 0, a.length, 0, b.length);
  return (2.0 * matches) / (a.length + b.length);
}
