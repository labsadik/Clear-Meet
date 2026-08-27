import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, Link, createRootRouteWithContext, useRouter, HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "../lib/auth-context";

function NotFoundComponent() {
  return <div className="center-page"><div className="card narrow"><div className="eyebrow">CLEAR MEET</div><h1>Page not found</h1><p className="muted">That link does not point to an active Clear Meet page.</p><Link className="button primary" to="/">Go home</Link></div></div>;
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => { reportLovableError(error, { boundary: "tanstack_root_error_component" }); }, [error]);
  return <div className="center-page"><div className="card narrow"><div className="eyebrow">CLEAR MEET</div><h1>This page didn’t load</h1><p className="muted">{error.message || "Something went wrong."}</p><div className="actions"><button className="button primary" onClick={() => { router.invalidate(); reset(); }}>Try again</button><Link className="button secondary" to="/">Home</Link></div></div></div>;
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Clear Meet — Simple, secure video meetings" },
      { name: "description", content: "Clear Meet is a polished, light-first video conferencing platform powered by Supabase and VideoSDK." },
      { name: "theme-color", content: "#ffffff" },
      { property: "og:title", content: "Clear Meet — Simple, secure video meetings" },
      { property: "og:description", content: "Create and join real video meetings with a secure waiting room." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "stylesheet", href: appCss }, { rel: "icon", href: "/favicon.ico", type: "image/x-icon" }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return <html lang="en"><head><HeadContent /></head><body>{children}<Scripts /></body></html>;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return <QueryClientProvider client={queryClient}><AuthProvider><Outlet /></AuthProvider></QueryClientProvider>;
}
