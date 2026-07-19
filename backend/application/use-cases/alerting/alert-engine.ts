/**
 * @deprecated La implementación previa mezclaba evaluación y ciclo de vida.
 * Use AlertEvaluator + AlertEvaluationState + IncidentEngine.
 */
export { IncidentEngine as AlertEngine } from './incident-engine.js';
