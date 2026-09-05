/**
 * ═══════════════════════════════════════════════════════════════
 *  PATRÓN 3 — EVALUATOR-OPTIMIZER (escritor y crítico)
 * ═══════════════════════════════════════════════════════════════
 *
 *              ┌──────────────────────────────┐
 *              ▼                              │
 *   borrador ──▶ 🧐 el crítico puntúa ──▶ ✍️ reescribir
 *              │
 *              └──▶ ✅ aprobado (nota alta) o ⛔ límite de rondas
 *
 *  Idea clave: dos roles del mismo modelo. Uno escribe, otro
 *  evalúa con una rúbrica y devuelve problemas CONCRETOS. El
 *  escritor corrige solo esos problemas. Se repite hasta que el
 *  crítico aprueba o se agotan las rondas (¡controla el coste!).
 *
 *  Ejemplo: pulir la descripción de un producto.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import {
  DEFAULT_MODEL,
  MAX_TOKENS,
  isDirectRun,
  makeClient,
  escribirPaso,
  textoDe,
} from "./common.js";

// El crítico responde siempre con esta estructura.
export const CriticaSchema = z.object({
  nota: z.number().min(0).max(10),
  aprobado: z.boolean(),
  problemas: z.array(z.string()),
});


// ── El crítico: evalúa el texto contra la rúbrica ──────────────
async function criticar(client: Anthropic, texto: string, rubrica: string[]) {
  const respuesta = await client.messages.parse({
    model: DEFAULT_MODEL,
    max_tokens: MAX_TOKENS,
    system:
      "Eres un editor muy exigente. Evalúa el texto SOLO contra " +
      "la rúbrica y lista problemas concretos y accionables.",
    messages: [
      {
        role: "user",
        content: `Rúbrica: ${JSON.stringify(rubrica)}\n\nTexto:\n${texto}`,
      },
    ],
    output_config: {
      effort: "low",
      format: zodOutputFormat(CriticaSchema),
    },
  });

  const critica = respuesta.parsed_output;
  if (!critica) throw new Error("El modelo no devolvió una crítica válida");
  return critica;
}

// ── El escritor: corrige solo lo que señaló el crítico ─────────
async function reescribir(
  client: Anthropic,
  texto: string,
  problemas: string[]
) {
  const respuesta = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: MAX_TOKENS,
    output_config: { effort: "low" },
    system:
      "Reescribe el texto corrigiendo ÚNICAMENTE los problemas " +
      "indicados. Conserva todo lo que ya funciona. Devuelve solo " +
      "el texto reescrito, sin comentarios ni explicaciones.",
    messages: [
      {
        role: "user",
        content: `Problemas: ${JSON.stringify(problemas)}\n\nTexto:\n${texto}`,
      },
    ],
  });
  return textoDe(respuesta);
}

// ── El bucle: criticar → ¿aprobado? → reescribir → repetir ─────
export async function mejorarConCritica(
  borradorInicial: string,
  rubrica: string[],
  client: Anthropic = makeClient(),
  maxRondas = 3,
  notaMinima = 8
) {
  let texto = borradorInicial;
   const criticas: Array<z.infer<typeof CriticaSchema>>= [];

  for (let ronda = 1; ronda <= maxRondas; ronda += 1) {
    escribirPaso("🧐", `Ronda ${ronda}: el crítico evalúa el texto…`);
    const critica = await criticar(client, texto, rubrica);
    criticas.push(critica);

    const sello = critica.aprobado && critica.nota >= notaMinima ? "✅" : "❌";
    console.log(`   Nota: ${critica.nota}/10 ${sello}`);
    critica.problemas.forEach((p) => console.log(`   · ${p}`));

    if (critica.aprobado && critica.nota >= notaMinima) {
      return { texto, rondas: ronda, criticas, aprobado: true };
    }

    escribirPaso("✍️", "El escritor corrige los problemas señalados…");
    texto = await reescribir(client, texto, critica.problemas);
    console.log(`   ${texto}`);
  }

  // Se agotaron las rondas: devolvemos la mejor versión que hay.
  return { texto, rondas: maxRondas, criticas, aprobado: false };
}

async function main(): Promise<void> {
  const resultado = await mejorarConCritica(
    "Esta mochila es buena y tiene cosas útiles para llevar cosas.",
    [
      "menciona un beneficio concreto",
      "evita palabras vacías como 'cosas'",
      "máximo 30 palabras",
      "Menciona el nombre de la marca del producto",
    ]
  );
  escribirPaso("✅", `Texto final (${resultado.rondas} rondas)`);
  console.log(resultado.texto);
}

if (isDirectRun(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
