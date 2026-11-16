/**
 * The MDL mark: nested diamonds (an imigongo "eye") whose centre is a lit gold diamond.
 * Pure SVG so it is crisp at any size and needs no image file.
 */
export function Mark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="MDL"
      className={className}
    >
      <path d="M16 1 31 16 16 31 1 16Z" fill="#c6452d" />
      <path d="M16 6 26 16 16 26 6 16Z" fill="#f7f4ee" />
      <path d="M16 10.5 21.5 16 16 21.5 10.5 16Z" fill="#0f1d47" />
      <path d="M16 13.2 18.8 16 16 18.8 13.2 16Z" fill="#f4b63c" />
    </svg>
  );
}
