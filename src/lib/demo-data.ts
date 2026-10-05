// DATOS DEMOSTRATIVOS (solo para la maqueta de diseño). Se sustituyen por datos reales en las Etapas 4 a 6.
export type DemoProduct = {
  name: string;
  path: string;
  size: string;
  price: string;
  tone: number;
};

export const demoCategories = [
  "Auto",
  "Camion",
  "Moto",
  "Cucina",
  "Viaggi",
  "Musica",
  "Gaming",
  "Decorazione",
];

export const demoProducts: DemoProduct[] = [
  {
    name: "BMW S1000RR — Garage Edition",
    path: "Moto · BMW · S1000RR",
    size: "30 × 20 cm",
    price: "€ 42,00",
    tone: 0,
  },
  {
    name: "BMW S1000RR — Classic",
    path: "Moto · BMW · S1000RR",
    size: "30 × 20 cm",
    price: "€ 38,00",
    tone: 1,
  },
  {
    name: "Rock Edition",
    path: "Musica · Rock",
    size: "40 × 30 cm",
    price: "€ 39,00",
    tone: 2,
  },
  {
    name: "PS5 Player One",
    path: "Gaming · PlayStation · PS5",
    size: "30 × 20 cm",
    price: "€ 35,00",
    tone: 3,
  },
];

// ---- Panel de administración (DEMOSTRATIVO) ----
export type AdminState = "published" | "unavailable" | "draft";

export type AdminProduct = {
  name: string;
  reference: string;
  imageUrl?: string | null;
  category: string;
  price: number;
  size: string;
  qty: number | null;
  state: AdminState;
};

export const adminProducts: AdminProduct[] = [
  {
    name: "BMW S1000RR — Garage Edition",
    reference: "PL-001",
    category: "Moto",
    price: 42,
    size: "30 × 20 cm",
    qty: 18,
    state: "published",
  },
  {
    name: "BMW S1000RR — Classic",
    reference: "PL-002",
    category: "Moto",
    price: 38,
    size: "30 × 20 cm",
    qty: 24,
    state: "published",
  },
  {
    name: "Rock Edition",
    reference: "PL-003",
    category: "Musica",
    price: 39,
    size: "40 × 30 cm",
    qty: 3,
    state: "published",
  },
  {
    name: "PS5 Player One",
    reference: "PL-004",
    category: "Gaming",
    price: 35,
    size: "30 × 20 cm",
    qty: 0,
    state: "unavailable",
  },
  {
    name: "Vintage Garage",
    reference: "PL-005",
    category: "Vintage",
    price: 36,
    size: "30 × 20 cm",
    qty: 11,
    state: "published",
  },
  {
    name: "Racing Style",
    reference: "PL-006",
    category: "Moto",
    price: 45,
    size: "40 × 30 cm",
    qty: null,
    state: "draft",
  },
];

export const adminSales = [
  { product: "BMW S1000RR — Garage Edition", qty: 2, unit: 42, date: "2026-09-30" },
  { product: "Rock Edition", qty: 1, unit: 39, date: "2026-09-29" },
  { product: "BMW S1000RR — Classic", qty: 1, unit: 38, date: "2026-09-28" },
  { product: "BMW S1000RR — Garage Edition", qty: 1, unit: 42, date: "2026-09-26" },
  { product: "Vintage Garage", qty: 2, unit: 36, date: "2026-09-24" },
];
