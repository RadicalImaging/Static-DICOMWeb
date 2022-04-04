/* eslint-disable import/prefer-default-export */
import express from "express";
import { gzipHeaders } from "../../adapters/responseAdapters.mjs";

export function indexingStaticController(staticFilesDir) {
  return express.static(staticFilesDir, {
    index: "index.json.gz",
    setHeaders: gzipHeaders,
    extensions: ["gz"],
    redirect: false,
    fallthrough: true,
  });
}

export function nonIndexingStaticController(staticFilesDir) {
  return express.static(staticFilesDir, {
    index: false,
    redirect: false,
    fallthrough: true,
  });
}
