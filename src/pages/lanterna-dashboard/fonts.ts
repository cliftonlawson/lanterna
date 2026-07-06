export type GoogleFontOption = {
  family: string;
  mood: string;
  weights: number[];
};

export type GalleryFontSettings = {
  headlineFont: string;
  headlineFontWeight: number;
  bodyFont: string;
  bodyFontWeight: number;
};

export const DEFAULT_HEADLINE_FONT = 'Cormorant Garamond';
export const DEFAULT_BODY_FONT = 'DM Sans';
export const DEFAULT_HEADLINE_WEIGHT = 500;
export const DEFAULT_BODY_WEIGHT = 400;

export const FONT_OPTIONS: GoogleFontOption[] = [
  { family: 'Cormorant Garamond', mood: 'Luxury editorial', weights: [400, 500, 600, 700] },
  { family: 'Playfair Display', mood: 'Classic luxury', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Libre Baskerville', mood: 'Refined classic', weights: [400, 700] },
  { family: 'Fraunces', mood: 'Editorial artful', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Bodoni Moda', mood: 'Fashion luxury', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'DM Serif Display', mood: 'Simple luxury', weights: [400] },
  { family: 'Arapey', mood: 'Soft romantic', weights: [400] },
  { family: 'Tinos', mood: 'Quiet classic', weights: [400, 700] },
  { family: 'Prata', mood: 'European editorial', weights: [400] },
  { family: 'Instrument Serif', mood: 'Modern editorial', weights: [400] },
  { family: 'Antic Didone', mood: 'Fine art minimal', weights: [400] },
  { family: 'Newsreader', mood: 'Literary editorial', weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Italiana', mood: 'Delicate luxury', weights: [400] },
  { family: 'Della Respira', mood: 'Warm romantic', weights: [400] },
  { family: 'Merriweather', mood: 'Grounded editorial', weights: [300, 400, 700, 900] },
  { family: 'Outfit', mood: 'Modern clean', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'DM Sans', mood: 'Premium UI', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Red Hat Display', mood: 'Modern editorial UI', weights: [500, 600, 700] },
  { family: 'Montserrat', mood: 'Adventure bold', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Work Sans', mood: 'Human clean', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Barlow', mood: 'Cinematic modern', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Josefin Sans', mood: 'Indie editorial', weights: [300, 400, 500, 600, 700] },
  { family: 'Manrope', mood: 'Polished modern', weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Inter', mood: 'Pure interface', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Plus Jakarta Sans', mood: 'Modern premium', weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Space Grotesk', mood: 'Bold adventure', weights: [300, 400, 500, 600, 700] },
  { family: 'Bebas Neue', mood: 'Poster bold', weights: [400] },
  { family: 'Poppins', mood: 'Clean friendly', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Archivo Narrow', mood: 'Condensed cinematic', weights: [400, 500, 600, 700] },
];

export function fontOptionFor(family: string | null | undefined) {
  return FONT_OPTIONS.find((font) => font.family === family) ?? FONT_OPTIONS[0];
}

export function clampFontWeight(family: string | null | undefined, weight: number | null | undefined, fallback: number) {
  const option = fontOptionFor(family);
  if (typeof weight === 'number' && option.weights.includes(weight)) return weight;
  return option.weights.includes(fallback) ? fallback : option.weights[0];
}

export function fontFamilyStack(family: string, fallback: string) {
  return `"${family}", ${fallback}`;
}

export function googleFontFamilyParam(family: string, weights: number[]) {
  const uniqueWeights = [...new Set(weights)].sort((a, b) => a - b);
  return `family=${family.replace(/\s+/g, '+')}:wght@${uniqueWeights.join(';')}`;
}

export function googleFontsHref(settings: GalleryFontSettings) {
  const families = new Map<string, number[]>();
  families.set(settings.headlineFont, [settings.headlineFontWeight]);
  const bodyWeights = families.get(settings.bodyFont) ?? [];
  families.set(settings.bodyFont, [...bodyWeights, settings.bodyFontWeight]);
  const query = [...families.entries()]
    .map(([family, weights]) => googleFontFamilyParam(family, weights))
    .join('&');
  return `https://fonts.googleapis.com/css2?${query}&display=swap`;
}

export function galleryFontSettings(settings: Partial<GalleryFontSettings>): GalleryFontSettings {
  const headlineFont = settings.headlineFont || DEFAULT_HEADLINE_FONT;
  const bodyFont = settings.bodyFont || DEFAULT_BODY_FONT;
  return {
    headlineFont,
    headlineFontWeight: clampFontWeight(headlineFont, settings.headlineFontWeight, DEFAULT_HEADLINE_WEIGHT),
    bodyFont,
    bodyFontWeight: clampFontWeight(bodyFont, settings.bodyFontWeight, DEFAULT_BODY_WEIGHT),
  };
}
