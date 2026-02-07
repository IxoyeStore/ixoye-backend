import * as XLSX from "xlsx";
import path from "path";

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
  const entry: any = await strapi.documents("api::importer.importer").findOne({
    documentId: result.documentId,
    populate: ["excelFile"],
  });

  if (!entry?.excelFile?.url) return;

  try {
    await strapi.documents("api::importer.importer").update({
      documentId: result.documentId,
      data: { fileStatus: "processing" },
    });

    const filePath = path.join(process.cwd(), "public", entry.excelFile.url);
    const workbook = XLSX.readFile(filePath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const dataRows = XLSX.utils.sheet_to_json(worksheet);

    const defaultCategory = await strapi.db
      .query("api::category.category")
      .findOne({
        where: { categoryName: "Sin Clasificar" },
      });

    let processedCount = 0;

    for (const row of dataRows as any[]) {
      const code = String(row["codigo"] || "").trim();
      const description = String(row["descripcion"] || "").trim();

      if (!code || !description) continue;

      let categoryId = null;
      if (row["categoria"]) {
        const foundCategory = await strapi.db
          .query("api::category.category")
          .findOne({
            where: { categoryName: String(row["categoria"]).trim() },
          });
        if (foundCategory) categoryId = foundCategory.id;
      }
      if (!categoryId && defaultCategory) categoryId = defaultCategory.id;

      const productPayload: any = {
        productName: description,
        description: description,
        price: cleanNumber(row["precio"]),
        wholesalePrice: cleanNumber(row["precioMayoreo"]),
        stock: Math.floor(cleanNumber(row["stock"] || 0)),
        code: code,
        department: String(row["departamento"] || "").trim(),
        subDepartment: String(row["subDepartamento"] || "").trim(),
        productType: String(row["tipoProducto"] || "").trim(),
        brand: String(row["marca"] || row["brand"] || "").trim(),
        series: String(row["series"] || "").trim(),
        active: true,
        category: categoryId ? Number(categoryId) : null,
      };

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
      documentId: result.documentId,
      data: { fileStatus: "completed" },
    });
    console.log(`✅ Importación exitosa: ${processedCount} productos.`);
  } catch (error) {
    console.error("❌ Error en el importador:", error);
    await strapi.documents("api::importer.importer").update({
      documentId: result.documentId,
      data: { fileStatus: "completed" },
    });
  }
}
