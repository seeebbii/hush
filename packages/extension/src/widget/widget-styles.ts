export const WIDGET_CSS = `
:host {
  position: fixed;
  z-index: 2147483647;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.hush-widget {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: #06060a;
  border-radius: 14px;
  border: 1px solid rgba(0, 240, 255, 0.12);
  box-shadow:
    0 4px 24px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(0, 240, 255, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  cursor: grab;
  user-select: none;
}

.hush-widget.dragging {
  cursor: grabbing;
  opacity: 0.9;
}

.power-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid #00f0ff;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  box-shadow:
    0 0 8px rgba(0, 240, 255, 0.4),
    inset 0 0 8px rgba(0, 240, 255, 0.1);
  transition: box-shadow 0.2s, border-color 0.2s;
}

.power-btn:hover {
  box-shadow:
    0 0 14px rgba(0, 240, 255, 0.6),
    inset 0 0 12px rgba(0, 240, 255, 0.15);
}

.power-btn.off {
  border-color: #4a4a5a;
  box-shadow: none;
}

.power-btn.off:hover {
  border-color: #6a6a7a;
  box-shadow: none;
}

.power-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #00f0ff;
  box-shadow:
    0 0 6px rgba(0, 240, 255, 0.8),
    0 0 12px rgba(0, 240, 255, 0.4);
  transition: background 0.2s, box-shadow 0.2s;
}

.power-btn.off .power-dot {
  background: #4a4a5a;
  box-shadow: none;
}

.info {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1.5px;
  color: #e8e8ed;
  line-height: 1;
  text-transform: uppercase;
}

.stats {
  font-size: 10px;
  font-family: "JetBrains Mono", "Fira Mono", "Consolas", monospace;
  color: #00ff88;
  line-height: 1;
  transition: color 0.2s;
}

.stats.off {
  color: #4a4a5a;
}

.close-btn {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: none;
  background: rgba(255, 255, 255, 0.06);
  color: #6a6a7a;
  font-size: 13px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition: background 0.15s, color 0.15s;
  margin-left: 2px;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #c8c8d4;
}
`;
