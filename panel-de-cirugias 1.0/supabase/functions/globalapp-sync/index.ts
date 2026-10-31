import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const API_BASE = "https://api.er.globalapp.ar/api";
const GLOBALAPP_EMAIL = Deno.env.get("GLOBALAPP_USER") || "quirofano@correo.com";
const GLOBALAPP_PASSWORD = Deno.env.get("GLOBALAPP_PASSWORD") || "12345678";

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
  if (val.includes("RAQUIDEA")) return "Raquídea";
  if (val.includes("PERIDURAL")) return "Peridural";
  if (val.includes("SEDACION")) return "Sedación";
  if (val.includes("REGIONAL") || val.includes("PLEXO") || val.includes("BLOQUEO")) return "Regional";
  if (val.includes("SIN ANESTESIA") || val === "NO" || val === "NINGUNA") return "Sin Anestesia";
  return "General";
}

function mapPatologiaId(specialty: string): number {
  const val = cleanText(specialty);
  if (val.includes("NEURO")) return 13; // Neurología / Neurocirugía
  if (val.includes("MAXILO") || val.includes("CABEZA")) return 4;
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

async function loginGlobalapp(): Promise<string> {
  const resp = await fetch(`${API_BASE}/usuarios/login-user`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
    return `token=${match[1]}`;
  }

  const data = await resp.json().catch(() => ({}));
  if (data?.token) {
    return `token=${data.token}`;
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
    const resp = await fetch(url, { headers: { Cookie: cookie } });
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
    const resp = await fetch(url, { headers: { Cookie: cookie } });
    if (resp.ok) {
      const data = await resp.json();
      const rows = data?.pacientes?.rows || [];
      if (rows.length > 0) return rows[0];
    }
  }

  return null;
}

async function findProfessional(cookie: string, name?: string, license?: string): Promise<any | null> {
  const cleanLic = (license || "").replace(/\D/g, "").trim();
  const cleanedName = cleanText(name || "");
  if (!cleanLic && !cleanedName) return null;

  // 1. Try by license number first
  if (cleanLic) {
    const filters = JSON.stringify({
      orarr: [[{ matricula: { ilike: `%${cleanLic}%` } }, { nombre: { ilike: `%${cleanLic}%` } }]],
    });
    const url = `${API_BASE}/profesionales/get-all?pageSize=20&filters=${encodeURIComponent(filters)}`;
    const resp = await fetch(url, { headers: { Cookie: cookie } });
    if (resp.ok) {
      const rows = await resp.json();
      if (Array.isArray(rows) && rows.length > 0) {
        const exact = rows.find((r: any) => String(r.matricula).replace(/\D/g, "") === cleanLic);
        return exact || rows[0];
      }
    }
  }

  // 2. Try by name tokens
  if (cleanedName) {
    const tokens = cleanedName.split(" ").filter((t) => t.length >= 3);
    // Search by first surname/token with largest length or first token
    const searchTokens = tokens.length > 0 ? tokens : [cleanedName];
    for (const token of searchTokens) {
      const filters = JSON.stringify({
        orarr: [[{ matricula: { ilike: `%${token}%` } }, { nombre: { ilike: `%${token}%` } }]],
      });
      const url = `${API_BASE}/profesionales/get-all?pageSize=30&filters=${encodeURIComponent(filters)}`;
      const resp = await fetch(url, { headers: { Cookie: cookie } });
      if (resp.ok) {
        const rows = await resp.json();
        if (Array.isArray(rows) && rows.length > 0) {
          // Score candidates by how many tokens from cleanedName match r.nombre
          let bestRow = rows[0];
          let bestScore = -1;
          for (const r of rows) {
            const rName = cleanText(r.nombre || "");
            let score = 0;
            for (const tk of searchTokens) {
              if (rName.includes(tk)) score += 1;
            }
            if (score > bestScore) {
              bestScore = score;
              bestRow = r;
            }
          }
          if (bestScore > 0) return bestRow;
        }
      }
    }
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

  const resp = await fetch(url, { headers: { Cookie: cookie } });
  if (!resp.ok) return null;
  const data = await resp.json();
  const rows = data?.rows || [];
  return rows.length > 0 ? rows[0] : null;
}

async function getNextNumeroParte(cookie: string): Promise<number> {
  const resp = await fetch(`${API_BASE}/parte-quirurgico/last-number`, {
    headers: { Cookie: cookie },
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

    // 1. Login to Globalapp API
    const cookie = await loginGlobalapp();

    // 2. Find patient by DNI (or name fallback)
    const patient = await findPatient(cookie, payload.patientDni, payload.patientName);
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
    const profesionales: Array<{ id: number; matricula: string; profesional: string; rol: string }> = [];

    const roleQueue = [
      { rol: "Espe.", name: payload.doctorName, license: payload.doctorLicense },
      { rol: "Anes.", name: payload.anesthetistName, license: payload.anesthetistLicense },
      { rol: "Ayu. 1", name: payload.ayudante1Name, license: payload.ayudante1License },
      { rol: "Ayu 2", name: payload.ayudante2Name, license: payload.ayudante2License },
    ];

    for (const item of roleQueue) {
      if (!item.name && !item.license) continue;
      const prof = await findProfessional(cookie, item.name, item.license);
      if (prof && prof.id) {
        // Avoid duplicate professional ID with same role
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

    // 4. Build timestamps and fields
    const inicioIso = toArgentinaUtcIso(payload.surgeryDate, payload.startTime);
    const finIso = toArgentinaUtcIso(payload.surgeryDate, payload.endTime);
    const tipo = payload.isAmbulatory ? "Amb" : "Int";
    const anestesia = mapAnesthesia(payload.anesthesiaType);
    const auxiliares = hasAnatomiaPatologica(payload.anatomiaPatologica) ? ["Anat. Patológica"] : [];
    const idpatologia = mapPatologiaId(payload.specialty);
    const idquirofano = 10; // QUIROFANO

    // 5. Check if surgery already exists in Globalapp for this patient + date
    const existing = await findExistingParte(cookie, patient.id, payload.surgeryDate);

    if (existing && existing.id) {
      // Merge existing professionals if our payload didn't include some (e.g., on 'start' we only have Espe.)
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
        idpatologia: existing.idpatologia || idpatologia,
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
          patientId: patient.id,
          patientName: patient.nombre,
          profesionales: updateBody.profesionales,
          auxiliares: updateBody.auxiliares,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // Create new Parte Quirúrgico
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

