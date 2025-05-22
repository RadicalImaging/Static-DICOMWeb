import MurmurHash3 from "imurmurhash";

export default function getStudyUIDPathAndSubPath(studyUID) {
  const hash = new MurmurHash3(studyUID).result().toString(16).padStart(6, "0");
  const path = hash.substring(0, 3);
  const subpath = hash.substring(3, 6);

  return { path, subpath };
}
