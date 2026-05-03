/**
 * Punto de entrada modular: carga la implementación única (`_app.impl.js`) vía
 * re-exportaciones por dominio. El orden de imports no altera el comportamiento
 * (solo controla cuándo se evalúa el módulo de implementación la primera vez).
 */
import "./modules/planning.js";
import "./modules/data.js";
import "./modules/reportes.js";
import "./modules/relaciones.js";
import "./modules/modelo.js";
import "./modules/medidas.js";
import "./modules/dashboard.js";
