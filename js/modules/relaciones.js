/**
 * Re-exportaciones agrupadas por dominio.
 * La implementación completa está en ../_app.impl.js (sin cambios de lógica).
 * `appState` es la misma instancia que Planning/Data (`../app-state.js`).
 */
export { appState } from "../app-state.js";
export {
  aplicarSugerencia,
  calcularScore,
  rebuildRelacionesTable,
  extractIntakeCode,
  getDataUniqueList,
  getPlanningGroups,
  initRelacionesModule,
  normalizarTexto,
  normalizeRelacionesPlanningKeys,
  parsePlanningKey,
  planningKeyFromRecord,
  renderRelacionesDataList,
  renderRelacionesEstado,
  renderRelacionesPlanningList,
  renderRelacionesTabla,
  renderSugerencias,
  sugerirRelaciones,
  vincularCampanias,
} from "../_app.impl.js";
