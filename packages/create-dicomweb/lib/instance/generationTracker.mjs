/**
 * Key of the generation of one series. The key of the generation of a study is its UID.
 * @param {string} studyUID
 * @param {string} seriesUID
 * @returns {string}
 */
export function seriesGenerationKey(studyUID, seriesUID) {
  return `${studyUID}/${seriesUID}`;
}

/**
 * Creates an in-memory generation tracker. A generation is a value that changes each
 * time that new data is stored. A study and each series have their own generation: an
 * upload changes the generation of its series and of its study, so a build of a different
 * series of the same study can still commit. A build reads the generation of its level
 * before it reads any data, and commits its files only when that generation did not change.
 * The studies list (studies/index.json) is a best-effort helper, and has no generation.
 *
 * Both operations are synchronous, so a caller can change the generation and delete
 * the derived files with no other work between them. A different tracker (for example
 * one that keeps the generations in shared storage) must keep the same interface.
 *
 * @returns {{current: (key: string) => number, advance: (key: string) => number}} - The key
 *   is a study UID, or seriesGenerationKey(studyUID, seriesUID)
 */
export function createGenerationTracker() {
  const generations = new Map();

  return {
    current(key) {
      return generations.get(key) ?? 0;
    },
    advance(key) {
      const next = (generations.get(key) ?? 0) + 1;
      generations.set(key, next);
      return next;
    },
  };
}

/**
 * The generation tracker of this process. The upload path and the builds must use this
 * one instance, so that a build sees each change that an upload makes.
 */
export const generationTracker = createGenerationTracker();
