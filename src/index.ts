import { Hono } from "hono";
import api from "./routes/api";
import proxy from "./routes/proxy";
import serve from "./routes/serve";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

app.route("/_proxy", proxy);
app.route("/_api", api);
app.route("/", serve);

export default app;
