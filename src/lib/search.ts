const categoryTerms: Record<string, string[]> = {
  auto: [
    "auto",
    "car",
    "cars",
    "carro",
    "carros",
    "coche",
    "coches",
    "voiture",
    "voitures",
    "macchina",
    "macchine",
    "automobile",
    "automobili",
    "auto's",
    "wagen",
    "wagens",
  ],
  camion: ["camion", "camión", "camions", "truck", "trucks", "lorry", "camioneta", "vrachtwagen", "vrachtwagens"],
  moto: [
    "moto",
    "motorcycle",
    "motorcycles",
    "motorbike",
    "motorbike",
    "motocicleta",
    "motocicletas",
    "moto",
    "motos",
    "motor",
    "motoren",
    "motorfiets",
  ],
  cucina: ["cucina", "cuisine", "cooking", "kitchen", "cocina", "keuken", "koken"],
  viaggi: ["viaggi", "viaggio", "travel", "trip", "voyage", "voyages", "viaje", "viajes", "reizen", "reis"],
  musica: ["musica", "music", "musique", "música", "muziek"],
  gaming: [
    "gaming",
    "videogame",
    "videogames",
    "video game",
    "video games",
    "jeu vidéo",
    "jeux vidéo",
    "videojuego",
    "videojuegos",
    "videospel",
    "videospellen",
  ],
  decorazione: ["decorazione", "decor", "decoration", "décoration", "decoración", "deco", "decoratie", "versiering"],
};

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();
}

function searchTermsFor(value: string): string[] {
  const normalized = normalizeSearchText(value);
  const category = Object.values(categoryTerms).find((terms) =>
    terms.some((term) => normalizeSearchText(term) === normalized),
  );
  return category ?? [value];
}

export function matchesMultilingualSearch(query: string, ...values: string[]): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const terms = values.flatMap((value) =>
    value.split(/[·,]/).flatMap((part) => searchTermsFor(part.trim())),
  );

  return terms.some((term) => normalizeSearchText(term).includes(normalizedQuery));
}
