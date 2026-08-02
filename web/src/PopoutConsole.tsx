import { useEffect, useRef, useState } from "react";
import { AppShell, Box } from "@mantine/core";
import { MessageConsole } from "./MessageConsole";
import {
  createConsolePopoutChannel,
  type ConsolePopoutAnalysis,
  type ConsolePopoutMessage,
  type ConsolePopoutPreview,
} from "./consolePopoutBridge";
import { APP_NAME } from "./brand";
import { requestConsoleSync } from "./messageConsoleStore";

/** 子窓: メインと同期したコンソール（問題／出力） */
export function PopoutConsole() {
  const [analysis, setAnalysis] = useState<ConsolePopoutAnalysis>({
    pending: false,
    diagnostics: [],
  });
  const [preview, setPreview] = useState<ConsolePopoutPreview>({
    state: "idle",
  });
  const channelRef = useRef<ReturnType<
    typeof createConsolePopoutChannel
  > | null>(null);

  useEffect(() => {
    document.title = `${APP_NAME} — コンソール`;
    requestConsoleSync();
    const ch = createConsolePopoutChannel((msg: ConsolePopoutMessage) => {
      if (msg.type === "state") {
        setAnalysis(msg.analysis);
        setPreview(msg.preview);
      }
      if (msg.type === "dock") {
        window.close();
      }
    });
    channelRef.current = ch;
    ch.post({ type: "hello" });
    ch.post({ type: "request-state" });

    const onUnload = () => {
      ch.post({ type: "bye" });
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      ch.post({ type: "bye" });
      ch.close();
    };
  }, []);

  const dock = () => {
    channelRef.current?.post({ type: "dock" });
    window.close();
  };

  const jumpLine = (line: number) => {
    channelRef.current?.post({ type: "jump-line", line });
    try {
      window.opener?.focus();
    } catch {
      /* ignore */
    }
  };

  return (
    <AppShell className="ohyna-app ohyna-popout ohyna-console-popout" padding={0}>
      <AppShell.Main>
        <Box className="ohyna-pane" h="100%" mih={0}>
          <MessageConsole
            expanded
            fill
            analysis={analysis}
            preview={preview}
            onJumpLine={jumpLine}
            onDockPopOut={dock}
            windowMode
          />
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}
