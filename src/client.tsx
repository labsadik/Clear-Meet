import { StartClient } from "@tanstack/react-start/client";
import { hydrateRoot } from "react-dom/client";

// VideoSDK's MeetingProvider owns an internal async join effect. React 19
// StrictMode intentionally re-runs effects in development, which can make
// VideoSDK receive a second join request while the first is still in flight.
// Use a custom TanStack Start client entry without StrictMode so the provider
// lifecycle is mounted exactly once, matching production behavior.
hydrateRoot(document, <StartClient />);
