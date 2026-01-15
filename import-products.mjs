import axios from "axios";
import fs from "fs";

const STRAPI_API_URL = "http://localhost:1337/api/products";
const STRAPI_TOKEN =
  "56a821478052309d706656fb9e4b8ff6362a41ae232d804360c86f351e85adc3fd118fb9b773156381b7d258904ac83ea76368ba41c461ecf4ae62955ca86020d9195c01fd813102d7fc3f26f2c08fac1afb38c3a548361e836c1b27c048d46967915873639dd653a03b0754adb4999b2ae7e48dab691260f5d600057ba1f528";

const products = JSON.parse(fs.readFileSync("./productos.json", "utf-8"));

async function importProducts() {
  console.log(`Iniciando importación de ${products.length} productos...`);

  for (const product of products) {
    try {
      const response = await axios.post(
        STRAPI_API_URL,
        { data: product },
        { headers: { Authorization: `Bearer ${STRAPI_TOKEN}` } }
      );
      console.log(`✅ Importado: ${product.productName}`);
    } catch (error) {
      console.error(
        `❌ Error en ${product.productName}:`,
        error.response?.data || error.message
      );
    }
  }
  console.log("Proceso finalizado.");
}

importProducts();
