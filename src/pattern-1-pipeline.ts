/**
 * ═══════════════════════════════════════════════════════════════
 *  PATRÓN 1 — PIPELINE (cadena de montaje)
 * ═══════════════════════════════════════════════════════════════
 *
 *            ┌─────────────┐   ┌──────────────┐   ┌────────────┐
 *   tema ──▶ │ 1. esquema  │──▶│ 2. borrador  │──▶│ 3. título  │
 *            └─────────────┘   └──────────────┘   └────────────┘
 *
 *  Idea clave: en vez de pedirle TODO al modelo de golpe, se
 *  divide el trabajo en pasos pequeños. La salida de cada paso
 *  es la entrada del siguiente, como en una cadena de montaje.
 *
 *  Ejemplo: escribir un post de blog en tres pasos.
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

// El esquema Zod obliga al modelo a devolver JSON con esta forma
// exacta: tres puntos, ni más ni menos (Structured Outputs).
const EsquemaSchema = z.object({
  puntos: z.array(z.string()).length(3),
});

// ── Paso 1: de un tema a un esquema de tres puntos ─────────────
async function resumirElTemaEnPuntos(client: Anthropic, tema: string) {
  // `messages.parse` valida la respuesta contra el esquema Zod.
  const respuesta = await client.messages.parse({
    model: DEFAULT_MODEL,
    max_tokens: MAX_TOKENS,
    system:
      "Eres redactor de un blog técnico. Resume el tema en " +
      "exactamente tres puntos clave, uno por frase.",
    messages: [{ role: "user", content: `Tema del post: ${tema}` }],
    output_config: {
      effort: "low",
      format: zodOutputFormat(EsquemaSchema),
    },
  });

  const esquema = respuesta.parsed_output;
  if (!esquema) throw new Error("El modelo no devolvió un esquema válido");
  return esquema;
}

// ── Paso 2: del esquema a un borrador ──────────────────────────
async function escribirBorrador(
  client: Anthropic,
  tema: string,
  puntos: string[]
) {
  const respuesta = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: MAX_TOKENS,
    output_config: { effort: "low" },
    system:
      "Escribe un post de blog breve (unas 120 palabras) que " +
      "desarrolle los tres puntos del esquema, en ese orden.",
    messages: [
      {
        role: "user",
        content: `Tema: ${tema}\nEsquema: ${JSON.stringify(puntos)}`,
      },
    ],
  });
  return textoDe(respuesta);
}

// ── Paso 3: del borrador a un título llamativo ─────────────────
async function inventarTitulo(
  client: Anthropic,
  borrador: string
): Promise<string> {
  const respuesta = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: MAX_TOKENS,
    output_config: { effort: "low" },
    system:
      "Inventa un único título llamativo para este post. " +
      "Devuelve solo el título, sin comillas.",
    messages: [{ role: "user", content: borrador }],
  });
  return textoDe(respuesta);
}

async function main(): Promise<void> {
  const client = makeClient();
  const tema =
    "Cual es la diferencia entre desarrollar con IA y desarrollar software que use IA";

  // ── El pipeline completo: paso 1 → paso 2 → paso 3 ─────────────
  escribirPaso("📋", `Paso 1 de 3: generando esquema para «${tema}»`);
  const { puntos } = await resumirElTemaEnPuntos(client, tema);
  puntos.forEach((p, i) => console.log(`   ${i + 1}. ${p}`));

  escribirPaso("✍️", "Paso 2 de 3: escribiendo borrador a partir del esquema");
  const borrador = await escribirBorrador(client, tema, puntos);
  console.log(`   ${borrador.slice(0, 120)}…`);

  escribirPaso("💡", "Paso 3 de 3: inventando título a partir del borrador");
  const titulo = await inventarTitulo(client, borrador);
  console.log(`   ${titulo}`);

  escribirPaso("✅", "Resultado final");
  console.log(`# ${titulo}\n\n${borrador}`);
}

if (isDirectRun(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
