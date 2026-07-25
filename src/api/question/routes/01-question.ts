export default {
  routes: [
    {
      method: "GET",
      path: "/questions/mine",
      handler: "question.mine",
      config: {
        policies: [],
      },
    },
  ],
};
