import { Link, Outlet, Route, Routes } from "react-router";
import NotesPage from "@/pages/notes-page";
import NotFoundPage from "@/pages/not-found-page";

function Layout() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        <Link to="/" className="rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
          __APP_TITLE__
        </Link>
      </h1>
      <Outlet />
    </main>
  );
}

/** Routes only — the router and the query client are provided by main.tsx (and by the tests). */
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<NotesPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
