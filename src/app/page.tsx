import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BrainCircuit,
  Database,
  GitBranch,
  Network,
  Lock,
  Search,
  Sparkles,
  SquareKanban,
} from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export default async function Home() {
  const user = await getSessionUser();
  if (user) redirect("/vaults");

  return (
    <main className="bg-grain min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--accent)] text-sm font-bold text-white">
            G
          </span>
          <span className="font-display text-xl tracking-tight">GRANATE</span>
        </div>
        <nav className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login" className="btn btn-ghost">
            Entrar
          </Link>
          <Link href="/register" className="btn btn-primary">
            Crear cuenta
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 px-6 pb-16 pt-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pt-20">
        <div>
          <div className="chip mb-6">
            <Sparkles size={13} className="text-[var(--gold)]" />
            Markdown · Neon · LLM · Vercel
          </div>
          <h1 className="font-display text-5xl leading-[1.02] sm:text-6xl lg:text-7xl">
            Tu bóveda de notas,
            <span className="block text-[var(--accent-2)]">en cualquier terminal.</span>
          </h1>
          <p className="mt-7 max-w-xl text-[var(--text-soft)] sm:text-lg">
            Una experiencia tipo Obsidian en la web: carpetas, wikilinks, backlinks, grafo, canvas
            y bases. Guardada en Neon, accesible desde el navegador, la CLI o el móvil, con un LLM
            que revisa, ordena, indexa y responde sobre tus documentos.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/register" className="btn btn-primary px-5 py-3 text-base">
              Empezar gratis <ArrowRight size={17} />
            </Link>
            <Link href="/login" className="btn px-5 py-3 text-base">
              Ya tengo cuenta
            </Link>
          </div>
          <p className="mt-4 flex items-center gap-2 text-xs text-[var(--muted)]">
            <Lock size={13} /> Login con email o Google · registro abierto
          </p>
        </div>

        <div className="relative">
          <div className="absolute -inset-6 rounded-[28px] bg-[radial-gradient(circle_at_70%_20%,rgba(178,58,72,0.22),transparent_60%)] blur-2xl" />
          <div className="panel relative overflow-hidden shadow-2xl">
            <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--panel-2)] px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--gold)]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--green)]" />
              <span className="ml-3 text-xs text-[var(--muted)]">Bienvenido.md</span>
              <span className="ml-auto chip">guardado · hace 1 s</span>
            </div>
            <div className="grid grid-cols-[150px_1fr]">
              <div className="border-r border-[var(--border)] p-3 text-xs text-[var(--muted)]">
                <div className="mb-3 text-[var(--text-soft)]">10 - TecRural</div>
                <div className="space-y-2">
                  {["Producto y estrategia", "Auditorías y mejoras", "Guías", "Agentes y prompts"].map(
                    (item) => (
                      <div key={item} className="truncate rounded px-2 py-1 hover:bg-[var(--panel-2)]">
                        {item}
                      </div>
                    ),
                  )}
                </div>
                <div className="mt-5 text-[var(--text-soft)]">Bienvenido</div>
              </div>
              <div className="p-6">
                <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
                  nota
                </div>
                <h3 className="font-display text-2xl">Bienvenido a GRANATE</h3>
                <p className="mt-4 text-sm leading-7 text-[var(--text-soft)]">
                  Tu conocimiento deja de estar atrapado en un escritorio. Aquí cada nota es
                  Markdown puro y cada enlace es una arista del grafo.
                </p>
                <div className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-4">
                  <div className="flex items-center gap-2 text-xs text-[var(--gold)]">
                    <BrainCircuit size={15} /> Pregunta a la bóveda
                  </div>
                  <p className="mt-2 text-sm text-[var(--text-soft)]">
                    «¿Qué decisiones tomamos sobre el sensor de humedad?» →
                  </p>
                  <p className="mt-2 text-xs leading-6 text-[var(--muted)]">
                    Según [1] y [3], se optó por el sensor capacitivo DIY con calibración en campo y
                    se descartó el AD5933 para la versión de bajo coste…
                  </p>
                </div>
                <div className="mt-4 flex gap-2 text-[10px] text-[var(--muted)]">
                  <span className="chip">#sensores</span>
                  <span className="chip">#riego</span>
                  <span className="chip">12 backlinks</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-[var(--border)] bg-[var(--bg-soft)]">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 py-12 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: Database,
              title: "Neon como fuente de verdad",
              text: "Notas Markdown y metadatos en Postgres. Exporta la bóveda entera en ZIP cuando quieras.",
            },
            {
              icon: Search,
              title: "Búsqueda híbrida",
              text: "Full-text en español + embeddings con pgvector. Encuentra por significado, no solo por palabra.",
            },
            {
              icon: Network,
              title: "Grafo y backlinks",
              text: "Resolución de wikilinks estilo Obsidian, enlaces entrantes y vista de grafo navegable.",
            },
            {
              icon: BrainCircuit,
              title: "LLM con citas",
              text: "Revisa, resume, reordena y genera índices. Siempre con diff antes de aplicar cambios.",
            },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="panel p-5">
              <Icon size={20} className="text-[var(--accent-2)]" />
              <h3 className="mt-3 text-sm font-semibold">{title}</h3>
              <p className="mt-1.5 text-xs leading-6 text-[var(--muted)]">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-8 lg:grid-cols-3">
          <div>
            <SquareKanban size={22} className="text-[var(--gold)]" />
            <h3 className="mt-3 font-display text-xl">Canvas y Bases</h3>
            <p className="mt-2 text-sm leading-7 text-[var(--text-soft)]">
              Lienzos infinitos con el formato abierto JSON Canvas y vistas de tabla sobre
              propiedades de tus notas, con filtros y agrupación.
            </p>
          </div>
          <div>
            <GitBranch size={22} className="text-[var(--gold)]" />
            <h3 className="mt-3 font-display text-xl">Tu CLI, tus reglas</h3>
            <p className="mt-2 text-sm leading-7 text-[var(--text-soft)]">
              <code className="rounded bg-[var(--panel-2)] px-1.5 py-0.5 text-xs">granate search</code>{" "}
              y{" "}
              <code className="rounded bg-[var(--panel-2)] px-1.5 py-0.5 text-xs">granate ask</code>{" "}
              desde cualquier terminal con un token personal.
            </p>
          </div>
          <div>
            <Sparkles size={22} className="text-[var(--gold)]" />
            <h3 className="mt-3 font-display text-xl">Sin lock-in</h3>
            <p className="mt-2 text-sm leading-7 text-[var(--text-soft)]">
              Importa tu bóveda de Obsidian conservando rutas, frontmatter, enlaces y adjuntos.
              Exporta cuando quieras: el Markdown es tuyo.
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-[var(--border)] px-6 py-8 text-center text-xs text-[var(--muted)]">
        GRANATE · bóveda Markdown con Neon, Vercel y un LLM que no escribe sin permiso.
      </footer>
    </main>
  );
}
