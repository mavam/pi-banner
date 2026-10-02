export const SYMBOLS = ["pi", "logo"] as const;
export type SplashSymbol = (typeof SYMBOLS)[number];

/** Pi's 4x4 pixel logo, as used by its v1.0.0 3D Easter egg. */
export const LOGO_PIXELS = ["ccc.", "b.c.", "bb.y", "b..y"];
/** A square logo pixel spans six columns and three terminal rows. */
export const LOGO_PIXEL_COLUMNS = 6;
export const LOGO_PIXEL_ROWS = 3;
export const LOGO_ART = LOGO_PIXELS.flatMap((line) =>
  Array.from({ length: LOGO_PIXEL_ROWS }, () =>
    [...line].map((pixel) => (pixel === "." ? " " : "█").repeat(LOGO_PIXEL_COLUMNS)).join(""),
  ),
);

export const PI_ART = [
  "    3.141592653589793238462643383279",
  "   5028841971693993751058209749445923",
  "  07816406286208998628034825342117067",
  "  9821    48086         5132",
  " 823      06647        09384",
  "46        09550        58223",
  "          1725         3594",
  "         08128        48111",
  "        74502         84102",
  "       70193          85211        05",
  "     5596446           22948954930381",
  "    9644288             10975665933",
];
