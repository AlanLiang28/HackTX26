type Kind = "slime" | "knight" | "dragon" | "player" | "coach" | "trophy";
const palette: Record<string, string> = {
  d: "#233f32",
  g: "#79a75a",
  l: "#b7d979",
  w: "#fff8da",
  b: "#749994",
  a: "#b9cebf",
  y: "#edbe5f",
  o: "#bf783e",
  r: "#9d563b",
  s: "#e7bc8b",
  k: "#334d3e",
  p: "#6b7976",
};
const sprites: Record<Kind, string[]> = {
  slime: [
    "................",
    "................",
    "................",
    "................",
    "......dddd......",
    "....ddlllldd....",
    "...dllllllllg...",
    "..dllwlllllllg..",
    "..dllllllllllg..",
    ".dllldlllldlllg.",
    ".dllldlllldlllg.",
    ".gllllllllllllg.",
    ".ggllllllwlllgg.",
    "..gggggggggggg..",
    "...dddddddddd...",
    "................",
  ],
  knight: [
    "......yyyy......",
    ".....ydyydy.....",
    ".....daaaad.....",
    "....daaaaabd....",
    "....daddaddd....",
    "....daaaaabd....",
    ".....dddddd.....",
    "...ddaaaaaadd...",
    "..daalaaaaabbd..",
    "..daayyyyyybbd..",
    "..dppaaaddaapd..",
    "..dppaaaddaapd..",
    "...ddadddaddd...",
    "....daaddbad....",
    "...ddaddddadd...",
    "...dddd..dddd...",
  ],
  dragon: [
    "..dd........dd..",
    "..dgd......dgd..",
    "..dlgd....dgld..",
    ".dllllgddglllld.",
    ".dllllgggglllld.",
    "dllllgggggglllld",
    "dllllgggggglllld",
    ".dddggggggggddd.",
    "...dgwdggdwgd...",
    "...dggggggggd...",
    "....dgyyyyggd...",
    "...dggyyyygggd..",
    "..dgggyyyyggggd.",
    "..dgggyyyyggggd.",
    "...ddggggggdd...",
    "...ddd....ddd...",
  ],
  player: [
    ".....dddddd.....",
    "....dyyyyyyd....",
    "...dyyyyyyyyd...",
    "...dyyyyydddd...",
    "...dyyyysssssd..",
    "....dyyssdsdsd..",
    ".....ddssssdd...",
    "...ddgggggggdd..",
    "..dggglwwlggggd.",
    "..dggglwwlggggd.",
    "..dssgggggggssd.",
    "..dssdwwwwwdssd.",
    "...dddwwwwwddd..",
    ".....dwwdwwd....",
    "....ddwwdwwdd...",
    "....ddddddddd...",
  ],
  coach: [
    ".....dddddd.....",
    "....dggggggd....",
    "...dggggggggdd..",
    "...dddddddddddd.",
    "....dssssssd....",
    "....dsdssdsd....",
    "....dssssssd....",
    ".....dddddd.....",
    "...ddggggggdd...",
    "..dggggwgggggd..",
    "..dggggygggggd..",
    "..dssggggggssd..",
    "..dssdppppdssd..",
    "...dddppppddd...",
    ".....dppdppd....",
    "....ddddddddd...",
  ],
  trophy: [
    ".....yyyyyy.....",
    "..yyyyyyyyyyyy..",
    ".yoyyyyyyyyyyoy.",
    ".yooyyyyyyyyooy.",
    ".yooyyyyyyyyooy.",
    "..yooyyyyyyooy..",
    "...yooyyyyooy...",
    "....yyyyyyyy....",
    ".....yyyyyy.....",
    "......yyyy......",
    "......yyyy......",
    "......yoyy......",
    ".....yyooyy.....",
    "....yyyyyyyy....",
    "...oooooooooo...",
    "...dddddddddd...",
  ],
};
export function PixelSprite({ kind }: { kind: Kind }) {
  return (
    <svg
      className={`pixel-sprite sprite-${kind}`}
      width="128"
      height="128"
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {sprites[kind].flatMap((row, y) =>
        [...row].map((pixel, x) =>
          pixel === "." ? null : (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width="1"
              height="1"
              fill={palette[pixel] ?? palette.d}
            />
          ),
        ),
      )}
    </svg>
  );
}
