import { ReplayGame } from "./game.js";
import { TrainingApi } from "./api.js";
import { initPanel } from "./panel.js";
import { NeuralNetwork } from "../shared/neural.js";
import { inspectFromFrame } from "../shared/brain-inspect.js";

function boot() {
  const canvas = document.getElementById("game-canvas");
  if (!canvas) return;

  const start = () => {
    if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
      const game = new ReplayGame(canvas);
      game.loadEmptyWorld();
      game.setLiveMode(true);

      const api = new TrainingApi();
      let brainListener = null;

      api.onLive((packet) => {
        game.applyLivePacket(packet);
        if (packet.brain && brainListener) brainListener(packet.brain);
      });

      const loadReplay = async (id) => {
        const replay = await api.fetchReplay(id);
        if (replay) {
          game.loadReplay(replay, (frame, seed, brains) => {
            if (!brains?.blue || !brains?.red || !brainListener) return;
            const blueNet = NeuralNetwork.fromJSON(brains.blue);
            const redNet = NeuralNetwork.fromJSON(brains.red);
            brainListener(inspectFromFrame(frame, seed, blueNet, redNet));
          });
        }
      };

      const loadCompareReplay = (match) => {
        if (!match?.frames?.length) return;
        game.loadReplay(
          {
            seed: match.seed,
            frames: match.frames,
            blueBrain: match.blueBrain,
            redBrain: match.redBrain,
          },
          (frame, seed, brains) => {
            if (!brains?.blue || !brains?.red || !brainListener) return;
            const blueNet = NeuralNetwork.fromJSON(brains.blue);
            const redNet = NeuralNetwork.fromJSON(brains.red);
            brainListener(inspectFromFrame(frame, seed, blueNet, redNet));
          }
        );
      };

      initPanel(
        api,
        loadReplay,
        () => game.setLiveMode(true),
        (fn) => {
          brainListener = fn;
        },
        loadCompareReplay
      );
      return;
    }
    requestAnimationFrame(start);
  };

  start();
}

boot();
