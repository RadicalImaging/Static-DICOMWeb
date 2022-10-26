/* eslint-disable import/prefer-default-export */
import express from "express";
import { gzipHeaders } from "../../adapters/responseAdapters.mjs";

export function indexingStaticController(staticFilesDir) {
  return express.static(staticFilesDir, {
    index: "index.json.gz",
    setHeaders: gzipHeaders,
    extensions: ["gz"],
    maxAge: 3000,
    etag: false,
    redirect: false,
    fallthrough: true,
  });
}

export function nonIndexingStaticController(staticFilesDir) {
  return express.static(staticFilesDir, {
    index: false,
    etag: false,
    maxAge: 3500,
    redirect: false,
    fallthrough: true,
  });
}
