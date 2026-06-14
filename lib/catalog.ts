export type SubcategoryConfig = {
  value: string;
  en: string;
  ar: string;
};

export const productSubcategories: SubcategoryConfig[] = [
  { value: "Kitchen Cabinets", en: "Kitchen Cabinets", ar: "خزائن المطبخ" },
  { value: "Closets",          en: "Closets",          ar: "خزائن الملابس" },
  { value: "Beds",             en: "Beds",             ar: "أسرّة" },
  { value: "Nightstands",      en: "Nightstands",      ar: "طاولات السرير" },
  { value: "Dressers",         en: "Dressers",         ar: "تسريحات" },
  { value: "Wall Cladding",    en: "Wall Cladding",    ar: "تكسية الجدران" },
];

export const componentSubcategories: SubcategoryConfig[] = [
  { value: "Drawers",    en: "Drawers",    ar: "أدراج" },
  { value: "Materials",  en: "Materials",  ar: "مواد" },
  { value: "Lighting",   en: "Lighting",   ar: "إضاءة" },
  { value: "Hinges",     en: "Hinges",     ar: "مفصلات" },
  { value: "Connectors", en: "Connectors", ar: "وصلات" },
  { value: "Plinth",     en: "Plinth",     ar: "قاعدة" },
];
