import chokidar from "chokidar";
import path from "path";
import logger from "../utils/logger.util.js";

function startFileWatcher() {
  const clientPath = path.resolve(process.cwd(), "../client");

  logger.info("Starting file watcher", { path: clientPath });

  const watcher = chokidar.watch(clientPath, {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    ignoreInitial: false,
    depth: 10,
    followSymlinks: false,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 100,
    },
  });

  watcher
    .on("add", (path) => {
      // Upload via pre signed url to S3
      logger.info("File added", { path });
    })
    .on("change", (path) => {
      logger.info("File changed", { path });
    })
    .on("unlink", (path) => {
      logger.info("File removed", { path });
    })
    .on("addDir", (path) => {
      logger.info("Directory added", { path });
    })
    .on("unlinkDir", (path) => {
      logger.info("Directory removed", { path });
    })
    .on("error", (error) => {
      logger.error("File watcher error", { error: error });
    })
    .on("ready", () => {
      logger.info("File watcher ready", { watchedPath: clientPath });
    });

  return watcher;
}

export { startFileWatcher };
