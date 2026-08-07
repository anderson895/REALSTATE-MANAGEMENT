import Image from 'next/image';

/**
 * The client's icon set, sliced out of the sheet they supplied and trimmed to
 * each glyph's own bounds.
 *
 * Raster rather than inline SVG, and deliberately: these are the client's
 * artwork, not generic glyphs. Redrawing them as paths would mean a set that
 * looks nearly right and drifts from the reference every time either changes.
 *
 * Intrinsic sizes differ per glyph — `eye` is 160×99, `shield` is 137×160 — so
 * each carries its own. Next needs them to reserve layout space, and a shared
 * square would letterbox the wide ones. Size at the call site with a height
 * class and `w-auto`.
 */

const ICONS = {
  'lock-badge': { w: 158, h: 160 },
  shield: { w: 137, h: 160 },
  gear: { w: 160, h: 157 },
  nodes: { w: 160, h: 136 },
  user: { w: 138, h: 160 },
  key: { w: 158, h: 160 },
  eye: { w: 160, h: 99 },
  warning: { w: 160, h: 144 },
  headset: { w: 157, h: 160 },
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  className,
  priority,
}: {
  name: IconName;
  className: string;
  priority?: boolean;
}) {
  const { w, h } = ICONS[name];
  return (
    <Image
      src={`/icons/${name}.png`}
      alt=""
      width={w}
      height={h}
      priority={priority}
      className={className}
    />
  );
}

/**
 * The show/hide control.
 *
 * The set has one eye and no struck-through variant, so the "hidden" state is
 * drawn here as a rule across it rather than faked with a second-guess at the
 * artwork. The checkbox below the field carries the same state in words; this
 * is the shortcut, not the only signal.
 */
export function EyeToggle({ struck }: { struck: boolean }) {
  return (
    <span className="relative inline-flex items-center">
      <Icon name="eye" className="h-[18px] w-auto" />
      {struck ? (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1/2 h-[2px] w-full -translate-y-1/2 -rotate-[22deg] rounded-full bg-[#12294f]"
        />
      ) : null}
    </span>
  );
}
