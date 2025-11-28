import { APP_NAME, APP_VERSION } from "@cognobserve/shared";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">{APP_NAME}</h1>
        <p className="text-gray-600 mb-2">AI Observability Platform 1</p>
        <p className="text-sm text-gray-400">v{APP_VERSION}</p>
      </div>
    </main>
  );
}
