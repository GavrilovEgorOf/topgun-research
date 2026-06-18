export function createCameraControls(canvas) {
  const PAN_LIMIT = 46;
  const MIN_DISTANCE = 22;
  const MAX_DISTANCE = 90;
  const DEFAULT_DISTANCE = 58;
  const ZOOM_SENSITIVITY = 0.0012;

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const offset = { x: 0, z: 0 };
  let distance = DEFAULT_DISTANCE;
  let targetDistance = DEFAULT_DISTANCE;

  function clampOffset() {
    offset.x = Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, offset.x));
    offset.z = Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, offset.z));
  }

  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.classList.add("dragging");
  });

  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    const panScale = distance * 0.0011;
    offset.x -= dx * panScale;
    offset.z -= dy * panScale;
    clampOffset();
  });

  window.addEventListener("mouseup", (e) => {
    if (e.button !== 0) return;
    dragging = false;
    canvas.classList.remove("dragging");
  });

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      targetDistance = Math.max(
        MIN_DISTANCE,
        Math.min(MAX_DISTANCE, targetDistance + e.deltaY * ZOOM_SENSITIVITY * targetDistance)
      );
    },
    { passive: false }
  );

  return {
    getOffset: () => offset,
    getDistance: () => distance,
    updateZoom: (dt) => {
      const t = 1 - Math.exp(-12 * dt);
      distance += (targetDistance - distance) * t;
      return distance;
    },
  };
}
