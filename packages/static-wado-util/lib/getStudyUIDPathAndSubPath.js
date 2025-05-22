import MurmurHash3 from "imurmurhash";

export default function getStudyUIDPathAndSubPath(studyUID) {
  const hash = new MurmurHash3(studyUID).result().toString(16).padStart(8, "0");
  const path = hash.substring(0, 4);
  const subpath = hash.substring(4, 8);

  return { path, subpath };
}
