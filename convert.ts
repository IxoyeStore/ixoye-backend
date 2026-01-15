import * as XLSX from "xlsx";
import axios from "axios";

const EXCEL_FILE = "inventario.xlsx";
const STRAPI_API_URL = "http://localhost:1337/api/products";
const STRAPI_TOKEN =
  "56a821478052309d706656fb9e4b8ff6362a41ae232d804360c86f351e85adc3fd118fb9b773156381b7d258904ac83ea76368ba41c461ecf4ae62955ca86020d9195c01fd813102d7fc3f26f2c08fac1afb38c3a548361e836c1b27c048d46967915873639dd653a03b0754adb4999b2ae7e48dab691260f5d600057ba1f528";

interface FilaProducto {
  Nombre: string;
  Descripcion: string;
  Precio: number;
  Stock: number;
}

async function generarSlugUnico(nombre: string): Promise<string> {
  const slugBase = nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  let slugFinal = slugBase;
  let contador = 1;
  let existe = true;

  while (existe) {
    try {
      const response = await axios.get(
        `${STRAPI_API_URL}?filters[slug][$eq]=${slugFinal}`,
        {
          headers: { Authorization: `Bearer ${STRAPI_TOKEN}` },
        }
      );

      if (response.data.data.length === 0) {
        existe = false;
      } else {
        contador++;
        slugFinal = `${slugBase}-${contador}`;
      }
    } catch (error) {
      console.warn(
        `Error verificando slug "${slugFinal}", se intentará usar el base.`
      );
      existe = false;
    }
  }
  return slugFinal;
}

async function importar() {
  try {
    console.log("📖 Leyendo archivo Excel...");
    const workbook = XLSX.readFile(EXCEL_FILE);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const datos = XLSX.utils.sheet_to_json<FilaProducto>(worksheet);

    console.log(`Se encontraron ${datos.length} productos. Iniciando...\n`);

    for (const fila of datos) {
      if (!fila.Nombre) continue;

      try {
        const slugValido = await generarSlugUnico(fila.Nombre);

        const payload = {
          data: {
            productName: fila.Nombre,
            description: fila.Descripcion || "Sin descripción",
            price: Number(fila.Precio) || 0,
            stock: Number(fila.Stock) || 0,
            slug: slugValido,
            active: true,
            isFeatured: false,
          },
        };

        await axios.post(STRAPI_API_URL, payload, {
          headers: {
            Authorization: `Bearer ${STRAPI_TOKEN}`,
            "Content-Type": "application/json",
          },
        });

        console.log(`✅ [OK] ${fila.Nombre} (Slug: ${slugValido})`);
      } catch (error: any) {
        const errorDetail =
          error.response?.data?.error?.message || error.message;
        console.error(`❌ [ERROR] en "${fila.Nombre}": ${errorDetail}`);
      }
    }

    console.log("\nImportación masiva completada");
  } catch (err) {
    console.error("Error:", err);
  }
}

importar();
