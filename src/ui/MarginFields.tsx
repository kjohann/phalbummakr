import { DEFAULT_BLEED_MM, DEFAULT_SAFE_ZONE_MM, pageDimensions, type EdgeMargins, type PageFormat } from "../core";

/** Bleed and Safe Zone inputs for each axis, shared by the New Album forms and Album settings. */
export function MarginFields({
  bleedMm = { x: DEFAULT_BLEED_MM, y: DEFAULT_BLEED_MM },
  safeZoneMm = { x: DEFAULT_SAFE_ZONE_MM, y: DEFAULT_SAFE_ZONE_MM },
  disabled,
}: {
  bleedMm?: EdgeMargins; safeZoneMm?: EdgeMargins; disabled?: boolean;
}) {
  // Every Album is A4 landscape for now.
  const { widthMm, heightMm } = pageDimensions({ size: "A4" } as PageFormat);
  const field = (label: string, name: string, value: number, max?: number) => (
    <label>{label}<input name={name} type="number" min="0" max={max} step="any" defaultValue={value} required disabled={disabled} /></label>
  );
  return <>
    {field("Bleed left/right (mm)", "bleedXMm", bleedMm.x)}
    {field("Bleed top/bottom (mm)", "bleedYMm", bleedMm.y)}
    {field("Safe Zone left/right (mm)", "safeZoneXMm", safeZoneMm.x, widthMm / 2 - 0.01)}
    {field("Safe Zone top/bottom (mm)", "safeZoneYMm", safeZoneMm.y, heightMm / 2 - 0.01)}
  </>;
}

export function readMargins(form: FormData): { bleedMm: EdgeMargins; safeZoneMm: EdgeMargins } {
  return {
    bleedMm: { x: Number(form.get("bleedXMm")), y: Number(form.get("bleedYMm")) },
    safeZoneMm: { x: Number(form.get("safeZoneXMm")), y: Number(form.get("safeZoneYMm")) },
  };
}
