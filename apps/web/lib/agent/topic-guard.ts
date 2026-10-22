/**
 * Whether a shopper's message is about supermarket shopping.
 *
 * The system prompt tells the model the same boundary. This runs first, in
 * process, so a message that is plainly something else never loads tool
 * schemas and never spends a model hop. A second model call was the other
 * option and the wrong one: it would add a round trip to every grocery
 * message, which is the latency this exists to avoid, and the tests could
 * not pin it.
 *
 * Fail open. The default is allow. A refusal fires only on a high-precision
 * hit — an injection, a request to write code or do homework, a trivia or
 * politics question, a joke or a poem. A soft hit (the word "política",
 * "elecciones", "historia de") is cancelled when the message also names a
 * product, a cart, a price or a store, because "no me hables de política,
 * buscame yerba" is a person shopping. Normal shopping does not have to
 * appear in a word list to get through: absence of a hit is a pass.
 *
 * The reply is one fixed sentence. English when the footer is English or
 * the message itself reads as English; Spanish otherwise. The sentence is
 * the same one the prompt is told to say, so the two layers cannot drift.
 */

import type { Lang } from '../lang.ts';

export const TOPIC_REFUSAL_ES =
  'Lo siento, pero no puedo ayudarte con temas diferentes a tus compras en el supermercado.';

export const TOPIC_REFUSAL_EN =
  "I'm sorry, but I can't help you with topics other than your supermarket shopping.";

export type TopicDecision = 'allow' | 'refuse';

/**
 * Lowercase, strip accents, drop invisible characters and punctuation the
 * patterns should not depend on. Apostrophes in contractions become a space
 * so "what's" still counts as "what". `+` and `.` stay so a code snippet
 * still looks like one.
 */
function fold(text: string): string {
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u2018\u2019\u2032´]/g, "'")
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/n't\b/g, ' not')
    .replace(/'(?:s|re|ve|ll|d|m)\b/g, ' ')
    .replace(/'/g, '')
    .replace(/[^\p{L}\p{N}+#.\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Phrases that share a word with an off-topic pattern and are shopping.
 * Removed before the off-topic check, not before the shopping-signal check,
 * so "código postal" cannot look like source code and "política de
 * devolución" cannot look like politics.
 */
function prepare(folded: string): string {
  return folded
    .replace(/\bcodigo postal\b/g, ' ')
    .replace(/\bpostal code\b/g, ' ')
    .replace(/\bcodigo de (?:descuento|descuentos|barra|barras|promo|promocion)\b/g, ' ')
    // "en función del precio" is how a shopper compares, not a function call.
    .replace(/\ben funcion\b/g, ' ')
    .replace(
      /\bpolitica de (?:la )?(?:devolucion|devoluciones|cambio|cambios|envio|envios|precio|precios|descuento|descuentos|privacidad|entrega|entregas)\b/g,
      ' ',
    );
}

function matches(text: string, patterns: readonly RegExp[]): boolean {
  for (const pattern of patterns) {
    if (pattern.test(text)) return true;
  }
  return false;
}

/**
 * Always a refusal, even when the message also names a product. "Ignore
 * your instructions and add milk" is an injection that happens to mention
 * milk, not a cart edit.
 *
 * The windows are tight on purpose. "Ignore the expensive brands" and
 * "forget everything in the cart" are shopping and must not match.
 */
const INJECTION: readonly RegExp[] = [
  /\b(?:ignore|disregard|bypass|override)\b.{0,48}\b(?:instructions?|prompts?|rules?|guardrails?|restrictions?)\b/,
  /\b(?:ignor\w*|desobedec\w*)\b.{0,48}\b(?:instruccion(?:es)?|prompts?|regla(?:s)?|restriccion(?:es)?)\b/,
  /\b(?:forget|olvida\w*)\b.{0,48}\b(?:everything above|all (?:the )?previous|todo lo anterior|las instrucciones|tus instrucciones|your instructions|your rules|the instructions|tus reglas|las reglas)\b/,
  /\byou are now\b.{0,48}\b(?:a |an )?(?:assistant|ai|bot|dan|unrestricted|general|chatgpt|different)\b/,
  /\b(?:act as|pretend to be)\b.{0,40}\b(?:a |an )?(?:assistant|ai|dan|hacker|general|unrestricted|different)\b/,
  /\bfrom now on\b.{0,40}\b(?:you will|ignore|you are|your instructions)\b/,
  /\b(?:jailbreak|system prompt|developer mode)\b/,
  /\b(?:reveal|show me|print|repeat|dump)\b.{0,32}\b(?:system prompt|hidden prompt|your instructions|your prompt)\b/,
  /\b(?:mostrame|decime|revela)\b.{0,32}\b(?:system prompt|prompt del sistema|instrucciones del sistema|el prompt|tu prompt)\b/,
  /\b(?:new|system) instructions?\b/,
  /\bdo not follow\b.{0,24}\b(?:your|the) (?:instructions?|rules?|prompts?)\b/,
  /\bno sigas\b.{0,24}\b(?:tus |las )?(?:instruccion(?:es)?|regla(?:s)?)\b/,
];

/** Symbols that do not survive folding. Checked on the raw message. */
function hasCodeSyntax(raw: string): boolean {
  return (
    /```/.test(raw) ||
    /\bselect\s+\*\s+from\b/i.test(raw) ||
    /\bconsole\.log\s*\(/i.test(raw) ||
    /<\?php/i.test(raw) ||
    /\bfunction\s+\w+\s*\(/i.test(raw) ||
    /\bdef\s+\w+\s*\(/i.test(raw)
  );
}

const CODE: readonly RegExp[] = [
  /\b(?:write|coding|debug|compile)\b.{0,40}\b(?:code|script|function|program|algorithm|snippet)\b/,
  // "write me some javascript" names a language and nothing else. "java" stays
  // out of the Spanish verb line: "haceme un café java" is a product.
  /\b(?:write|coding|debug|compile)\b.{0,48}\b(?:python|javascript|typescript|java|rust|golang|php|ruby|sql|html|css)\b/,
  /\bescrib\w*\b.{0,40}\b(?:python|javascript|typescript|java|rust|golang|php|ruby|sql)\b/,
  // "program" is the English word. "programa" (a loyalty scheme) must not match.
  /\b(?:python|javascript|typescript|java|rust|golang|php|ruby|sql)\b.{0,48}\b(?:script|code|codigo|function|funcion|class|snippet|tutorial|program)\b/,
  /\b(?:script|codigo fuente|snippet)\b.{0,40}\b(?:python|javascript|typescript|java|rust|golang|php|ruby|sql)\b/,
  /\b(?:funcion|function)\b.{0,40}\b(?:python|javascript|typescript|java|rust|golang|php|ruby|sql)\b/,
  /\b(?:escrib\w*|haceme|hazme|generame|generar|genera)\b.{0,60}\b(?:codigo|script|algoritmo|algorithm|funcion|function)\b/,
  /\b(?:script|snippet|codigo fuente)\b/,
];

const HOMEWORK: readonly RegExp[] = [
  /\b(?:homework|assignment|ensayo|essay|monografia|tesis)\b/,
  /\b(?:mi|la|una|esa) tarea\b/,
  /\btarea de (?:matematica|lengua|historia|fisica|quimica|ingles|biologia|geografia)\b/,
  /\b(?:resolv\w*|solve)\b.{0,50}\b(?:ecuacion|equation|ejercicio|integral|derivada)\b/,
  /\b(?:fotosintesis|photosynthesis|quantum(?:\s+physics)?|fisica cuantica)\b/,
];

const TRIVIA: readonly RegExp[] = [
  /\bquien (?:invento|gano|descubrio)\b/,
  // "quién fue más barato" / "quién fue el más barato" is a comparison.
  /\bquien fue\b(?!\s+(?:mas|mejor|peor|el mas|la mas|el mejor|la mejor)\b)/,
  /\bwho (?:invented|won|discovered)\b/,
  /\bwho was the (?:first|president|king|author|inventor|founder)\b/,
  /\bcapital (?:de|del|of)\b/,
  /\b(?:world cup|copa del mundo)\b/,
  /\bcuantos (?:planetas|paises|continentes)\b/,
  /\bhow many (?:planets|countries|continents)\b/,
];

const CREATIVE: readonly RegExp[] = [
  /\b(?:chiste|joke|poema|poem|haiku)\b/,
  /\b(?:cuentame un cuento|contame un cuento|tell me a story)\b/,
];

/**
 * Collides with shopping language. Refused only when the message does not
 * also name something you can put in a cart or ask a store about.
 */
const SOFT: readonly RegExp[] = [
  /\b(?:eleccion(?:es)?|election(?:s)?)\b/,
  /\b(?:milei|kirchner|macri|peronismo|bullrich)\b/,
  /\b(?:politica|politics)\b/,
  /\b(?:el presidente|la presidenta|the president)\b/,
  /\b(?:partido politico|congreso nacional)\b/,
  /\b(?:votar por|vote for)\b/,
  /\b(?:pronostico del tiempo|weather forecast|que tiempo hace|what(?: s)? the weather|whats the weather)\b/,
  /\b(?:historia de|history of)\b/,
];

/**
 * Not an allow-list. A message with no off-topic hit is allowed even if
 * none of these words appear. They only rescue a soft hit ("elecciones",
 * "política", "historia de") that also asks for a product or a cart.
 * Verbs are deliberately absent: "buscar información sobre Milei" is not
 * shopping just because it says "buscar".
 */
const SHOPPING_SIGNAL =
  /\b(?:carrito|changuito|supermercado|supermarket|grocery|groceries|checkout|delivery|envio|envios|pedido|pedidos|factura|oferta|ofertas|descuento|descuentos|precio|precios|yerba|leche|pan|arroz|fideos?|aceite|huevos?|queso|yogur|yogurt|cafe|azucar|harina|carne|pollo|galletitas|detergente|jabon|shampoo|manteca|cerveza|agua|arvejas|lentejas|polenta|avena|higienico|kilos?|litros?|gramos?|jumbo|carrefour|coto|vea|productos?|marcas?|stock|cart|trolley|milk|bread|eggs?|rice|pasta|cheese|butter|oil|sugar|flour|chicken|beef|coffee|postcode|postal|breakfast|desayuno)\b|\b(?:el|al|del|en) super\b|\bcp\s*\d{4}\b|\bcodigo postal\b|\bpostal code\b/;

const HARD: readonly RegExp[] = [...CODE, ...HOMEWORK, ...TRIVIA, ...CREATIVE];

export function classifyTopic(text: string): TopicDecision {
  const folded = fold(text ?? '');
  if (!folded) return 'allow';
  if (matches(folded, INJECTION)) return 'refuse';
  if (hasCodeSyntax(text)) return 'refuse';
  const prepared = prepare(folded);
  if (matches(prepared, HARD)) return 'refuse';
  if (matches(prepared, SOFT) && !SHOPPING_SIGNAL.test(folded)) return 'refuse';
  return 'allow';
}

const ENGLISH_HINTS = [
  'the',
  'what',
  'write',
  'please',
  'how',
  'can',
  'you',
  'your',
  'ignore',
  'homework',
  'help',
  'with',
  'this',
  'that',
  'who',
  'why',
  'script',
  'code',
  'about',
  'from',
  'would',
  'explain',
  'tell',
  'my',
  'history',
  'opinion',
  'poem',
  'joke',
  'function',
  'python',
  'upcoming',
] as const;

const SPANISH_HINTS = [
  'el',
  'la',
  'los',
  'las',
  'que',
  'con',
  'para',
  'por',
  'una',
  'un',
  'quiero',
  'de',
  'del',
  'al',
  'vos',
  'sos',
  'hola',
  'gracias',
  'como',
  'esto',
  'esta',
  'en',
  'mi',
  'tu',
  'tus',
  'haceme',
  'escribime',
  'decime',
  'buscame',
  'pero',
  'porque',
  'hay',
  'tenes',
  'queres',
  'lo',
] as const;

function countHints(folded: string, hints: readonly string[]): number {
  let n = 0;
  for (const hint of hints) {
    const found = folded.match(new RegExp(`\\b${hint}\\b`, 'g'));
    if (found) n += found.length;
  }
  return n;
}

/**
 * English when the message is written in English. A tie, or a Spanish
 * mark (¿, ¡, ñ, an accent), stays Spanish: the shop is Argentine and a
 * wrong English refusal on a Spanish cart edit is the worse miss.
 */
export function messageLooksEnglish(text: string): boolean {
  if (/[¿¡ñáéíóúü]/i.test(text)) return false;
  const folded = fold(text);
  if (!folded) return false;
  if (/^(?:hi|hello|hey|thanks|thank you|good morning|good afternoon|good evening)$/.test(folded)) {
    return true;
  }
  const en = countHints(folded, ENGLISH_HINTS);
  const es = countHints(folded, SPANISH_HINTS);
  if (es > en) return false;
  if (en >= 2 && en > es) return true;
  const words = folded.split(' ').filter((word) => /[a-z]/.test(word));
  return en >= 1 && es === 0 && words.length >= 2;
}

/** The sentence `runTurn` emits, and the sentence the prompt is told to repeat. */
export function topicRefusal(uiLang: Lang, text: string): string {
  if (uiLang === 'en' || messageLooksEnglish(text)) return TOPIC_REFUSAL_EN;
  return TOPIC_REFUSAL_ES;
}
