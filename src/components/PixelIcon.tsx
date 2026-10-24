export type IconName =
  | "sword"
  | "football"
  | "check"
  | "arrow"
  | "arrowLeft"
  | "upload"
  | "file"
  | "person"
  | "team"
  | "book"
  | "crown"
  | "heart"
  | "help"
  | "sound"
  | "mute"
  | "close"
  | "spark"
  | "plus"
  | "mic"
  | "stop"
  | "retry";
const paths: Record<IconName, string> = {
  sword:
    "M15 2h5v5h-2v2h-2v2h-2v2h-2v2h2v2h-3v-2H9v2H7v2H5v2H2v-3h2v-2h2v-2h2v-2H6v-3h2v2h2V9h2V7h2V5h1V2Zm2 3v2h-2v2h-2v2h-2v2h2v-2h2V9h2V7h1V5h-1Z",
  football:
    "M8 2h10v2h2v2h2v10h-2v2h-2v2h-2v2H6v-2H4v-2H2V8h2V6h2V4h2V2Zm1 2v2H7v2H5v2H4v7h2v2h2v1h7v-2h2v-2h2v-2h1V7h-2V5h-2V4H9Zm6 3 2 2-2 2 2 2-2 2-2-2-2 2 2 2-2 2-2-2-2-2 2-2-2-2 2-2 2 2 2-2-2-2 2-2 2 2 2-2Z",
  check: "M3 11h3v3h3v3h3v-3h3v-3h3V8h3V5h-3v3h-3v3h-3v3H9v-3H6V8H3v3Z",
  arrow: "M13 3h3v3h3v3h3v6h-3v3h-3v3h-3v-3h3v-3H2V9h14V6h-3V3Z",
  arrowLeft: "M11 3H8v3H5v3H2v6h3v3h3v3h3v-3H8v-3h14V9H8V6h3V3Z",
  upload:
    "M10 2h4v3h3v3h3v3h-4V8h-2v9h-4V8H8v3H4V8h3V5h3V2ZM2 16h3v4h14v-4h3v7H2v-7Z",
  file: "M4 1h11v3h3v3h3v16H4V1Zm3 3v16h11V9h-6V4H7Zm8 2v1h1l-1-1ZM9 12h7v2H9v-2Zm0 4h7v2H9v-2Z",
  person:
    "M8 1h8v2h2v7h-2v2H8v-2H6V3h2V1Zm2 3v5h4V4h-4ZM6 14h12v2h3v7h-3v-6H6v6H3v-7h3v-2Z",
  team: "M5 2h6v2h2v6h-2v2H5v-2H3V4h2V2Zm2 3v4h3V5H7Zm10 0h4v2h2v5h-2v2h-4v-3h3V8h-3V5ZM3 14h10v2h3v7h-3v-6H4v6H1v-7h2v-2Zm15 2h4v2h2v5h-3v-4h-3v-3Z",
  book: "M1 3h9v2h4V3h9v17h-9v2h-4v-2H1V3Zm3 3v11h6v2h1V8H9V6H4Zm11 0v2h-2v11h1v-2h6V6h-5Z",
  crown:
    "M1 4h3v3h3v3h2V7h2V3h2v4h2v3h2V7h3V4h3v12h-2v5H3v-5H1V4Zm4 8v4h14v-4h-3v2h-3v-3h-2v3H8v-2H5Zm1 6v1h12v-1H6Z",
  heart: "M4 3h5v2h6V3h5v2h3v8h-3v3h-3v3h-3v3h-4v-3H7v-3H4v-3H1V5h3V3Z",
  help: "M5 1h14v2h3v3h2v12h-2v3h-3v2H5v-2H2v-3H0V6h2V3h3V1Zm1 3v2H3v12h3v2h12v-2h3V6h-3V4H6Zm2 3h8v2h2v4h-3v3h-4v-5h4V9h-4v2H8V7Zm3 11h4v3h-4v-3Z",
  sound: "M10 3h3v18h-3v-3H7v-3H2V9h5V6h3V3Zm6 4h3v3h2v4h-2v3h-3v-3h2v-4h-2V7Z",
  mute: "M10 3h3v18h-3v-3H7v-3H2V9h5V6h3V3Zm6 5h2v2h2V8h2v3h-2v2h2v3h-2v-2h-2v2h-2v-3h2v-2h-2V8Z",
  close:
    "M4 2h3v3h3v3h4V5h3V2h3v5h-3v3h-3v4h3v3h3v5h-3v-3h-3v-3h-4v3H7v3H4v-5h3v-3h3v-4H7V7H4V2Z",
  spark:
    "M10 0h4v6h3v3h6v4h-6v3h-3v7h-4v-7H7v-3H0V9h7V6h3V0Zm1 8v2H9v2h2v3h2v-3h2v-2h-2V8h-2Z",
  plus: "M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7V3Z",
  mic: "M8 1h8v2h2v10h-2v2H8v-2H6V3h2V1Zm2 3v8h4V4h-4ZM2 10h3v6h3v2h8v-2h3v-6h3v7h-3v3h-5v2h4v2H6v-2h4v-2H5v-3H2v-7Z",
  stop: "M4 4h16v16H4V4Z",
  retry:
    "M10 2h9v2h3v3h2v10h-3v-2h-2V8h-2V6h-6v2H8v3h5v3H1V2h3v6h3V5h3V2Zm-7 15h4v3h10v-2h4v4h-3v2H6v-2H3v-5Z",
};
export function PixelIcon({
  name,
  size = 20,
}: {
  name: IconName;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
