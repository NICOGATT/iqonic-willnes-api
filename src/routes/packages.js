import { Router } from "express";

import { config } from "../config.js";
import { HttpError } from "../lib/http.js";
import { isUuid } from "../lib/products.js";
import { supabase } from "../lib/supabase.js";
import { whatsAppUrl } from "../lib/whatsapp.js";

export const packagesRouter = Router();

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// ---------------------------------------------------------------------
// GET /api/packages → paquetes visibles con su contenido
// ---------------------------------------------------------------------
packagesRouter.get("/", async (_req, res) => {
  const { data, error } = await supabase
    .from("packages_with_items")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw packagesError(error);

  const activeIds = await activeProductIds();
  const packages = data.map((row) => toPublicPackage(row, activeIds)).filter((p) => p.items.length > 0);
  res.json({ count: packages.length, packages });
});

// ---------------------------------------------------------------------
// GET /api/packages/:idOrSlug → un paquete
// ---------------------------------------------------------------------
packagesRouter.get("/:idOrSlug", async (req, res) => {
  const key = String(req.params.idOrSlug ?? "").trim();
  if (!isUuid(key) && !SLUG_RE.test(key)) throw new HttpError(400, "Identificador de paquete inválido");

  const { data, error } = await supabase
    .from("packages_with_items")
    .select("*")
    .eq(isUuid(key) ? "id" : "slug", key)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw packagesError(error);

  const pkg = data && toPublicPackage(data, await activeProductIds());
  if (!pkg || pkg.items.length === 0) throw new HttpError(404, "Paquete no encontrado");
  res.json({ package: pkg });
});

// =====================================================================

function packagesError(error) {
  if (error.code === "PGRST205" || error.code === "42P01") {
    return new HttpError(503, "Los paquetes no están disponibles (falta la migración 0003_packages.sql)");
  }
  return new HttpError(502, "No se pudieron obtener los paquetes", error.message);
}

/**
 * La API usa la service role (salta RLS), así que filtra a mano lo que la
 * tienda no muestra: los productos ocultos no aparecen dentro del paquete.
 */
async function activeProductIds() {
  const { data, error } = await supabase.from("products").select("id").eq("is_active", true);
  if (error) throw new HttpError(502, "No se pudieron obtener los productos", error.message);
  return new Set(data.map((p) => p.id));
}

/** Fila de packages_with_items → JSON público (mismo estilo que /api/products). */
function toPublicPackage(row, activeIds) {
  const items = (row.items ?? [])
    .filter((i) => activeIds.has(i.product_id))
    .map((i) => ({
      product_id: i.product_id,
      slug: i.slug,
      name: i.name,
      flavor: i.flavor,
      quantity: i.quantity,
      unit_price: i.unit_price === null ? null : Number(i.unit_price),
    }));

  // Si se ocultó algún producto, el "precio por separado" ya no es comparable
  const complete = items.length === (row.items ?? []).length;
  const regularPrice = complete && row.regular_price !== null ? Number(row.regular_price) : null;
  const price = Number(row.price);
  const savings = regularPrice !== null && regularPrice > price ? Number((regularPrice - price).toFixed(2)) : null;
  const contents = items.map((i) => `${i.quantity}× ${i.name} ${i.flavor}`).join(" + ");

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    badge: row.badge,
    price,
    currency: config.stripe.currency,
    regular_price: regularPrice,
    savings,
    image_url: row.image_url,
    featured: row.featured,
    item_count: items.reduce((n, i) => n + i.quantity, 0),
    items,
    whatsapp_url: whatsAppUrl(`Hola, quiero el paquete: ${row.name} (${contents})`),
  };
}
