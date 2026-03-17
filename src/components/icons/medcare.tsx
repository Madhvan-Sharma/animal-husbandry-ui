export function VetAILogoSVG({
  className,
  width,
  height,
}: {
  width?: number;
  height?: number;
  className?: string;
}) {
  return (
    <img
      src="/logo.png"
      alt="VetAI"
      width={width}
      height={height}
      className={["object-contain", className].filter(Boolean).join(" ")}
    />
  );
}