/**
 * ═══════════════════════════════════════════════════════════════
 *  PATRÓN 2 — ROUTER (centralita telefónica)
 * ═══════════════════════════════════════════════════════════════
 *
 *                          ┌──▶ 💳 facturación
 *   mensaje ──▶ 🔀 router ─┼──▶ 🔧 técnico
 *                          ├──▶ 📦 devoluciones
 *                          └──▶ 🙋 humano (si hay dudas)
 *
 *  Idea clave: una primera llamada al LLM solo CLASIFICA el
 *  mensaje. Después se activa UN único especialista, cada uno
 *  con sus propias instrucciones. Si el router no está seguro,
 *  se deriva a un humano en vez de arriesgarse.
 *
 *  Ejemplo: el soporte al cliente de una tienda online.
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

// Cada departamento es simplemente un prompt distinto.
export const DEPARTAMENTOS = {
  facturacion:
    "Eres del equipo de facturación de una tienda online. " +
    "Responde con empatía y explica el siguiente paso concreto.",
  tecnico:
    "Eres soporte técnico de una tienda online. Da una posible " +
    "causa y una solución paso a paso, sin jerga.",
  devoluciones:
    "Eres del equipo de devoluciones. Explica el proceso de " +
    "devolución en tres pasos numerados.",
} as const;

export type Departamento = keyof typeof DEPARTAMENTOS;

// ── Paso 1: clasificar el mensaje ──────────────────────────────
async function clasificar(client: Anthropic, mensaje: string) {
  const respuesta = await client.messages.parse({
    model: DEFAULT_MODEL,
    max_tokens: MAX_TOKENS,
    system:
      "Clasifica el mensaje de un cliente de una tienda online " +
      "en el departamento adecuado e indica tu confianza (0 a 1).",
    messages: [{ role: "user", content: mensaje }],
    output_config: {
      effort: "low",
      // El router devuelve SIEMPRE esta estructura: a qué departamento
      // va el mensaje, con cuánta seguridad y por qué.
      format: zodOutputFormat(
        z.object({
          departamento: z.enum(["facturacion", "tecnico", "devoluciones"]),
          confianza: z.number().min(0).max(1),
          motivo: z.string(),
        })
      ),
    },
  });

  const decision = respuesta.parsed_output;
  if (!decision) throw new Error("El modelo no devolvió una decisión válida");
  return decision;
}

// ── Paso 2: responder con el especialista elegido ──────────────
async function responderComoEspecialista(
  client: Anthropic,
  departamento: Departamento,
  mensaje: string
) {
  const respuesta = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: MAX_TOKENS,
    output_config: { effort: "low" },
    system: DEPARTAMENTOS[departamento],
    messages: [{ role: "user", content: mensaje }],
  });
  return textoDe(respuesta);
}

// ── El router completo: clasificar → un solo especialista ──────
export async function atenderConsulta(
  mensaje: string,
  client: Anthropic = makeClient(),
  confianzaMinima = 0.7
) {
  escribirPaso("🔀", "El router clasifica el mensaje…");
  const decision = await clasificar(client, mensaje);
  console.log(`   Departamento: ${decision.departamento}`);
  console.log(`   Confianza:    ${decision.confianza}`);
  console.log(`   Motivo:       ${decision.motivo}`);

  // Poca seguridad → mejor un humano que una respuesta inventada.
  if (decision.confianza < confianzaMinima) {
    escribirPaso("🙋", "Confianza baja: se deriva a un agente humano");
    return {
      departamento: "humano",
      confianza: decision.confianza,
      respuesta:
        "Voy a pasarte con un compañero para asegurarnos " +
        "de resolverlo bien. Un momento, por favor.",
    };
  }

  escribirPaso(
    "🎯",
    `Solo se activa el especialista de ${decision.departamento}`
  );
  const respuesta = await responderComoEspecialista(
    client,
    decision.departamento,
    mensaje
  );

  return {
    departamento: decision.departamento,
    confianza: decision.confianza,
    respuesta,
  };
}

async function main(): Promise<void> {
  const resultado = await atenderConsulta(
    "Me habéis cobrado dos veces el mismo pedido, ¿qué hago?"
  );
  escribirPaso("✅", `Respuesta de ${resultado.departamento}`);
  console.log(resultado.respuesta);
}

if (isDirectRun(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
