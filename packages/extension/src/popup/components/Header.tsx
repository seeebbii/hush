export function Header() {
  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  return (
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent-cyan to-accent-violet flex items-center justify-center font-bold text-xs text-bg-primary font-[family-name:var(--font-display)]">
          H
        </div>
        <span className="font-[family-name:var(--font-display)] font-bold text-base tracking-[2px] text-text-primary">
          HUSH
        </span>
      </div>
      <div className="flex gap-1.5">
        <button
          onClick={openOptions}
          className="w-7 h-7 rounded-md bg-border-subtle border border-border-default flex items-center justify-center text-text-tertiary text-sm hover:bg-bg-hover transition-colors"
          title="Settings"
        >
          ⚙
        </button>
      </div>
    </div>
  );
}
