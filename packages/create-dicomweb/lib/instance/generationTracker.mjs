/** Key of the generation of the studies list (studies/index.json) */
const STUDIES_LIST = Symbol('studies list');

/**
 * Creates an in-memory generation tracker. A generation is a value that changes each
 * time that new data for a study is stored. A build reads the generation before it
 * reads any data, and commits its files only when the generation did not change.
 *
 * Both operations are synchronous, so a caller can change the generation and delete
 * the derived files with no other work between them. A different tracker (for example
 * one that keeps the generations in shared storage) must keep the same interface.
 *
 * @returns {{current: (studyUID: string|null) => number, advance: (studyUID: string|null) => number}}
 *   `studyUID` null means the studies list.
 */
export function createGenerationTracker() {
  const generations = new Map();

  return {
    current(studyUID) {
      return generations.get(studyUID ?? STUDIES_LIST) ?? 0;
    },
    advance(studyUID) {
      const key = studyUID ?? STUDIES_LIST;
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
