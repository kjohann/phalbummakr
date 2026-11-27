import { DEFAULT_BLEED_MM, DEFAULT_MIN_EFFECTIVE_DPI, DEFAULT_SAFE_ZONE_MM, type EdgeMargins, type PageDimensions, type PageFormat } from "../core";

const pageChoices = [
  { value: "297x210", label: "A4 landscape (29.7 x 21 cm)", widthMm: 297, heightMm: 210 },
  { value: "210x297", label: "A4 portrait (21 x 29.7 cm)", widthMm: 210, heightMm: 297 },
  { value: "160x160", label: "16 x 16 cm", widthMm: 160, heightMm: 160 },
  { value: "200x200", label: "20 x 20 cm", widthMm: 200, heightMm: 200 },
  { value: "280x280", label: "28 x 28 cm", widthMm: 280, heightMm: 280 },
  { value: "210x280", label: "21 x 28 cm", widthMm: 210, heightMm: 280 },
  { value: "280x210", label: "28 x 21 cm", widthMm: 280, heightMm: 210 },
];

export function PageFormatChoices({ disabled }: { disabled?: boolean }) {
  return <label>Page Format<select name="pageFormat" disabled={disabled}>
    {pageChoices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
  </select></label>;
}

export function readPageChoice(form: FormData): PageDimensions {
  const choice = pageChoices.find((item) => item.value === form.get("pageFormat"));
  if (!choice) throw new Error("Choose a Page Format.");
  return { widthMm: choice.widthMm, heightMm: choice.heightMm };
}

/** Bleed and Safe Zone inputs for each axis, shared by the New Album forms and Album settings. */
function MarginFields({
  bleedMm = { x: DEFAULT_BLEED_MM, y: DEFAULT_BLEED_MM },
  safeZoneMm = { x: DEFAULT_SAFE_ZONE_MM, y: DEFAULT_SAFE_ZONE_MM },
  disabled,
}: {
  bleedMm?: EdgeMargins; safeZoneMm?: EdgeMargins; disabled?: boolean;
}) {
  const field = (label: string, name: string, value: number) => (
    <label>{label}<input name={name} type="number" min="0" step="any" defaultValue={value} required disabled={disabled} /></label>
  );
  return <>
    {field("Bleed left/right (mm)", "bleedXMm", bleedMm.x)}
    {field("Bleed top/bottom (mm)", "bleedYMm", bleedMm.y)}
    {field("Safe Zone left/right (mm)", "safeZoneXMm", safeZoneMm.x)}
    {field("Safe Zone top/bottom (mm)", "safeZoneYMm", safeZoneMm.y)}
  </>;
}

export function PrintSettingsFields({ format, disabled }: { format?: PageFormat; disabled?: boolean }) {
  return <>
    <MarginFields bleedMm={format?.bleedMm} safeZoneMm={format?.safeZoneMm} disabled={disabled} />
    <label>Export resolution (DPI)<input name="dpi" type="number" min="1" step="any"
      defaultValue={format?.dpi ?? 300} required disabled={disabled} /></label>
    <label>Effective Resolution warning below (DPI)<input name="minEffectiveDpi" type="number" min="1" step="any"
      defaultValue={format?.minEffectiveDpi ?? DEFAULT_MIN_EFFECTIVE_DPI} required disabled={disabled} /></label>
  </>;
}

export function readPrintSettings(form: FormData): Pick<PageFormat, "bleedMm" | "safeZoneMm" | "dpi" | "minEffectiveDpi"> {
  const number = (name: string, label: string) => {
    const value = form.get(name);
    if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} is required.`);
    return Number(value);
  };
  return {
    bleedMm: { x: number("bleedXMm", "Left/right Bleed"), y: number("bleedYMm", "Top/bottom Bleed") },
    safeZoneMm: { x: number("safeZoneXMm", "Left/right Safe Zone"), y: number("safeZoneYMm", "Top/bottom Safe Zone") },
    dpi: number("dpi", "Export resolution"),
    minEffectiveDpi: number("minEffectiveDpi", "Effective Resolution threshold"),
  };
}
