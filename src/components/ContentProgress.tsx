import { PixelSprite } from "./PixelSprite";
import type { SpriteKind } from "./PixelSprite";

export function ContentProgress({
  sprite,
  label,
}: {
  sprite: SpriteKind;
  label: string;
}) {
  return (
    <div className="content-progress">
      <div
        className="content-progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuetext="In progress"
      >
        <span className="content-progress-fill" aria-hidden="true" />
        <span className="content-progress-runner" aria-hidden="true">
          <PixelSprite kind={sprite} />
        </span>
      </div>
      <p className="content-progress-label" role="status">
        {label}
      </p>
    </div>
  );
}
