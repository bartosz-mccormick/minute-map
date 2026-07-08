export const MAP_OVERLAY_DIALOG_TITLE_CLASS =
  "font-sans text-lg font-semibold leading-6 tracking-normal text-foreground"

export const MAP_OVERLAY_SECTION_TITLE_CLASS =
  "font-sans text-base font-semibold leading-5 tracking-normal text-foreground"

export const MAP_OVERLAY_PANEL_TITLE_CLASS =
  "font-sans text-sm font-semibold leading-5 tracking-normal text-foreground"

export const MAP_OVERLAY_BODY_MAIN_CLASS =
  "font-sans text-sm font-normal leading-5 tracking-normal text-foreground"

export const MAP_OVERLAY_BODY_SMALL_CLASS =
  "font-sans text-xs font-normal leading-4 tracking-normal text-foreground"

export const MAP_OVERLAY_META_TEXT_CLASS =
  "font-sans text-[11px] font-normal leading-4 tracking-normal text-muted-foreground"

export const MAP_OVERLAY_BUTTON_TEXT_CLASS =
  "font-sans text-sm font-medium leading-5 tracking-normal text-primary-foreground"

// Canvas-rendered text cannot consume Tailwind classes directly, so this is the
// direct style adapter for MAP_OVERLAY_BODY_SMALL_CLASS.
export const MAP_OVERLAY_BODY_SMALL_CANVAS_TEXT_STYLE = {
  color: "#111827",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  fontSize: 12,
  fontWeight: 400,
} as const
