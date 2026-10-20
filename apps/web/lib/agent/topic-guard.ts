/**
 * Topic guard for the shopping agent.
 *
 * Two layers keep the chat on supermarket shopping. The system prompt
 * (`prompt.ts`) tells the model the scope and the exact refusal. This file
 * is the layer in front of that: it decides before any model call, so an
 * off-topic turn never opens a tool and never pays for a hop.
 *
 * It is a heuristic on purpose. A second model call would add a network
 * round-trip to every message, including "leche", and the tests could not
 * pin the decision without a key. The patterns are high-precision: they
 * refuse code, homework, trivia, politics, creative writing, weather,
 * translation and prompt-injection phrasings. Anything that still looks
 * like groceries, a greeting, a short follow-up, a shopping list or a
 * product photo falls through. That fail-open is the point — a false
 * refuse blocks a real basket, and the prompt still sees the messages
 * this layer lets through.
 *
 * Only a type import. `--experimental-strip-types` erases it, so a test
 * can load this file with nothing to resolve at runtime.
 */

import type { Lang } from '../lang.ts';

/**
 * The only sentence an off-topic turn may produce, in the shopper's
 * language. The prompt quotes these same constants, so the two layers
 * cannot drift.
 */
export const OFF_TOPIC_REFUSAL_ES =
  'Lo siento, pero no puedo ayudarte con temas diferentes a tus compras en el supermercado.';

export const OFF_TOPIC_REFUSAL_EN =
  "Sorry, but I can't help you with topics other than your supermarket shopping.";

export type TopicVerdict = 'allow' | 'refuse';

/** Strip accents and collapse whitespace so the patterns can stay ASCII. */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function anyOf(parts: readonly string[]): RegExp {
  return new RegExp(`\\b(?:${parts.map(escapeRe).join('|')})\\b`, 'i');
}

/**
 * Injection is refused even when a grocery word is glued on the end.
 * The phrasings are the ones that name the instructions, not "ignorá
 * la marca cara", which is a normal way to shop.
 */
const INJECTION: readonly RegExp[] = [
  /\b(?:ignore|disregard|forget|override|bypass)\b.{0,60}\b(?:instructions?|prompts?|rules?|guardrails?)\b/,
  /\b(?:ignore|disregard|forget)\b.{0,24}\b(?:all|any)\s+(?:previous|prior)\b/,
  /\b(?:olvida\w*|ignora\w*|desestima\w*|anula\w*|omite\w*)\b.{0,60}\b(?:instruccion(?:es)?|indicacion(?:es)?|regla(?:s)?|prompts?|consigna(?:s)?)\b/,
  /\b(?:olvida\w*|ignora\w*)\b.{0,30}\b(?:todo lo anterior|tus reglas|las reglas)\b/,
  /\b(?:jailbreak|do anything now|dan mode|developer mode|modo desarrollador)\b/,
  /\b(?:you are now|from now on you are|pretend you have no)\b/,
  /\b(?:sos ahora|a partir de ahora (?:sos|eres)|hace de cuenta que no tenes)\b/,
  /\b(?:reveal|show|print|repeat|dump|output)\b.{0,40}\b(?:system prompt|hidden prompt|your instructions)\b/,
  /\b(?:mostra\w*|revela\w*|repeti\w*|imprime\w*)\b.{0,40}\b(?:prompt del sistema|instrucciones del sistema|system prompt)\b/,
  /\bsystem prompt\b/,
  /\bprompt del sistema\b/,
  /\b(?:new|nuevas)\s+(?:instructions|instrucciones)\b/,
  /(?:^|\n)\s*(?:system|developer)\s*:/,
];

/** Writing code. Language names alone are not enough: "java" can be a coffee. */
const CODE: readonly RegExp[] = [
  /\b(?:write|coding|debug|compile|implement|refactor)\b.{0,48}\b(?:python|javascript|typescript|java|golang|rust|kotlin|swift|ruby|php|sql|html|css|function|script|program|code|algorithm)\b/,
  /\b(?:python|javascript|typescript|java|golang|rust|kotlin|swift|ruby|php|sql|html|css)\b.{0,48}\b(?:code|script|function|program|snippet|bug|class)\b/,
  /\b(?:escrib\w*|codific\w*|programar|programa(?:me|r|ndo)|debugue\w*|compil\w*)\b.{0,48}\b(?:codigo|script|programa|funcion|python|javascript|algoritmo)\b/,
  /\b(?:codigo|script|programa)\b.{0,32}\b(?:python|javascript|typescript|sql|html)\b/,
  /\b(?:ayuda|ayudame|help)\b.{0,40}\b(?:codigo|programming|programar)\b/,
  /```/,
  /\bfunction\s+\w+\s*\(/,
  /\b(?:const|let|var)\s+\w+\s*=/,
  /\bdef\s+\w+\s*\(/,
  /\bimport\s+\w+\s+from\b/,
  /\b(?:npm|pip)\s+install\b/,
  /\bstackoverflow\b/,
];

const HOMEWORK: readonly RegExp[] = [
  /\b(?:homework|coursework|assignment|essay|monograph)\b/,
  /\b(?:hacer la tarea|haceme la tarea|tarea escolar|trabajo practico|monografia)\b/,
  /\btarea de (?:matematica|historia|lengua|ingles|fisica|quimica|biologia|geografia|calculo)\b/,
  /\b(?:resuelve\w*|resolve|solve|calcula)\b.{0,40}\b(?:ecuacion|equation|integral|derivada|calculus|algebra)\b/,
  /\b(?:fotosintesis|photosynthesis|mitosis|tabla periodica|periodic table|teorema de pitagoras)\b/,
  /\b(?:help me with|ayudame con)\b.{0,40}\b(?:homework|tarea|essay|ensayo|assignment|calculus|algebra)\b/,
];

const POLITICS: readonly RegExp[] = [
  /\b(?:milei|kirchner|macri|peronismo|la libertad avanza)\b/,
  /\b(?:elecciones (?:presidenciales|generales|legislativas)|campana electoral|votar por|vote for)\b/,
  /\b(?:quien (?:es|fue) el presidente|who is the president|who's the president)\b/,
  /\b(?:de la politica|sobre politica|hablar de politica|about politics|talk(?:ing)? about politics)\b/,
];

const TRIVIA: readonly RegExp[] = [
  /\b(?:capital de|capital of)\b/,
  /\b(?:quien invento|who invented|quien descubrio|who discovered)\b/,
  /\b(?:world cup|copa mundial|mundial de futbol|quien gano el mundial|who won the world)\b/,
  /\b(?:cuantos habitantes|population of)\b/,
  /\b(?:dato curioso|general knowledge)\b/,
  /\b(?:agujero negro|black hole|dinosaurio|dinosaurs?)\b/,
];

/** Creative writing and other assistant jobs. These are never a basket. */
const CREATIVE: readonly RegExp[] = [
  /\b(?:poema|poem|haiku|soneto|sonnet)\b/,
  /\b(?:un chiste|a joke|un cuento|a short story)\b/,
  /\b(?:contame|decime|escribi\w*|write|tell me)\b.{0,24}\b(?:chiste|joke|cuento|story|cancion|song|email|correo)\b/,
  /\b(?:write|draft|compose|redact\w*|escrib\w*)\b.{0,32}\b(?:email|essay|poem|story|song|cover letter|resume|cv|correo|mail|ensayo|carta|curriculum)\b/,
];

/**
 * Clear off-topic, but a grocery word in the same message wins. "Traducí
 * el nombre de este queso" is still someone trying to shop.
 */
const OFF_TOPIC_UNLESS_SHOPPING: readonly RegExp[] = [
  ...TRIVIA,
  /\b(?:traduci\w*|traduce\w*|translate)\b.{0,50}\b(?:frances|french|aleman|german|portugues|portuguese|ingles|english|italiano|italian|chino|chinese)\b/,
  /\b(?:pronostico del tiempo|weather forecast|what's the weather|whats the weather|what is the weather|como esta el clima|que tiempo hace)\b/,
  /\bweather\b/,
  /\b(?:receta medica|diagnostico medico|sintomas de|medical advice|legal advice)\b/,
  /\b(?:cuanto es|cuanto da|what is|whats)\s+\d+\s*(?:\+|mas|minus|-|times|\*|divided)\s*\d+\b/,
];

const ALWAYS_OFF_TOPIC: readonly RegExp[] = [
  ...CODE,
  ...HOMEWORK,
  ...POLITICS,
  ...CREATIVE,
  /\b(?:bitcoin|ethereum)\b/,
];

/**
 * Grocery and checkout vocabulary. A hit is enough to allow, once
 * injection and the strong off-topic patterns have already missed.
 * "día" is not here: it is the store and also the word for day, and a
 * message that only says it still falls through as ambiguous.
 */
const SHOPPING_WORDS: readonly string[] = [
  'leche', 'milk', 'pan', 'bread', 'arroz', 'rice', 'fideo', 'fideos', 'pasta',
  'aceite', 'oil', 'huevo', 'huevos', 'egg', 'eggs', 'azucar', 'sugar', 'yerba',
  'cafe', 'coffee', 'carne', 'pollo', 'chicken', 'queso', 'cheese', 'yogur',
  'yogurt', 'agua', 'gaseosa', 'cerveza', 'beer', 'vino', 'wine', 'fruta',
  'frutas', 'verdura', 'verduras', 'manzana', 'banana', 'tomate', 'papa',
  'papas', 'cebolla', 'ajo', 'harina', 'flour', 'galletita', 'galletitas',
  'cereal', 'detergente', 'jabon', 'shampoo', 'lavandina', 'avena', 'oat',
  'fiambre', 'jamon', 'ham', 'atun', 'tuna', 'lenteja', 'poroto', 'garbanzo',
  'manteca', 'butter', 'mermelada', 'alfajor', 'chocolate', 'helado',
  'proteina', 'protein', 'descremada', 'gluten', 'mayonesa', 'ketchup',
  'mostaza', 'vinagre', 'arvejas', 'choclo', 'lechuga', 'zanahoria',
  'naranja', 'limon', 'dulce de leche', 'medialunas', 'facturas', 'empanada',
  'milanesa', 'asado',
  'carrito', 'cart', 'changuito', 'trolley', 'supermercado', 'supermarket',
  'almacen', 'jumbo', 'carrefour', 'coto', 'vea', 'disco', 'super',
  'precio', 'precios', 'price', 'prices', 'barato', 'barata', 'baratos', 'baratas',
  'cheap', 'cheaper', 'cheapest', 'oferta', 'ofertas', 'descuento', 'descuentos',
  'promo', 'promocion', 'stock', 'envio', 'delivery',
  'codigo postal', 'codigo de barras', 'postal', 'postcode', 'cpa', 'cp',
  'checkout', 'pagar', 'pago', 'payment', 'usdc',
  'pedido', 'my order', 'order status', 'factura', 'receipt',
  'lista de compras', 'shopping list', 'shopping',
  'desayuno', 'breakfast', 'almuerzo', 'lunch', 'cena', 'dinner',
  'receta', 'recipe', 'marca', 'marcas', 'brand', 'brands',
  'litro', 'litros', 'kilo', 'kilos', 'gramo', 'gramos',
  'mostrame', 'papel higienico', 'sin tacc', 'presupuesto', 'budget',
  'comprar', 'compra', 'compras', 'gondola', 'sucursal',
];

const SHOPPING = anyOf(SHOPPING_WORDS);
const SHOPPING_PREFIX = /\b(?:recomend\w*|sugier\w*|reemplaz\w*|sustitut\w*|grocer\w*|compar\w*)\b/;

/** A comma-separated list of short items is a basket even when the words are unfamiliar. */
function looksLikeItemList(folded: string): boolean {
  const parts = folded.split(/[,;\n]/).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 4) return false;
  const short = parts.filter((part) => part.split(/\s+/).filter(Boolean).length <= 5).length;
  return short / parts.length >= 0.75;
}

const GREETING_UNIT =
  'buenos dias|buen dia|buenas tardes|buenas noches|buenas|muchas gracias|thank you|como estas|como andas|how are you|que tal|todo bien|good morning|good afternoon|good evening|hey there|gracias|thanks|hello|hola|changuito|perfecto|genial|okay|listo|adios|chau|dale|joya|hey|bye|ok|hi';
const GREETING = new RegExp(`^(?:${GREETING_UNIT})(?:\\s+(?:${GREETING_UNIT}))*$`);

function isGreeting(folded: string): boolean {
  const bare = folded.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!bare || bare.length > 80) return false;
  return GREETING.test(bare);
}

function hasShoppingAnchor(folded: string): boolean {
  return SHOPPING.test(folded) || SHOPPING_PREFIX.test(folded);
}

function isInjection(folded: string): boolean {
  return INJECTION.some((pattern) => pattern.test(folded));
}

function isAlwaysOffTopic(folded: string): boolean {
  return ALWAYS_OFF_TOPIC.some((pattern) => pattern.test(folded));
}

function isOffTopicUnlessShopping(folded: string): boolean {
  return OFF_TOPIC_UNLESS_SHOPPING.some((pattern) => pattern.test(folded));
}

/** A long message with no grocery signal is an essay, not a basket. */
const ESSAY_WORDS = 70;

function wordCount(folded: string): number {
  return folded.split(/\s+/).filter(Boolean).length;
}

/**
 * `allow` means the main loop may continue. `refuse` means reply with
 * `offTopicRefusal` and stop, with no tool call.
 */
export function classifyTopic(text: string, opts?: { hasImage?: boolean }): TopicVerdict {
  const folded = fold(text);
  if (!folded) return 'allow';
  if (isInjection(folded)) return 'refuse';
  // Code, homework, politics and jokes stay refused even if a product
  // name was appended. The other patterns yield when the message is
  // also plainly about a basket.
  if (isAlwaysOffTopic(folded)) return 'refuse';
  const shopping = hasShoppingAnchor(folded);
  if (isOffTopicUnlessShopping(folded) && !shopping) return 'refuse';
  // A photo of a list, a product or a shelf is how people shop here.
  // A clear off-topic caption already returned above, so the picture
  // does not smuggle homework past the guard.
  if (opts?.hasImage) return 'allow';
  if (shopping) return 'allow';
  if (looksLikeItemList(folded)) return 'allow';
  if (isGreeting(folded)) return 'allow';
  if (wordCount(folded) >= ESSAY_WORDS) return 'refuse';
  return 'allow';
}

const EN_MARKERS = new Set([
  'the', 'what', 'how', 'write', 'please', 'ignore', 'your', 'instructions',
  'homework', 'tell', 'who', 'why', 'where', 'weather', 'poem', 'joke',
  'president', 'translate', 'script', 'function', 'help', 'with', 'my',
  'calculus', 'code', 'about',
]);

const ES_MARKERS = new Set([
  'escribime', 'escribi', 'ignora', 'instrucciones', 'instruccion', 'tarea',
  'contame', 'decime', 'quien', 'clima', 'poema', 'chiste', 'presidente',
  'traduci', 'traduce', 'necesito', 'quiero', 'busco', 'ayudame', 'ayuda',
  'hola', 'gracias', 'opinas', 'como', 'para', 'una', 'que', 'con', 'por',
  'favor', 'del', 'las', 'los', 'sobre', 'historia', 'funcion', 'pero',
  'che', 'mundial',
]);

/** English when the footer is English, or when the message itself is. */
function messageIsEnglish(text: string): boolean {
  const words = fold(text).split(/[^a-z0-9]+/).filter(Boolean);
  let en = 0;
  let es = 0;
  for (const word of words) {
    if (EN_MARKERS.has(word)) en += 1;
    if (ES_MARKERS.has(word)) es += 1;
  }
  return en >= 2 && en > es;
}

export function offTopicRefusal(lang: Lang, text: string): string {
  if (lang === 'en' || messageIsEnglish(text)) return OFF_TOPIC_REFUSAL_EN;
  return OFF_TOPIC_REFUSAL_ES;
}
