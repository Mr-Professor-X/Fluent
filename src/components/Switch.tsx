export default function Switch({ on, onClick, label, disabled }: { on: boolean; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      className={`switch ${on ? 'switch-on' : ''}`}
      onClick={onClick}
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
    >
      <span />
    </button>
  );
}
