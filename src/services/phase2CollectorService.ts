/**
 * Backward-compatible re-export — prefer collectorPipelineService.
 */
export {
  runCollectorPipeline as runPhase2Collector,
  runCollectorPipeline,
  type CollectorPipelineResult as Phase2RunResult,
  type CollectorPipelineResult,
} from './collectorPipelineService.js';
