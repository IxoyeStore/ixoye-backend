import * as XLSX from "xlsx";
import path from "path";
import axios from "axios"; // Asegúrate de instalarlo: npm install axios

const createBaseSlug = (name: string): string => {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
};

async function generateUniqueSlug(name: string): Promise<string> {
  const slugBase = createBaseSlug(name);
  let slugFinal = slugBase;
  let counter = 1;
  let exists = true;

  while (exists) {
    const existing = await strapi.db.query("api::product.product").findOne({
      where: { slug: slugFinal },
    });

    if (!existing) {
      exists = false;
    } else {
      counter++;
      slugFinal = `${slugBase}-${counter}`;
    }
  }
  return slugFinal;
}

const cleanNumber = (value: any): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.]/g, "");
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

export default {
  async afterCreate(event: any) {
    const { result } = event;
    if (result.fileStatus === "pending") {
      await processExcelImport(result);
    }
  },

  async afterUpdate(event: any) {
    const { result } = event;
    if (result.fileStatus === "pending") {
      await processExcelImport(result);
    }
  },
};

async function processExcelImport(result: any) {
  const identifier = result.documentId || result.id;

  const entry: any = await strapi.documents("api::importer.importer").findOne({
    documentId: identifier,
    populate: ["excelFile"],
  });

  if (!entry?.excelFile?.url) return;

  try {
    await strapi.documents("api::importer.importer").update({
      documentId: identifier,
      data: { fileStatus: "processing" },
    });

    let dataRows: any[] = [];
    const fileUrl = entry.excelFile.url;

    if (fileUrl.startsWith("http")) {
      console.log(`🌐 Descargando archivo desde nube: ${fileUrl}`);
      const response = await axios.get(fileUrl, {
        responseType: "arraybuffer",
      });
      const workbook = XLSX.read(response.data, { type: "buffer" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      dataRows = XLSX.utils.sheet_to_json(worksheet);
    } else {
      const filePath = path.join(process.cwd(), "public", fileUrl);
      console.log(`📂 Leyendo archivo local: ${filePath}`);
      const workbook = XLSX.readFile(filePath);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      dataRows = XLSX.utils.sheet_to_json(worksheet);
    }

    const defaultCategory = await strapi.db
      .query("api::category.category")
      .findOne({
        where: { categoryName: "Sin Clasificar" },
      });

    // Helper: read a field trying multiple possible column name variants
    const col = (row: any, ...keys: string[]): any => {
      for (const k of keys) {
        if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
      }
      return undefined;
    };

    let processedCount = 0;

    for (const row of dataRows as any[]) {
      // Accept both original lowercase keys AND bulk-editor Spanish label keys
      const code        = String(col(row, "codigo",       "Código",          "CODIGO")        || "").trim();
      const description = String(col(row, "descripcion",  "Nombre",          "DESCRIPCION",
                                        "nombre",         "productName")     || "").trim();
      const rawImages   = col(row, "images", "imagen", "Imagenes") || "";
      let imagesArray: string[] = [];

      if (rawImages) {
        try {
          if (typeof rawImages === "string" && rawImages.startsWith("[")) {
            imagesArray = JSON.parse(rawImages);
          } else {
            imagesArray = String(rawImages).split(",").map((img: string) => img.trim());
          }
        } catch {
          imagesArray = [String(rawImages).trim()];
        }
      }

      if (!code || !description) continue;

      const categoryName = String(col(row, "categoria", "Categoría", "categoria") || "").trim();
      let categoryId = null;
      if (categoryName) {
        const foundCategory = await strapi.db
          .query("api::category.category")
          .findOne({ where: { categoryName } });
        if (foundCategory) categoryId = foundCategory.id;
      }
      if (!categoryId && defaultCategory) categoryId = defaultCategory.id;

      const rawPrice          = col(row, "precio",          "Precio Público",  "precio_publico");
      const rawWholesalePrice = col(row, "precioMayoreo",   "Precio Mayoreo",  "precio_mayoreo");
      const rawStock          = col(row, "stock",           "Stock");
      const rawDept           = col(row, "departamento",    "Departamento");
      const rawSubDept        = col(row, "subDepartamento", "Sub-Departamento");
      const rawType           = col(row, "tipoProducto",    "Tipo");
      const rawBrand          = col(row, "marca",           "Marca",           "brand");
      const rawSeries         = col(row, "series",          "Series");
      const rawActive         = col(row, "activo",          "Activo (TRUE/FALSE)");
      const rawFeatured       = col(row, "destacado",       "Destacado (TRUE/FALSE)");
      const rawShipping       = col(row, "envioGratis",     "Envio Gratis (TRUE/FALSE)");
      const rawDescLarga      = col(row, "descripcionLarga","Descripción");

      const parseBool = (v: any): boolean | undefined => {
        if (v === undefined || v === null || v === "") return undefined;
        return String(v).toUpperCase() === "TRUE";
      };

      const productPayload: any = {
        productName: description,
        description: rawDescLarga ? String(rawDescLarga).trim() : description,
        price:          cleanNumber(rawPrice ?? 0),
        wholesalePrice: rawWholesalePrice !== undefined ? cleanNumber(rawWholesalePrice) : undefined,
        stock:          Math.floor(cleanNumber(rawStock ?? 0)),
        code,
        department:    String(rawDept    || "").trim(),
        subDepartment: String(rawSubDept || "").trim(),
        productType:   String(rawType    || "").trim(),
        brand:         String(rawBrand   || "").trim(),
        series:        String(rawSeries  || "").trim(),
        active:      parseBool(rawActive)    ?? true,
        isFeatured:  parseBool(rawFeatured)  ?? undefined,
        freeShipping: parseBool(rawShipping) ?? undefined,
        category: categoryId ? Number(categoryId) : null,
        images: imagesArray,
      };

      // Remove undefined optional fields to avoid overwriting existing values
      if (productPayload.wholesalePrice === undefined) delete productPayload.wholesalePrice;
      if (productPayload.isFeatured     === undefined) delete productPayload.isFeatured;
      if (productPayload.freeShipping   === undefined) delete productPayload.freeShipping;

      const existingProduct = await strapi.db
        .query("api::product.product")
        .findOne({ where: { code: code } });

      if (existingProduct) {
        await strapi.documents("api::product.product").update({
          documentId: existingProduct.documentId,
          data: productPayload,
        });
        console.log(`🔄 ACTUALIZADO: ${code}`);
      } else {
        productPayload.slug = await generateUniqueSlug(description);
        productPayload.isFeatured = false;
        await strapi.documents("api::product.product").create({
          data: productPayload,
        });
        console.log(`✨ CREADO: ${code}`);
      }
      processedCount++;
    }

    await strapi.documents("api::importer.importer").update({
      documentId: identifier,
      data: { fileStatus: "completed" },
    });
    console.log(`✅ Importación exitosa: ${processedCount} productos.`);
  } catch (error) {
    console.error("❌ Error en el importador:", error);
    await strapi.documents("api::importer.importer").update({
      documentId: identifier,
      data: { fileStatus: "completed" },
    });
  }
}
