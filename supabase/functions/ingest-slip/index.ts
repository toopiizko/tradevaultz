// Accepts a slip image from iOS Shortcut (or curl) using a personal Bearer token.
// Flow: validate token -> read image (multipart/form-data OR raw body) -> compress not done here
// -> call Lovable AI to parse -> insert expense row -> upload original to storage -> attach url.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM = `You are a bank transfer slip / receipt parser specialized in Thai banks (SCB, KBank, BBL, Krungsri, TTB, GSB, KTB, TrueMoney, PromptPay) and generic receipts.
Return one slip per image.`;

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function readImage(req: Request): Promise<{ bytes: Uint8Array; type: string; name: string } | null> {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    // Try common field names: "files", "file", "image", "photo"
    for (const key of ["files", "file", "image", "photo"]) {
      const v = form.get(key);
      if (v && v instanceof File && v.size > 0) {
        return { bytes: new Uint8Array(await v.arrayBuffer()), type: v.type || "image/jpeg", name: v.name || "slip.jpg" };
      }
    }
    // Fallback: first file-like entry
    for (const [, v] of form.entries()) {
      if (v instanceof File && v.size > 0) {
        return { bytes: new Uint8Array(await v.arrayBuffer()), type: v.type || "image/jpeg", name: v.name || "slip.jpg" };
      }
    }
    return null;
  }
  if (ct.startsWith("image/")) {
    const buf = new Uint8Array(await req.arrayBuffer());
    return buf.length ? { bytes: buf, type: ct, name: "slip.jpg" } : null;
  }
  if (ct.includes("application/json")) {
    const j = await req.json().catch(() => null) as any;
    const dataUrl: string | undefined = j?.image || j?.image_base64 || j?.data;
    if (!dataUrl) return null;
    const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(dataUrl);
    let mime = "image/jpeg"; let b64 = dataUrl;
    if (m) { mime = m[1]; b64 = m[2]; }
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return { bytes: bin, type: mime, name: "slip.jpg" };
  }
  return null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  try {
    const auth = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing Bearer token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const tokenHash = await sha256Hex(token);
    const { data: tokRow, error: tokErr } = await admin
      .from("shortcut_tokens")
      .select("id, user_id, wallet_id")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (tokErr || !tokRow) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const img = await readImage(req);
    if (!img) {
      return new Response(JSON.stringify({ error: "No image found in request (use multipart field 'files' or raw image body)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Call Lovable AI
    const dataUrl = `data:${img.type};base64,${bytesToBase64(img.bytes)}`;
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: [
            { type: "text", text: "Extract this slip. Currency hint: THB." },
            { type: "image_url", image_url: { url: dataUrl } },
          ]},
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_slip",
            description: "Return parsed slip",
            parameters: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["income", "expense"] },
                amount: { type: "number" },
                currency: { type: "string" },
                expense_date: { type: "string" },
                merchant: { type: "string" },
                description: { type: "string" },
                suggested_category: { type: "string" },
                confidence: { type: "number" },
              },
              required: ["type", "amount", "currency", "expense_date", "merchant", "description", "suggested_category", "confidence"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_slip" } },
      }),
    });
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI parse failed", status: aiResp.status }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const aiJson = await aiResp.json();
    const args = aiJson?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const slip = args ? JSON.parse(args) : null;
    if (!slip) {
      return new Response(JSON.stringify({ error: "Could not parse slip" }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Currency: store amount in USD if currency is THB, using a fixed 35 rate fallback.
    // Better: fetch user's preferred currency from settings; for now, store raw amount as-is in same currency as the user's wallet base.
    const amount = Number(slip.amount) || 0;

    const { data: inserted, error: insErr } = await admin.from("expenses").insert({
      user_id: tokRow.user_id,
      type: slip.type,
      amount: amount,
      category: slip.suggested_category || "Other",
      description: slip.description || slip.merchant || null,
      expense_date: new Date(slip.expense_date || Date.now()).toISOString(),
      ...(tokRow.wallet_id ? { wallet_id: tokRow.wallet_id } : {}),
    }).select("id").single();
    if (insErr || !inserted) {
      console.error("insert error", insErr);
      return new Response(JSON.stringify({ error: "DB insert failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Upload original image
    const ext = (img.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const key = `${tokRow.user_id}/expense/${inserted.id}/${Date.now()}-slip.${ext}`;
    const up = await admin.storage.from("transaction-images").upload(key, img.bytes, { contentType: img.type, upsert: false });
    if (!up.error) {
      await admin.from("expenses").update({ image_urls: [key] }).eq("id", inserted.id);
    }

    await admin.from("shortcut_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tokRow.id);

    return new Response(JSON.stringify({ ok: true, id: inserted.id, slip }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ingest-slip error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
