export const cfg = {
  runtime: "edge",
};

const BASE_TGT = (process.env.MY_DOMAIN || "").replace(/\/$/, "");

const STRIP_H = new Set([
  "host","connection","keep-alive","proxy-authenticate","proxy-authorization",
  "te","trailer","transfer-encoding","upgrade","forwarded",
  "x-forwarded-host","x-forwarded-proto","x-forwarded-port",
]);

export default async function pxHandler(r) {
  if (!BASE_TGT) {
    return new Response("Misconfigured: MY_DOMAIN is not set", { status: 500 });
  }

  try {
    const u = new URL(r.url);
    const tUrl = BASE_TGT + u.pathname + u.search;

    const hdrs = new Headers();
    let cIp = null;
    for (const [k, v] of r.headers) {
      const keyL = k.toLowerCase();
      if (STRIP_H.has(keyL)) continue;
      if (keyL.startsWith("x-vercel-")) continue;
      if (keyL === "x-real-ip") { cIp = v; continue; }
      if (keyL === "x-forwarded-for") { if (!cIp) cIp = v; continue; }
      hdrs.set(keyL, v);
    }
    if (cIp) hdrs.set("x-forwarded-for", cIp);

    const m = r.method;
    const hasB = m !== "GET" && m !== "HEAD";

    const opts = { method: m, headers: hdrs, redirect: "manual" };
    if (hasB) { opts.body = r.body; opts.duplex = "half"; }

    const up = await fetch(tUrl, opts);

    const respHdrs = new Headers();
    for (const [k, v] of up.headers) {
      if (k.toLowerCase() === "transfer-encoding") continue;
      respHdrs.set(k, v);
    }

    return new Response(up.body, { status: up.status, headers: respHdrs });
  } catch (e) {
    return new Response("Bad Gateway: Tunnel Failed", { status: 502 });
  }
}