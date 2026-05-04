/**
 * Re-exportaciones agrupadas por dominio.
 * La implementación completa está en ../_app.impl.js (sin cambios de lógica).
 */
/**
 * Modelo analítico en memoria (`modeloAnalitico`): lo usan Dashboard y Medidas.
 * La pestaña UI «Modelo» se retiró; la generación sigue vía `REGENERAR_MODELO` / planning.
 */
export {
  aplicarFiltros,
  generarModeloAnalitico,
  refreshSegmentadoresValues,
  REGENERAR_MODELO,
  renderModeloTabla,
  uniqueVals,
} from "../_app.impl.js";
