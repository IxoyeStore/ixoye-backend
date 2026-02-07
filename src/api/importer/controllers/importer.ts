import { factories } from "@strapi/strapi";

export default factories.createCoreController(
  "api::importer.importer",
  ({ strapi }) => ({
    async process(ctx) {
      try {
        const { files } = ctx.request;
        if (!files || !files.excelFile) {
          return ctx.badRequest(
            'Por favor sube un archivo en el campo "excelFile"',
          );
        }

        const newEntry = await strapi
          .documents("api::importer.importer")
          .create({
            data: {
              fileStatus: "processing",
              publishedAt: new Date(),
            },
            files: {
              excelFile: files.excelFile,
            },
          });

        console.log(
          `Procesando archivo para la entrada: ${newEntry.documentId}`,
        );

        await strapi.documents("api::importer.importer").update({
          documentId: newEntry.documentId,
          data: {
            fileStatus: "completed",
          },
        });

        return ctx.send({
          message: "Importación iniciada con éxito",
          documentId: newEntry.documentId,
          status: "completed",
        });
      } catch (error) {
        console.error("Error en Importer:", error);
        return ctx.internalServerError(
          "Error interno al procesar la importación",
        );
      }
    },
  }),
);
