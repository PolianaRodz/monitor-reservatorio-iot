import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const INGEST_TOKEN = Deno.env.get("INGEST_TOKEN");
const ALERT_LEVEL = 20;
const PANEL_PIN = Deno.env.get("PANEL_PIN"); // opcional // % abaixo disso = alerta

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-device-token, x-panel-pin",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  try {
    if (req.method === "POST" && path.endsWith("/command")) {   // painel -> API (controle remoto)
      if (PANEL_PIN && req.headers.get("x-panel-pin") !== PANEL_PIN) return json({ error: "pin invalido" }, 401);
      const c = await req.json();
      const level = Math.max(0, Math.min(100, Number(c.level) || 0));
      const { error } = await supabase.from("control").upsert({ id: 1, manual: !!c.manual, level, updated_at: new Date().toISOString() });
      return error ? json({ error: error.message }, 500) : json({ ok: true, manual: !!c.manual, level });
    }
    if (req.method === "POST") {                       // ESP32 -> API
      if (!INGEST_TOKEN || req.headers.get("x-device-token") !== INGEST_TOKEN) return json({ error: "nao autorizado" }, 401);
      const b = await req.json();
      const value = Number(b.value);
      if (!b.device_id || !b.quantity || !b.unit || !Number.isFinite(value) || value < 0 || value > 100)
        return json({ error: "dados invalidos" }, 400);
      const alert = value < ALERT_LEVEL;
      const { error } = await supabase.from("readings").insert({
        device_id: String(b.device_id).slice(0, 50), quantity: String(b.quantity).slice(0, 50),
        value, unit: String(b.unit).slice(0, 10),
        distance_cm: Number.isFinite(Number(b.distance_cm)) ? Number(b.distance_cm) : null, alert,
        source: b.source === "manual" ? "manual" : "sensor",
      });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, alert }, 201);
    }
    if (req.method === "GET") {                        // painel -> API
      const dev = url.searchParams.get("device_id");
      if (path.endsWith("/command")) {                 // ESP32 e painel leem o comando
        const { data, error } = await supabase.from("control").select("*").eq("id", 1).maybeSingle();
        if (error) return json({ error: error.message }, 500);
        return json(data ?? { manual: false, level: 50 });
      }
      if (path.endsWith("/latest")) {
        let q = supabase.from("readings").select("*").order("created_at", { ascending: false }).limit(1);
        if (dev) q = q.eq("device_id", dev);
        const { data, error } = await q;
        if (error) return json({ error: error.message }, 500);
        return data?.length ? json(data[0]) : json({ error: "sem dados" }, 404);
      }
      if (path.endsWith("/history")) {
        const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 500);
        let q = supabase.from("readings").select("*").order("created_at", { ascending: false }).limit(limit);
        if (dev) q = q.eq("device_id", dev);
        const { data, error } = await q;
        if (error) return json({ error: error.message }, 500);
        return json((data ?? []).reverse());
      }
      return json({ status: "ok", rotas: ["GET /latest", "GET /history?limit=50", "POST /"] });
    }
    return json({ error: "metodo nao permitido" }, 405);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
