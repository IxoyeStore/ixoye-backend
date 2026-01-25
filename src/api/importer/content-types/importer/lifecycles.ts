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
  const entry: any = await strapi.entityService.findOne(
    "api::importer.importer",
    result.id,
    { populate: ["excelFile"] },
  );

  if (!entry?.excelFile?.url) return;

  try {
    await strapi.entityService.update("api::importer.importer", result.id, {
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
      const excelDept = String(row["departamento"] || "").trim();
      const excelSubDept = String(row["subDepartamento"] || "").trim();
      const excelSeries = String(row["series"] || "").trim();
      const excelCategory = String(row["categoria"] || "").trim();
      const excelProductType = String(row["tipoProducto"] || "").trim();
      const excelBrand = String(row["marca"] || row["brand"] || "").trim();
      const imageName = String(row["imagen"] || "").trim();

      if (!code || !description) continue;

      let categoryId = null;
      if (excelCategory) {
        const foundCategory = await strapi.db
          .query("api::category.category")
          .findOne({
            where: { categoryName: excelCategory },
          });
        if (foundCategory) categoryId = foundCategory.id;
      }
      if (!categoryId && defaultCategory) categoryId = defaultCategory.id;

      let imageId = null;
      if (imageName) {
        const files = await strapi.db.query("plugin::upload.file").findMany({
          where: {
            $or: [
              { name: { $contains: imageName } },
              { hash: { $contains: imageName.split(".")[0] } },
            ],
          },
        });
        if (files && files.length > 0) imageId = files[0].id;
      }

      const productPayload: any = {
        productName: description,
        description: description,
        price: cleanNumber(row["precio"]),
        wholesalePrice: cleanNumber(row["precioMayoreo"]),
        stock: Math.floor(cleanNumber(row["stock"] || 0)),
        code: code,
        department: excelDept,
        subDepartment: excelSubDept,
        productType: excelProductType,
        brand: excelBrand,
        series: excelSeries,
        active: true,
        category: categoryId ? Number(categoryId) : null,
      };

      if (imageId) productPayload.images = [imageId];

      const existingProduct = await strapi.db
        .query("api::product.product")
        .findOne({ where: { code: code } });

      if (existingProduct) {
        await strapi.entityService.update(
          "api::product.product",
          existingProduct.id,
          { data: productPayload },
        );
        console.log(`🔄 ACTUALIZADO: ${code}`);
      } else {
        productPayload.slug = await generateUniqueSlug(description);
        productPayload.isFeatured = false;
        await strapi.entityService.create("api::product.product", {
          data: productPayload,
        });
        console.log(`✨ CREADO: ${code}`);
      }
      processedCount++;
    }

    await strapi.entityService.update("api::importer.importer", result.id, {
      data: { fileStatus: "completed" },
    });
    console.log(
      `✅ Importación exitosa: ${processedCount} productos procesados.`,
    );
  } catch (error) {
    console.error("❌ Error en el importador:", error);
    await strapi.entityService.update("api::importer.importer", result.id, {
      data: { fileStatus: "completed" },
    });
  }
}
