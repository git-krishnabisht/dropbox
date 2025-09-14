import http from "http";
import express from "express";
import logger from "./utils/logger.js";

const app = express()
const server = http.createServer(app);
const PORT = 50136;

app.get("/", (_, res) => {
  res.send({ "server" : "running" });
});

server.listen(PORT, () => {
  logger.info("Server is started on PORT: %d", PORT);
});
