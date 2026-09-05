import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

// El SDK lee ANTHROPIC_API_KEY automáticamente de las variables de entorno.
export const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";

// Tope de tokens de salida. Suficiente para los ejemplos de esta serie.
export const MAX_TOKENS = 16000;

export function makeClient(): Anthropic {
  return new Anthropic();
}

// La respuesta viene como una lista de bloques (texto, thinking, tool_use…).
// Este helper se queda solo con el texto y lo concatena.
export function textoDe(mensaje: Anthropic.Message): string {
  return mensaje.content
    .filter((bloque): bloque is Anthropic.TextBlock => bloque.type === "text")
    .map((bloque) => bloque.text)
    .join("")
    .trim();
}

// Imprime un banner para separar visualmente cada paso en la consola.
export function escribirPaso(emoji: string, texto: string): void {
  console.log(`\n${emoji}  ${texto}`);
  console.log("─".repeat(60));
}

// ¿Se está ejecutando este archivo directamente con `node`?
export function isDirectRun(moduleUrl: string): boolean {
  const entryPoint = process.argv[1];
  return (
    entryPoint !== undefined &&
    moduleUrl === pathToFileURL(resolve(entryPoint)).href
  );
}
