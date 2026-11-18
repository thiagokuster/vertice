"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="py-10">
      <h1 className="text-xl font-semibold">Não foi possível carregar esta página.</h1>
      <button className="mt-3 rounded-lg border px-3 py-1.5 text-sm" onClick={reset} type="button">Tentar de novo</button>
    </div>
  );
}
