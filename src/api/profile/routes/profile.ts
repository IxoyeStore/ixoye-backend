export default {
  routes: [
    {
      method: "PUT",
      path: "/profile/me",
      handler: "profile.updateMe",
      config: {
        auth: {},
      },
    },
  ],
};
