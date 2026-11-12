import { Router } from "express";

import { HttpError } from "../lib/http.js";
import { findActiveProduct, toPublicProduct } from "../lib/products.js";
import { supabase } from "../lib/supabase.js";
import { requireApiKey } from "../middleware/requireApiKey.js";

export const productsRouter = Router();

// ---------------------------------------------------------------------
// GET /api/products → catálogo (solo productos visibles)
// Filtro opcional: ?category=gummies|energy|hydration
// ---------------------------------------------------------------------
productsRouter.get("/", async (req, res) => {
  let query = supabase
    .from("products")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const { category } = req.query;
  if (category) {
    if (!CATEGORIES.includes(category)) throw new HttpError(400, `category debe ser: ${CATEGORIES.join(", ")}`);
    query = query.eq("category", category);
  }

  const { data, error } = await query;
  if (error) throw new HttpError(502, "No se pudieron obtener los productos", error.message);

  res.json({ count: data.length, products: data.map(toPublicProduct) });
});

// ---------------------------------------------------------------------
// GET /api/products/:idOrSlug → un producto
// ---------------------------------------------------------------------
productsRouter.get("/:idOrSlug", async (req, res) => {
  const row = await findActiveProduct(req.params.idOrSlug);
  res.json({ product: toPublicProduct(row) });
});

// ---------------------------------------------------------------------
// POST /api/products → crear producto (requiere x-api-key)
// ---------------------------------------------------------------------
productsRouter.post("/", requireApiKey, async (req, res) => {
  const values = validateProduct(req.body);

  const { data, error } = await supabase.from("products").insert(values).select("*").single();
  if (error) {
    if (error.code === "23505") throw new HttpError(409, `Ya existe un producto con el slug "${values.slug}"`);
    if (error.code === "23514") throw new HttpError(400, "Algún valor no cumple las reglas de la base de datos", error.message);
    throw new HttpError(502, "No se pudo crear el producto", error.message);
  }

  res.status(201).location(`/api/products/${data.id}`).json({ product: toPublicProduct(data) });
});

// =====================================================================
// Validación del body de POST /api/products
// =====================================================================
const CATEGORIES = ["gummies", "energy", "hydration"];
const BENEFIT_ICONS = [
  "pill", "shield", "sun", "leaf", "bolt", "target", "trend", "refresh",
  "heart", "wave", "balance", "wind", "drop", "pulse", "gem", "trophy",
];
const HEX = /^#[0-9a-fA-F]{6}$/;

function slugify(text) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Comprueba y normaliza los datos. Lanza 400 con TODOS los errores juntos
 * para que el cliente pueda corregirlos de una vez.
 */
function validateProduct(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Envía un objeto JSON con Content-Type: application/json");
  }
  const errors = {};
  const text = (key, { min = 0, max = 200, required = false } = {}) => {
    const raw = body[key];
    if (raw === undefined || raw === null || raw === "") {
      if (required) errors[key] = "Es obligatorio";
      return null;
    }
    if (typeof raw !== "string") return (errors[key] = "Debe ser texto"), null;
    const value = raw.trim();
    if (value.length < min || value.length > max) errors[key] = `Debe tener entre ${min} y ${max} caracteres`;
    return value || null;
  };

  const name = text("name", { min: 2, max: 80, required: true });
  const flavor = text("flavor", { min: 2, max: 60, required: true });
  const type = text("type", { min: 2, max: 80, required: true });
  const presentation_label = text("presentation_label", { min: 2, max: 60, required: true });
  const description = text("description", { max: 400 });
  const presentation_detail = text("presentation_detail", { max: 80 });
  const badge = text("badge", { max: 40 });

  const category = body.category;
  if (!CATEGORIES.includes(category)) errors.category = `Debe ser: ${CATEGORIES.join(", ")}`;

  let price = null;
  if (body.price !== undefined && body.price !== null && body.price !== "") {
    // Se valida como texto: 19.9 * 100 = 1990.0000000000002 en coma flotante
    const raw = String(body.price).trim().replace(",", ".");
    price = Number(raw);
    if (!/^\d+(\.\d{1,2})?$/.test(raw) || !Number.isFinite(price)) {
      errors.price = "Debe ser un número ≥ 0 con hasta 2 decimales (ej. 29.90)";
    }
  }

  const image_url = text("image_url", { max: 500 });
  if (image_url && !/^https:\/\/\S+$/.test(image_url)) errors.image_url = "Debe ser una URL https://";

  const benefits = body.benefits ?? [];
  if (!Array.isArray(benefits) || benefits.length > 6) {
    errors.benefits = "Debe ser un array de hasta 6 elementos";
  } else if (benefits.some((b) => !b || !BENEFIT_ICONS.includes(b.icon) || typeof b.label !== "string" || !b.label.trim() || b.label.length > 40)) {
    errors.benefits = `Cada beneficio: { "icon": uno de [${BENEFIT_ICONS.join(", ")}], "label": texto de hasta 40 caracteres }`;
  }

  const accent_from = body.accent_from ?? "#FFA51F";
  const accent_to = body.accent_to ?? "#FF7A1A";
  if (!HEX.test(accent_from)) errors.accent_from = "Color hex, ej. #FFA51F";
  if (!HEX.test(accent_to)) errors.accent_to = "Color hex, ej. #FF7A1A";

  const slug = slugify(text("slug", { max: 80 }) ?? `${name ?? ""} ${flavor ?? ""}`);
  if (!errors.name && slug.length < 2) errors.slug = "No se pudo generar un slug válido";

  const sort_order = body.sort_order === undefined ? 100 : Number(body.sort_order);
  if (!Number.isInteger(sort_order) || sort_order < 0) errors.sort_order = "Debe ser un entero ≥ 0";

  if (Object.keys(errors).length) throw new HttpError(400, "Datos inválidos", errors);

  return {
    slug,
    name,
    description,
    type,
    badge,
    category,
    flavor,
    presentation_label,
    presentation_detail,
    benefits: benefits.map((b) => ({ icon: b.icon, label: b.label.trim() })),
    price,
    image_url,
    accent_from,
    accent_to,
    featured: body.featured === true,
    is_active: body.is_active !== false,
    sort_order,
  };
}
