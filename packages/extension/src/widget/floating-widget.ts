import { WIDGET_CSS } from "./widget-styles";

// Module-level references so destroyWidget and updateWidgetMetrics can find them
let hostEl: HTMLElement | null = null;
let powerBtn: HTMLButtonElement | null = null;
let statsEl: HTMLDivElement | null = null;

export function createWidget(position: { x: number; y: number }): void {
  // Don't create a second one
  if (hostEl) return;

  // Custom element host
  hostEl = document.createElement("hush-widget");
  hostEl.style.left = `${position.x}px`;
  hostEl.style.top = `${position.y}px`;

  const shadow = hostEl.attachShadow({ mode: "closed" });

  // Styles
  const styleEl = document.createElement("style");
  styleEl.textContent = WIDGET_CSS;
  shadow.appendChild(styleEl);

  // Widget container
  const widget = document.createElement("div");
  widget.className = "hush-widget";

  // Power button
  powerBtn = document.createElement("button");
  powerBtn.className = "power-btn";
  powerBtn.setAttribute("aria-label", "Toggle Must Hush noise suppression");

  const dot = document.createElement("div");
  dot.className = "power-dot";
  powerBtn.appendChild(dot);

  // Info section
  const info = document.createElement("div");
  info.className = "info";

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = "Must Hush";

  statsEl = document.createElement("div");
  statsEl.className = "stats";
  statsEl.id = "hush-stats";
  statsEl.textContent = "initializing…";

  info.appendChild(title);
  info.appendChild(statsEl);

  // Close button
  const closeBtn = document.createElement("button");
  closeBtn.className = "close-btn";
  closeBtn.setAttribute("aria-label", "Close Must Hush widget");
  closeBtn.textContent = "✕";

  // Assemble widget
  widget.appendChild(powerBtn);
  widget.appendChild(info);
  widget.appendChild(closeBtn);
  shadow.appendChild(widget);

  document.body.appendChild(hostEl);

  // --- Drag handling ---
  let dragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  widget.addEventListener("mousedown", (e: MouseEvent) => {
    // Don't start drag on button clicks
    if (e.target === powerBtn || e.target === closeBtn || e.target === dot) return;

    dragging = true;
    dragOffsetX = e.clientX - hostEl!.getBoundingClientRect().left;
    dragOffsetY = e.clientY - hostEl!.getBoundingClientRect().top;
    widget.classList.add("dragging");
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e: MouseEvent) => {
    if (!dragging || !hostEl) return;
    const x = e.clientX - dragOffsetX;
    const y = e.clientY - dragOffsetY;
    hostEl.style.left = `${x}px`;
    hostEl.style.top = `${y}px`;
  });

  document.addEventListener("mouseup", (e: MouseEvent) => {
    if (!dragging || !hostEl) return;
    dragging = false;
    widget.classList.remove("dragging");

    const x = e.clientX - dragOffsetX;
    const y = e.clientY - dragOffsetY;

    document.documentElement.dispatchEvent(
      new CustomEvent("hush:save-widget-pos", { detail: { x, y } }),
    );
  });

  // --- Power button ---
  powerBtn.addEventListener("click", () => {
    document.documentElement.dispatchEvent(new CustomEvent("hush:widget-toggle"));
  });

  // --- Close button ---
  closeBtn.addEventListener("click", () => {
    document.documentElement.dispatchEvent(new CustomEvent("hush:widget-close"));
  });
}

export function destroyWidget(): void {
  if (hostEl) {
    hostEl.remove();
    hostEl = null;
  }
  powerBtn = null;
  statsEl = null;
}

export function updateWidgetMetrics(
  reduction: number,
  latencyMs: number,
  enabled: boolean,
): void {
  if (!statsEl || !powerBtn) return;

  if (enabled) {
    statsEl.textContent = `${reduction} dB · ${latencyMs}ms`;
    statsEl.classList.remove("off");
    powerBtn.classList.remove("off");
  } else {
    statsEl.textContent = "OFF";
    statsEl.classList.add("off");
    powerBtn.classList.add("off");
  }
}
