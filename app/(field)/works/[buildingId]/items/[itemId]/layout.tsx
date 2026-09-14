import { SHELL_ID } from "@/lib/fieldRoute";

/*
  Server layout with one placeholder param, so Next prerenders a static shell
  of this client rendered route. The service worker serves that shell offline
  for any real id (see lib/fieldRoute.ts). Other ids render on demand.
*/
export function generateStaticParams() {
  return [{ itemId: SHELL_ID }];
}

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return children;
}
