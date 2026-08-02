import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import App from "./App";
import { PopoutConsole } from "./PopoutConsole";
import { PopoutPreview } from "./PopoutPreview";
import { isConsolePopout } from "./consolePopoutBridge";
import { isPreviewPopout } from "./popoutBridge";
import { initPwaUpdate } from "./pwaUpdate";

import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./app.css";

initPwaUpdate();

function Root() {
  if (isPreviewPopout()) return <PopoutPreview />;
  if (isConsolePopout()) return <PopoutConsole />;
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider
      defaultColorScheme="auto"
      theme={{
        primaryColor: "blue",
        fontFamily: '"Noto Sans JP", "Segoe UI", sans-serif',
        defaultRadius: "sm",
      }}
    >
      <Notifications
        position="top-center"
        zIndex={1000}
        containerWidth={380}
        limit={3}
        transitionDuration={280}
        notificationMaxHeight={140}
        classNames={{
          root: "ohyna-notifications",
          notification: "ohyna-notification",
        }}
      />
      <Root />
    </MantineProvider>
  </React.StrictMode>
);
