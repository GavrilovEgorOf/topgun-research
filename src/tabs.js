export function initTabs(container) {
  const buttons = container.querySelectorAll(".panel-tab");
  const panes = container.querySelectorAll(".tab-pane");

  function activate(id) {
    buttons.forEach((btn) => {
      const on = btn.dataset.tab === id;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    panes.forEach((pane) => {
      const on = pane.id === `tab-${id}`;
      pane.classList.toggle("active", on);
      pane.hidden = !on;
    });
    window.dispatchEvent(new CustomEvent("panel-tab", { detail: { tab: id } }));
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => activate(btn.dataset.tab));
  });

  const initial = container.querySelector(".panel-tab.active")?.dataset.tab ?? "main";
  activate(initial);

  return { activate };
}
