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
    "autos",
  ],
  camion: ["camion", "camión", "camions", "truck", "trucks", "lorry", "camioneta", "vrachtwagen", "vrachtwagens", "lkw", "lastwagen"],
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
    "motorrad",
    "motorräder",
  ],
  cucina: ["cucina", "cuisine", "cooking", "kitchen", "cocina", "keuken", "koken", "küche", "kochen"],
  viaggi: ["viaggi", "viaggio", "travel", "trip", "voyage", "voyages", "viaje", "viajes", "reizen", "reis", "reisen", "reise"],
  musica: ["musica", "music", "musique", "música", "muziek", "musik"],
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
    "videospiel",
    "videospiele",
  ],
  decorazione: ["decorazione", "decor", "decoration", "décoration", "decoración", "deco", "decoratie", "versiering", "dekoration", "deko"],
  aviazione: ["aviazione", "aerei", "aereo", "aviation", "avion", "avions", "aviación", "avión", "aviones", "plane", "planes", "aircraft", "luchtvaart", "vliegtuig", "luftfahrt", "flugzeug", "flugzeuge"],
  storia: ["storia", "guerra", "history", "histoire", "guerre", "historia", "war", "geschiedenis", "oorlog", "geschichte", "krieg"],
  fantasy: ["fantasy", "fantasia", "fantasía", "drago", "dragon", "dragón", "draak", "drache"],
  "cinema e musica": ["cinema", "film", "movie", "musica", "music", "musique", "cine", "película", "música", "muziek", "kino", "musik"],
  sport: ["sport", "calcio", "football", "soccer", "deporte", "fútbol", "voetbal", "formula 1", "fußball", "fussball"],
  animali: ["animali", "animals", "animaux", "animales", "dieren", "cane", "gatto", "dog", "cat", "chien", "chat", "perro", "gato", "hond", "kat", "tiere", "hund", "katze"],
  insegne: ["insegne", "signs", "panneaux", "letreros", "borden", "schilder", "schild"],
  campagna: ["campagna", "countryside", "campagne", "campo", "platteland", "land", "landleben"],
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
