import Link from "next/link";

/*
  Shown by the service worker when a page is requested offline and was never
  cached. Field screens themselves are cached and never land here.
*/
export default function OfflinePage() {
  return (
    <main className="page-narrow center">
      <h1>Offline</h1>
      <p className="muted">
        This page is not available without a connection. Downloaded buildings still open from the
        Buildings list.
      </p>
      <Link className="btn btn-primary" href="/">
        Back to the app
      </Link>
    </main>
  );
}
