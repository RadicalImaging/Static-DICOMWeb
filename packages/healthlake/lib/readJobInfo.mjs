import { JSONReader } from "@radicalimaging/static-wado-util";

/** Reads the job info file from <curieDir>/jobs/<jobName> */
export default function(curieDir, jobName) {
  const jobDir = `${curieDir}/jobs/${jobName}`;
  return JSONReader(jobDir, "info.json", null);
}