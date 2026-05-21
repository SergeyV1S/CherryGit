import { lazy } from "react";
import { Outlet, createBrowserRouter } from "react-router";

import { ROUTES } from "@shared/constants";
import { createRoute } from "@shared/utils";

const ExampleScreen = lazy(() => import("@pages/example"));

const ChatsRoute = createRoute(ROUTES.chats, <ExampleScreen />);

export const router = createBrowserRouter([
  {
    element: (
      <>
        <div className=''>Layout ex.</div>
        <Outlet />
      </>
    ),
    children: [ChatsRoute]
  }
]);
