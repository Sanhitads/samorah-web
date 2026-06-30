/**
 * Artists — shared, referenceable artist content. A product references an
 * `artistId` (defaulting to the house artist) rather than embedding the story,
 * so a future Artist A / B / C all work with no product changes. The artist
 * experience is composed on the PDP from reusable blocks (ArtistFeature →
 * ArtworkFeature → EditorialQuote). Imagery is `gradient:*` until SPD photography.
 */
export interface Artist {
  id: string;
  name: string;
  role: string;
  story: string[];
  portrait: string;
  processImages: string[];
  artworkImages: string[];
  signature: string;
  quote: string;
  ctaLabel?: string;
  ctaHref?: string;
}

export const DEFAULT_ARTIST_ID = "house-artist";

export const ARTISTS: Artist[] = [
  {
    id: "house-artist",
    name: "The Samorah Artist",
    role: "Painter · Colourist",
    story: [
      "The artwork across every Samorah collection is created by a special artist whose creativity flows through colour and imagination.",
      "He experiences the world differently and communicates in ways beyond words — yet through painting, his expression is vivid, intuitive, and deeply emotional.",
      "Each illustration is hand-painted with focus, time and sincerity. No two pieces are ever identical; no design is digitally manufactured.",
      "By choosing Samorah you encourage an artist's confidence, independence and creative journey. We are honoured to share his art with your home.",
    ],
    portrait: "gradient:grad-blush",
    processImages: ["gradient:grad-chai"],
    artworkImages: ["gradient:grad-amethyst"],
    signature: "— The Samorah Artist",
    quote: "Every colour begins with a feeling.",
    ctaLabel: "The story of our art",
    ctaHref: "/about/meet-the-makers",
  },
];

export function getArtist(id: string | null | undefined): Artist | undefined {
  return ARTISTS.find((a) => a.id === (id ?? DEFAULT_ARTIST_ID));
}
