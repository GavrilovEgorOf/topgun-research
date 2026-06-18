import { parentPort, workerData } from "worker_threads";
import { Simulation, computeFitness } from "../shared/simulation.js";
import { NeuralNetwork } from "../shared/neural.js";

function evaluateBatch(jobs) {
  const results = [];
  for (const job of jobs) {
    const blueNet = NeuralNetwork.fromJSON(job.blueGenome);
    const redNet = NeuralNetwork.fromJSON(job.redGenome);
    const sim = new Simulation(job.seed, {
      recordReplay: job.recordReplay,
      explorationMult: job.explorationMult ?? 1,
    });
    sim.runToEnd(blueNet, redNet);
    const result = sim.getResult();
    results.push({
      jobId: job.jobId,
      side: job.side,
      genomeIndex: job.genomeIndex,
      fitness: computeFitness(result, job.side),
      result,
      blueGenome: job.blueGenome,
      redGenome: job.redGenome,
    });
  }
  return results;
}

parentPort.on("message", (msg) => {
  if (msg.type === "evaluate") {
    try {
      const results = evaluateBatch(msg.jobs);
      parentPort.postMessage({ type: "results", batchId: msg.batchId, results });
    } catch (err) {
      parentPort.postMessage({
        type: "error",
        batchId: msg.batchId,
        error: err?.message ?? String(err),
      });
    }
  }
});

if (workerData?.warmup) {
  parentPort.postMessage({ type: "ready" });
}
