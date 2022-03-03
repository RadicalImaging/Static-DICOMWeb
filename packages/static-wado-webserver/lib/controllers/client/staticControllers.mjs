/* eslint-disable import/prefer-default-export */
import express from "express";
import { gzipHeaders } from "../../adapters/responseAdapters.mjs";

export function defaultGetStaticController(staticFilesDir) {
  return express.static(staticFilesDir, {
    index: "index.html",
    setHeaders: gzipHeaders,
    extensions: ["gz"],
    redirect: false,
  });
}
