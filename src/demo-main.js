import { ReplayGame } from "./game.js";
import { DemoApi } from "./demo-api.js";
import { initPanel } from "./panel.js";
import { NeuralNetwork } from "../shared/neural.js";
import { inspectFromFrame } from "../shared/brain-inspect.js";

function boot() {
  const canvas = document.getElementById("game-canvas");
  if (!canvas) return;

  document.body.classList.add("demo-mode");

  const start = () => {
    if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
      const game = new ReplayGame(canvas);
      game.loadEmptyWorld();
      game.setLiveMode(false);

      const api = new DemoApi();
      let brainListener = null;

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

      initPanel(api, loadReplay, null, (fn) => {
        brainListener = fn;
      }, loadCompareReplay, { demo: true });

      api.fetchStatus().then((status) => {
        const first = status?.replays?.[0];
        if (first?.id) loadReplay(first.id);
      });

      return;
    }
    requestAnimationFrame(start);
  };

  start();
}

boot();
