class Routes {
  index = "/" as const;
  chats = this.index.concat("chats") as "/chats";
}

export const ROUTES = new Routes();
