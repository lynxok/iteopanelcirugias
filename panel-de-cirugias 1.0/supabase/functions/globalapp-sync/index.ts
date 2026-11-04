import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const API_BASE = "https://api.er.globalapp.ar/api";
const GLOBALAPP_EMAIL = Deno.env.get("GLOBALAPP_USER") || "quirofano@correo.com";
const GLOBALAPP_PASSWORD = Deno.env.get("GLOBALAPP_PASSWORD") || "12345678";

// Standard Chrome browser headers to match legitimate web client traffic
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
  "Origin": "https://er.globalapp.ar",
  "Referer": "https://er.globalapp.ar/",
};

// In-memory cache across warm Edge Function invocations to avoid repeated logins
let cachedCookie: string | null = null;
let cachedCookieTimestamp = 0;
const COOKIE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

let cachedPatologias: Array<{ id: number; patologia: string }> | null = null;
let cachedPatologiasTimestamp = 0;
const PATOLOGIAS_TTL_MS = 30 * 60 * 1000; // 30 minutes

let cachedProfesionales: Array<any> | null = null;
let cachedProfesionalesTimestamp = 0;
const PROFESIONALES_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface SyncPayload {
  surgeryId: string;
  action: "start" | "finish" | "sync";
  patientDni: string;
  patientName: string;
  surgeryDate: string; // YYYY-MM-DD
  startTime: string;   // HH:mm
  endTime: string;     // HH:mm
  orName: string;
  specialty: string;
  isAmbulatory: boolean;
  anesthesiaType: string;
  doctorName: string;
  doctorLicense?: string;
  anesthetistName?: string;
  anesthetistLicense?: string;
  ayudante1Name?: string;
  ayudante1License?: string;
  ayudante2Name?: string;
  ayudante2License?: string;
  anatomiaPatologica?: string;
}

function cleanText(text: string): string {
  return (text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(dr\.?|dra\.?|lic\.?|med\.?|enf\.?)\b/gi, "")
    .replace(/[,.;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function mapAnesthesia(anesthesiaType: string): string {
  const val = cleanText(anesthesiaType);
  if (val.includes("LOCAL")) return "Local";
  if (val.includes("RAQUIDEA")) return "\x52\x61\x71\x75\u00ed\x64\x65\x61"; // Raquídea
  if (val.includes("PERIDURAL")) return "Peridural";
  if (val.includes("SEDACION")) return "Sedaci\u00f3n";
  if (val.includes("REGIONAL") || val.includes("PLEXO") || val.includes("BLOQUEO")) return "Regional";
  if (val.includes("SIN ANESTESIA") || val === "NO" || val === "NINGUNA") return "Sin Anestesia";
  return "General";
}

async function resolvePatologiaId(cookie: string, specialty: string): Promise<number> {
  const val = cleanText(specialty);

  // 1. Fetch live patologias from Globalapp (with 30-min cache) so any newly added patologia in Globalapp works automatically
  try {
    const now = Date.now();
    if (!cachedPatologias || now - cachedPatologiasTimestamp > PATOLOGIAS_TTL_MS) {
      const resp = await fetch(`${API_BASE}/internaciones/patologia/get-all`, {
        headers: { ...BROWSER_HEADERS, Cookie: cookie },
      });
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data?.rows) && data.rows.length > 0) {
          cachedPatologias = data.rows;
          cachedPatologiasTimestamp = now;
        }
      }
    }

    if (cachedPatologias && val) {
      // Exact or substring match
      for (const row of cachedPatologias) {
        const rowClean = cleanText(row.patologia || "");
        if (rowClean && (rowClean === val || rowClean.includes(val) || val.includes(rowClean))) {
          return Number(row.id);
        }
      }
      // Keyword match (e.g. NEURO -> NEUROLOGIA)
      for (const row of cachedPatologias) {
        const rowClean = cleanText(row.patologia || "");
        if (val.includes("NEURO") && rowClean.includes("NEURO")) return Number(row.id);
        if (val.includes("MAXILO") && rowClean.includes("MAXILO")) return Number(row.id);
        if (val.includes("TRAUMA") && rowClean.includes("TRAUMA")) return Number(row.id);
      }
    }
  } catch (err) {
    console.warn("[globalapp-sync] Fallback en resolvePatologiaId:", err);
  }

  // 2. Static fallback using verified Globalapp IDs (idcliente 8)
  if (val.includes("NEURO")) return 498; // NEUROLOGÍA
  if (val.includes("MAXILO") || val.includes("CABEZA")) return 499; // MAXILOFACIAL
  return 15; // TRAUMATOLOGIA (default)
}

function hasAnatomiaPatologica(value?: string): boolean {
  if (!value) return false;
  const val = cleanText(value);
  if (!val) return false;
  const negativeValues = new Set([
    "NO",
    "NO SE ENVIO",
    "NO SE ENVIA",
    "NINGUNA",
    "NINGUNO",
    "N/A",
    "NA",
    "-",
    "SIN MUESTRA",
    "SIN MUESTRAS",
    "FALSE",
    "0",
  ]);
  return !negativeValues.has(val);
}

// Convert Argentina local date "YYYY-MM-DD" and time "HH:mm" (UTC-3) to UTC ISO string
function toArgentinaUtcIso(dateStr: string, timeStr: string): string {
  const cleanDate = (dateStr || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const cleanTime = (timeStr || "08:00").slice(0, 5);
  const dt = new Date(`${cleanDate}T${cleanTime}:00-03:00`);
  if (isNaN(dt.getTime())) {
    return new Date().toISOString();
  }
  return dt.toISOString();
}

async function loginGlobalapp(forceRefresh = false): Promise<string> {
  const now = Date.now();
  if (!forceRefresh && cachedCookie && now - cachedCookieTimestamp < COOKIE_TTL_MS) {
    return cachedCookie;
  }

  const resp = await fetch(`${API_BASE}/usuarios/login-user`, {
    method: "POST",
    headers: {
      ...BROWSER_HEADERS,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: GLOBALAPP_EMAIL,
      password: GLOBALAPP_PASSWORD,
      gethash: true,
      token: "",
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Error login Globalapp (${resp.status}): ${errText}`);
  }

  const setCookie = resp.headers.get("set-cookie") || "";
  const match = setCookie.match(/token=([^;]+)/);
  if (match && match[1]) {
    cachedCookie = `token=${match[1]}`;
    cachedCookieTimestamp = now;
    return cachedCookie;
  }

  const data = await resp.json().catch(() => ({}));
  if (data?.token) {
    cachedCookie = `token=${data.token}`;
    cachedCookieTimestamp = now;
    return cachedCookie;
  }
  throw new Error("No se recibió cookie token de Globalapp.");
}

async function findPatient(cookie: string, dni: string, name: string): Promise<any | null> {
  const cleanDni = (dni || "").replace(/\D/g, "").trim();

  // 1. Search by DNI first (strict priority)
  if (cleanDni) {
    const filters = JSON.stringify({
      orarr: [[{ numerodocumento: { ilike: `%${cleanDni}%` } }]],
    });
    const url = `${API_BASE}/pacientes/get-all-pacientes?pageSize=20&filters=${encodeURIComponent(filters)}`;
    const resp = await fetch(url, { headers: { ...BROWSER_HEADERS, Cookie: cookie } });
    if (resp.ok) {
      const data = await resp.json();
      const rows = data?.pacientes?.rows || [];
      const exact = rows.find((r: any) => String(r.numerodocumento).replace(/\D/g, "") === cleanDni);
      if (exact) return exact;
      if (rows.length > 0) return rows[0];
    }
  }

  // 2. Fallback by Name if DNI not found
  const cleanName = cleanText(name);
  if (cleanName) {
    const tokens = cleanName.split(" ").filter((t) => t.length >= 2);
    const orGroup = tokens.map((t) => ({ nombre: { ilike: `%${t}%` } }));
    const filters = JSON.stringify({ orarr: [orGroup] });
    const url = `${API_BASE}/pacientes/get-all-pacientes?pageSize=20&filters=${encodeURIComponent(filters)}`;
    const resp = await fetch(url, { headers: { ...BROWSER_HEADERS, Cookie: cookie } });
    if (resp.ok) {
      const data = await resp.json();
      const rows = data?.pacientes?.rows || [];
      if (rows.length > 0) return rows[0];
    }
  }

  return null;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

async function getAllProfesionales(cookie: string): Promise<Array<any>> {
  const now = Date.now();
  if (cachedProfesionales && now - cachedProfesionalesTimestamp < PROFESIONALES_TTL_MS) {
    return cachedProfesionales;
  }
  const resp = await fetch(`${API_BASE}/profesionales/get-all?pageSize=500`, {
    headers: { ...BROWSER_HEADERS, Cookie: cookie },
  });
  if (resp.ok) {
    const rows = await resp.json();
    if (Array.isArray(rows) && rows.length > 0) {
      cachedProfesionales = rows;
      cachedProfesionalesTimestamp = now;
      return rows;
    }
  }
  return cachedProfesionales || [];
}

async function findProfessional(cookie: string, name?: string, license?: string): Promise<any | null> {
  const cleanLic = (license || "").replace(/\D/g, "").trim();
  const cleanedName = cleanText(name || "");
  if (!cleanLic && !cleanedName) return null;

  const allProfs = await getAllProfesionales(cookie);

  // 1. Exact license match (highest confidence)
  if (cleanLic && allProfs.length > 0) {
    const exactLic = allProfs.find((r: any) => String(r.matricula || "").replace(/\D/g, "") === cleanLic);
    if (exactLic) return exactLic;
  }

  // 2. Strict Surname + Given Name token matching
  // Never match a professional who only shares a given name (e.g., "AMATO Daniel" must NEVER match "SOLANAS LUIS DANIEL")
  if (cleanedName && allProfs.length > 0) {
    const inputTokens = cleanedName.split(" ").filter((t) => t.length >= 2);
    if (inputTokens.length === 0) return null;

    let bestCandidate: any = null;
    let bestScore = 0;

    for (const r of allProfs) {
      const gName = cleanText(r.nombre || "");
      const gTokens = gName.split(" ").filter((t) => t.length >= 2);
      if (gTokens.length === 0) continue;

      // Globalapp stores names as "SURNAME [SURNAME2] GIVEN1 [GIVEN2]" so gTokens[0] is always the primary surname in Globalapp.
      const gPrimarySurname = gTokens[0];

      // Check if any token in inputTokens matches Globalapp's primary surname (exact or 1-char typo for >=5 chars like CARNGEL/CARGNEL or DEGANUTI/DEGANUTTI)
      let surnameMatched = false;
      let matchedInputIdx = -1;

      for (let i = 0; i < inputTokens.length; i++) {
        const tok = inputTokens[i];
        if (tok === gPrimarySurname || (tok.length >= 5 && gPrimarySurname.length >= 5 && levenshtein(tok, gPrimarySurname) <= 1)) {
          surnameMatched = true;
          matchedInputIdx = i;
          break;
        }
      }

      if (!surnameMatched) continue;

      // Now check remaining input tokens (given names / second surnames)
      const remainingInput = inputTokens.filter((_, idx) => idx !== matchedInputIdx);
      const remainingGlobal = gTokens.slice(1);

      let givenMatches = 0;
      for (const remTok of remainingInput) {
        if (remainingGlobal.some((gt) => gt === remTok || (remTok.length >= 5 && gt.length >= 5 && levenshtein(remTok, gt) <= 1))) {
          givenMatches++;
        }
      }

      // If input has a given name AND there are multiple people with the same surname in Globalapp (e.g. RIOS GERMAN vs RIOS VALENTINA, BARBERO CARLOS vs BARBERO LUCIANO),
      // require at least 1 given name match!
      if (remainingInput.length > 0 && givenMatches === 0) {
        continue;
      }

      const score = 100 + givenMatches * 25;
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = r;
      }
    }

    if (bestCandidate) return bestCandidate;
  }

  return null;
}

async function findExistingParte(cookie: string, idpaciente: number, surgeryDate: string): Promise<any | null> {
  const cleanDate = (surgeryDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const startIso = `${cleanDate}T00:00:00.000Z`;
  const endIso = `${cleanDate}T23:59:59.999Z`;

  const filters = JSON.stringify({
    idpaciente,
    inicio: { between: [startIso, endIso] },
  });
  const includes = JSON.stringify([
    { model: "quirofano" },
    { model: "paciente" },
    { model: "internacionesPatologia" },
    { model: "cobertura" },
    { model: "internaciones" },
    { model: "turno" },
    { model: "medico" },
  ]);

  const url =
    `${API_BASE}/parte-quirurgico/get-all?sinPrestaciones=false&count=true&order=${encodeURIComponent('[["inicio","DESC"]]')}` +
    `&filters=${encodeURIComponent(filters)}&includes=${encodeURIComponent(includes)}&pageSize=20&page=1`;

  const resp = await fetch(url, { headers: { ...BROWSER_HEADERS, Cookie: cookie } });
  if (!resp.ok) return null;
  const data = await resp.json();
  const rows = data?.rows || [];
  return rows.length > 0 ? rows[0] : null;
}

async function getNextNumeroParte(cookie: string): Promise<number> {
  const resp = await fetch(`${API_BASE}/parte-quirurgico/last-number`, {
    headers: { ...BROWSER_HEADERS, Cookie: cookie },
  });
  if (!resp.ok) return 1;
  const data = await resp.json();
  return Number(data?.numero_parte || 1);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload: SyncPayload = await req.json();

    if (!payload.patientDni && !payload.patientName) {
      return new Response(
        JSON.stringify({ success: false, error: "Falta DNI y nombre del paciente." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Login to Globalapp API (reuses cached session token when warm)
    let cookie = await loginGlobalapp(false);

    // 2. Find patient by DNI (or name fallback); if 401/expired, refresh login once
    let patient = await findPatient(cookie, payload.patientDni, payload.patientName);
    if (!patient) {
      cookie = await loginGlobalapp(true);
      patient = await findPatient(cookie, payload.patientDni, payload.patientName);
    }

    if (!patient || !patient.id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Paciente no encontrado en Globalapp (DNI: ${payload.patientDni || "S/D"} - ${payload.patientName}).`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Resolve professionals in strict Globalapp order: Espe. -> Anes. -> Ayu. 1 -> Ayu 2
    // REQUIRED: The lead surgeon (Espe.) MUST exist in Globalapp. If not found, abort and return a clear error without saving in Globalapp.
    if (!payload.doctorName && !payload.doctorLicense) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `No se cargó la cirugía en Globalapp: la cirugía no tiene médico especialista asignado.`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const leadSurgeon = await findProfessional(cookie, payload.doctorName, payload.doctorLicense);
    if (!leadSurgeon || !leadSurgeon.id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `No se cargó la cirugía en Globalapp porque el médico "${payload.doctorName || payload.doctorLicense}" no está registrado en el padrón de Globalapp.`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const profesionales: Array<{ id: number; matricula: string; profesional: string; rol: string }> = [
      {
        id: leadSurgeon.id,
        matricula: String(leadSurgeon.matricula || ""),
        profesional: String(leadSurgeon.nombre || ""),
        rol: "Espe.",
      },
    ];

    const roleQueue = [
      { rol: "Anes.", name: payload.anesthetistName, license: payload.anesthetistLicense },
      { rol: "Ayu. 1", name: payload.ayudante1Name, license: payload.ayudante1License },
      { rol: "Ayu 2", name: payload.ayudante2Name, license: payload.ayudante2License },
    ];

    for (const item of roleQueue) {
      if (!item.name && !item.license) continue;
      const prof = await findProfessional(cookie, item.name, item.license);
      if (prof && prof.id) {
        if (!profesionales.some((p) => p.id === prof.id && p.rol === item.rol)) {
          profesionales.push({
            id: prof.id,
            matricula: String(prof.matricula || ""),
            profesional: String(prof.nombre || ""),
            rol: item.rol,
          });
        }
      }
    }

    // 4. Build timestamps and fields (dynamic patologia lookup)
    const inicioIso = toArgentinaUtcIso(payload.surgeryDate, payload.startTime);
    const finIso = toArgentinaUtcIso(payload.surgeryDate, payload.endTime);
    const tipo = payload.isAmbulatory ? "Amb" : "Int";
    const anestesia = mapAnesthesia(payload.anesthesiaType);
    const auxiliares = hasAnatomiaPatologica(payload.anatomiaPatologica) ? ["Anat. Patol\u00f3gica"] : [];
    const idpatologia = await resolvePatologiaId(cookie, payload.specialty);
    const idquirofano = 10; // QUIROFANO

    // 5. Check if surgery already exists in Globalapp for this patient + date
    const existing = await findExistingParte(cookie, patient.id, payload.surgeryDate);

    if (existing && existing.id) {
      let finalProfesionales = profesionales;
      if (payload.action === "start" && Array.isArray(existing.profesionales) && existing.profesionales.length > 0) {
        const existingNonEspe = existing.profesionales.filter((p: any) => p.rol !== "Espe.");
        finalProfesionales = [...profesionales, ...existingNonEspe];
      }

      const updateBody = {
        id: existing.id,
        numero_parte: existing.numero_parte,
        idpaciente: patient.id,
        idcobertura: existing.idcobertura || patient.idcobertura || null,
        idquirofano: existing.idquirofano || idquirofano,
        idpatologia: idpatologia || existing.idpatologia || 15,
        idinternacion: existing.idinternacion ?? null,
        idturno: existing.idturno ?? null,
        inicio: inicioIso,
        fin: finIso,
        tipo,
        anestesia,
        profesionales: finalProfesionales.length > 0 ? finalProfesionales : (existing.profesionales || []),
        auxiliares,
        observaciones: existing.observaciones || "",
      };

      const updateResp = await fetch(`${API_BASE}/parte-quirurgico/update`, {
        method: "PUT",
        headers: {
          ...BROWSER_HEADERS,
          "Content-Type": "application/json",
          Cookie: cookie,
        },
        body: JSON.stringify(updateBody),
      });

      if (!updateResp.ok) {
        const errTxt = await updateResp.text();
        throw new Error(`Error actualizando parte #${existing.id} (${updateResp.status}): ${errTxt}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          mode: "updated",
          parteId: existing.id,
          idpatologia: updateBody.idpatologia,
          patientId: patient.id,
          patientName: patient.nombre,
          profesionales: updateBody.profesionales,
          auxiliares: updateBody.auxiliares,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      const nextNum = await getNextNumeroParte(cookie);
      const createBody = {
        numero_parte: nextNum,
        idpaciente: patient.id,
        idcobertura: patient.idcobertura || null,
        idquirofano,
        idpatologia,
        idinternacion: null,
        idturno: null,
        inicio: inicioIso,
        fin: finIso,
        tipo,
        anestesia,
        profesionales,
        auxiliares,
        observaciones: "",
      };

      const createResp = await fetch(`${API_BASE}/parte-quirurgico/create`, {
        method: "POST",
        headers: {
          ...BROWSER_HEADERS,
          "Content-Type": "application/json",
          Cookie: cookie,
        },
        body: JSON.stringify(createBody),
      });

      if (!createResp.ok) {
        const errTxt = await createResp.text();
        throw new Error(`Error creando parte quirúrgico (${createResp.status}): ${errTxt}`);
      }

      const createdData = await createResp.json().catch(() => ({}));

      return new Response(
        JSON.stringify({
          success: true,
          mode: "created",
          parteId: createdData?.id || createdData?.parte?.id || null,
          numero_parte: nextNum,
          idpatologia,
          patientId: patient.id,
          patientName: patient.nombre,
          profesionales,
          auxiliares,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (err: any) {
    console.error("[globalapp-sync] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message || "Error interno en globalapp-sync" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
