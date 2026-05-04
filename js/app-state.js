/**
 * Estado central: Planning y Data general viven en `dataDraft`.
 * El resto del bundle sigue en `_app.impl.js` / appMemoryKV.
 */

export const appState = {
  dataOriginal: {},
  dataDraft: {},
  pendingChanges: 0
};

function apiOrigin() {
  if (typeof window !== "undefined" && window.CAMPATRACK_API_ORIGIN) {
    return String(window.CAMPATRACK_API_ORIGIN).replace(/\/$/, "");
  }
  return "http://localhost:3000";
}

/** Garantiza `{ records: [], recordIdSeq: 1 }` en `dataDraft.planning`. */
export function ensurePlanningDraftShape() {
  if (!appState.dataDraft || typeof appState.dataDraft !== "object") appState.dataDraft = {};
  let p = appState.dataDraft.planning;
  if (!p || typeof p !== "object") {
    p = { records: [], recordIdSeq: 1 };
    appState.dataDraft.planning = p;
  }
  if (!Array.isArray(p.records)) p.records = [];
  if (!Number.isFinite(Number(p.recordIdSeq)) || Number(p.recordIdSeq) < 1) p.recordIdSeq = 1;
  return p;
}

/** Filas DATA → General (todas las equipos con `teamId`); misma idea que `planning.records`. */
export function ensureDataGeneralDraftShape() {
  if (!appState.dataDraft || typeof appState.dataDraft !== "object") appState.dataDraft = {};
  if (!Array.isArray(appState.dataDraft.data_general)) appState.dataDraft.data_general = [];
  return appState.dataDraft.data_general;
}

export function getPlanningRecordIdSeq() {
  return ensurePlanningDraftShape().recordIdSeq;
}

export function setPlanningRecordIdSeq(n) {
  const p = ensurePlanningDraftShape();
  p.recordIdSeq = Math.max(1, Math.round(Number(n)) || 1);
}

export function bumpAppStatePendingChanges() {
  appState.pendingChanges += 1;
}

export function resetAppStatePendingChanges() {
  appState.pendingChanges = 0;
}

function normalizePlanningSliceFromBundle(planningData) {
  if (!planningData || typeof planningData !== "object") return { records: [], recordIdSeq: 1 };
  if (Array.isArray(planningData)) return { records: planningData.slice(), recordIdSeq: 1 };
  const recs = Array.isArray(planningData.records) ? planningData.records : [];
  const seq = Number.isFinite(Number(planningData.recordIdSeq))
    ? Math.max(1, Math.round(Number(planningData.recordIdSeq)))
    : 1;
  return { records: recs, recordIdSeq: seq };
}

/**
 * Carga el bundle desde GET /api/data y rellena `dataOriginal` / `dataDraft`.
 * Solo normaliza y aplica la porción Planning en `dataDraft.planning` (el resto lo sigue manejando el impl vía KV).
 */
/**
 * Rellena `dataOriginal` / `dataDraft` y la porción Planning a partir de un bundle ya parseado (p. ej. tras GET /api/data).
 * No toca appMemoryKV: eso sigue haciendo `_app.impl.js`.
 */
export function hydrateAppStateDraftFromApiBundle(bundle) {
  if (bundle == null || typeof bundle !== "object" || Array.isArray(bundle)) return;
  const cloneOrig =
    typeof structuredClone === "function" ? structuredClone(bundle) : JSON.parse(JSON.stringify(bundle));
  const cloneDraft =
    typeof structuredClone === "function" ? structuredClone(bundle) : JSON.parse(JSON.stringify(bundle));
  appState.dataOriginal = cloneOrig;
  if (!appState.dataDraft || typeof appState.dataDraft !== "object") appState.dataDraft = {};
  for (const key of Object.keys(cloneDraft)) {
    if (key === "planning_data" || key === "planning" || key === "data_general") continue;
    appState.dataDraft[key] = cloneDraft[key];
  }
  const slice = normalizePlanningSliceFromBundle(bundle.planning_data);
  const p = ensurePlanningDraftShape();
  p.records.length = 0;
  slice.records.forEach((r) => p.records.push(r && typeof r === "object" ? { ...r } : r));
  setPlanningRecordIdSeq(slice.recordIdSeq);
  try {
    if (typeof globalThis.__campatrackSyncPlanningAfterHydrate === "function") {
      globalThis.__campatrackSyncPlanningAfterHydrate();
    }
  } catch (_) {
    /* ignore */
  }
  ensureDataGeneralDraftShape();
  try {
    if (typeof globalThis.__campatrackHydrateDataGeneralFromBundle === "function") {
      globalThis.__campatrackHydrateDataGeneralFromBundle(bundle);
    }
  } catch (_) {
    /* ignore */
  }
}

export async function initAppState(options = {}) {
  const prefetched = options.prefetchedBundle;
  if (prefetched != null && typeof prefetched === "object" && !Array.isArray(prefetched)) {
    hydrateAppStateDraftFromApiBundle(prefetched);
    return;
  }
  const userId = options.userId != null ? String(options.userId).trim() : "";
  if (!userId) {
    console.warn("initAppState: falta userId");
    return;
  }
  const res = await fetch(`${apiOrigin()}/api/data?user_id=${encodeURIComponent(userId)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const row = await res.json();
  if (!row || typeof row !== "object" || row.data == null) {
    appState.dataOriginal = {};
    appState.dataDraft = {};
    ensurePlanningDraftShape();
    ensureDataGeneralDraftShape();
    return;
  }
  let bundle = row.data;
  if (typeof bundle === "string") {
    try {
      bundle = JSON.parse(bundle);
    } catch (e) {
      console.error("Error parseando data:", e);
      throw new Error("Respuesta API: data no es JSON válido");
    }
  }
  if (bundle == null || typeof bundle !== "object" || Array.isArray(bundle)) {
    throw new Error("Respuesta API: data no es un objeto");
  }
  console.log("Bundle final:", bundle);
  hydrateAppStateDraftFromApiBundle(bundle);
}

/**
 * Tras publicar con éxito: `dataOriginal` refleja el borrador actual (piloto: incluye `planning` + claves del bundle).
 * También escribe `planning_data` en copia profunda para alinear con el contrato API.
 */
export function applyPlanningOriginalFromDraft() {
  if (!appState.dataDraft || typeof appState.dataDraft !== "object") {
    resetAppStatePendingChanges();
    return;
  }
  appState.dataOriginal =
    typeof structuredClone === "function"
      ? structuredClone(appState.dataDraft)
      : JSON.parse(JSON.stringify(appState.dataDraft));
  const p = ensurePlanningDraftShape();
  appState.dataOriginal.planning_data = {
    records: p.records.map((r) => (r && typeof r === "object" ? { ...r } : r)),
    recordIdSeq: p.recordIdSeq
  };
  resetAppStatePendingChanges();
}
