// Stand-in for Supabase's REST API during tests: forwards /rest/v1/rpc/pl_pull|pl_push
// to a real Postgres (running sync/supabase-setup.sql) as the public "anon" role.
// Needs: psql on PATH and PG* environment variables (PGHOST, PGPORT, PGUSER, PGPASSWORD).
const http = require("http");
const { execFile } = require("child_process");

const API_KEY = "sb_publishable_test";
let down = false;

function psql(sql, vars) {
  const args = ["-qAt", "-v", "ON_ERROR_STOP=1"];
  for (const [k, v] of Object.entries(vars)) args.push("-v", `${k}=${v}`);
  return new Promise((resolve, reject) => {
    const child = execFile("psql", args, { maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) =>
      err ? reject(new Error((stderr || err.message).split("\n")[0])) : resolve(stdout));
    child.stdin.end(sql);
  });
}

function start(port) {
  const server = http.createServer(async (req, res) => {
    const reply = (code, obj) => {
      res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "apikey, authorization, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" });
      res.end(obj === undefined ? "" : JSON.stringify(obj));
    };
    if (req.method === "OPTIONS") return reply(204);
    if (down) return reply(503, { message: "down" });
    if (req.headers.apikey !== API_KEY) return reply(401, { message: "Invalid API key" });
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const b = JSON.parse(body);
      if (req.url === "/rest/v1/rpc/pl_pull") {
        const out = await psql("set role anon; select coalesce(json_agg(t), '[]') from pl_pull(:'l', :s) t;", { l: b.p_ledger, s: String(Math.trunc(b.p_since)) });
        return reply(200, JSON.parse(out));
      }
      if (req.url === "/rest/v1/rpc/pl_push") {
        const out = await psql("set role anon; select pl_push(:'l', :'r'::jsonb);", { l: b.p_ledger, r: JSON.stringify(b.p_rows) });
        return reply(200, JSON.parse(out));
      }
      reply(404, { message: "not found" });
    } catch (e) {
      reply(400, { message: e.message });
    }
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

module.exports = { start, API_KEY, setDown: (v) => { down = v; }, psql };
