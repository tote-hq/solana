import type { Lang } from './lang.ts';

/**
 * What the shopper app actually stores and sends.
 *
 * Written from the code, not from a legal review. The gaps section is a list
 * for the person who publishes the app; it is not a promise that those points
 * are settled.
 */
export interface PrivacySection {
  id: string;
  heading: string;
  paragraphs: string[];
}

export interface PrivacyCopy {
  title: string;
  back: string;
  intro: string;
  sections: PrivacySection[];
  gapsHeading: string;
  gapsLead: string;
  gaps: string[];
  contactHeading: string;
  contactLead: string;
}

const ES: PrivacyCopy = {
  title: 'Privacidad',
  back: 'Volver',
  intro:
    'Esta página describe lo que hace el código de esta aplicación (sol.changuito.me). No es un dictamen jurídico ni una promesa de cumplimiento.',
  sections: [
    {
      id: 'cuenta',
      heading: 'Cómo entrás',
      paragraphs: [
        'Podés entrar con email o Google. Ese ingreso lo hace Privy y crea una billetera de Solana en tu cuenta. La aplicación guarda una cookie de sesión (chg_user) firmada por el servidor, por 30 días, después de verificar el token de Privy. La dirección la lee el servidor desde Privy, no desde un dato que el navegador invente.',
        'En un teléfono con Mobile Wallet Adapter podés entrar firmando un mensaje que escribe el servidor (incluye el sitio, tu dirección, un nonce de un solo uso y un vencimiento de cinco minutos). El servidor verifica la firma ed25519 y recién ahí emite la misma cookie. Mandar solo la dirección no abre una sesión.',
        'La aplicación no pide ni recibe tu frase semilla.',
      ],
    },
    {
      id: 'dia',
      heading: 'Datos de Día',
      paragraphs: [
        'Si los cargás, se guardan el email, la contraseña, el DNI y el código postal de tu cuenta de Día. Van cifrados con AES-256-GCM. La clave (PROFILE_ENC_KEY) vive en el servidor y no en la base. El cifrado está atado a la red y a tu dirección: una fila movida a otra cuenta no se abre.',
        'La contraseña no vuelve al navegador. Se descifra en un solo lugar, al empezar un pedido de un miembro, y se manda en el cuerpo del trabajo al servicio que entra a Día. Ese servicio no lee la base ni la clave.',
        'Para un miembro, el pedido se paga con la tarjeta del operador, no con una tarjeta guardada en tu cuenta de Día. El DNI del perfil es el documento del titular. Si no sos miembro, la corrida es una demostración: se detiene en el pago y no pide el login de Día.',
      ],
    },
    {
      id: 'chats',
      heading: 'Conversaciones y pedidos',
      paragraphs: [
        'Si entraste, el transcript del chat se guarda en la base, asociado a tu dirección. El turno en curso vive en una tabla que vence más o menos a la hora. En este navegador también quedan los chats en localStorage, bajo claves que empiezan con changuito:.',
        'Un checkout guardado (alrededor de 24 horas) tiene el carrito, el código postal, los montos y el comprador. Los pedidos que terminan quedan en la tabla de órdenes.',
        'Hay un contador de uso por dirección, para el límite de mensajes.',
        'Lo que escribís, y lo que responden las herramientas, se manda al modelo configurado en el servidor: Anthropic por defecto, u OpenAI si el servidor tiene esa clave. La búsqueda de productos va a Día, Jumbo, Disco y Carrefour. Las fotos vienen de los CDN de esas tiendas. El tipo de cambio del presupuesto es la compra de USDC de belo en dolarapi, sin otra fuente de respaldo. La cadena de esta build es Solana devnet (el RPC público de devnet).',
      ],
    },
    {
      id: 'cookies',
      heading: 'Cookies y medición',
      paragraphs: [
        'chg_user es la sesión (HttpOnly). chg_human es la verificación de Cloudflare Turnstile. chg_lang guarda el idioma y no es HttpOnly: el botón la escribe y solo elige palabras.',
        'Si el servidor tiene los identificadores, el navegador carga Google Analytics 4, Meta o Microsoft Clarity. Antes de enviar un evento, el cliente tira la dirección, montos, texto, email, carrito y otros campos que identificarían un pedido. Si esos identificadores no están, esos scripts no se cargan.',
      ],
    },
    {
      id: 'borrar',
      heading: 'Qué podés borrar acá',
      paragraphs: [
        'Desde tu perfil podés eliminar la cuenta de Changuito de esta sesión: el perfil cifrado, los chats, los pedidos que cuelgan de ellos, los checkouts guardados con tu dirección, el contador de uso, la cookie de sesión y los datos de Changuito en este navegador.',
        'Si el token de Privy verifica y Privy acepta el borrado, también se pide borrar ese usuario de Privy. Si Privy no responde o la llamada falla, los datos de Changuito igual se borran y la pantalla lo dice: podés volver a entrar e intentarlo de nuevo. Una cuenta que solo entró por el teléfono no tiene usuario de Privy que borrar.',
        'No borramos tu cuenta de Día. No borramos lo que ya quedó escrito en Solana (el depósito en USDC y las transacciones). Un turno que todavía no se archivó vence solo, dentro de la hora: su clave es la sesión, y no aceptamos que el navegador nos diga qué sesiones borrar.',
      ],
    },
  ],
  gapsHeading: 'Pendiente de revisión de quien publica (Simoneth)',
  gapsLead:
    'Estos puntos no están resueltos en el código y no son afirmaciones legales. Quedan para Simoneth, que publica la aplicación.',
  gaps: [
    'En el repositorio no hay un abogado ni una entidad legal más allá de la atribución de los fundadores (SimonethG y Fabio).',
    'El depósito en USDC puede ser un servicio financiero regulado. Eso no está decidido acá.',
    'Los supermercados venden alcohol y la aplicación no tiene un control de edad.',
    'Esta build paga en Solana devnet, no en mainnet. Una billetera de Seeker que solo acepte mainnet puede negarse a firmar.',
    'Lo escrito en la cadena no se puede borrar, aunque se borre la cuenta de Changuito.',
    'Borrar la cuenta de Changuito no borra la cuenta de Día.',
    'Si la API de borrado de Privy falla, el ingreso por email puede seguir existiendo. La pantalla deja reintentar después de volver a entrar.',
    'No hay un email dedicado a privacidad. Los contactos que ya existen están abajo.',
  ],
  contactHeading: 'Contacto',
  contactLead: 'Para un problema de la aplicación, el canal que ya existe es el reporte de errores. También están las cuentas públicas.',
};

const EN: PrivacyCopy = {
  title: 'Privacy',
  back: 'Back',
  intro:
    'This page describes what the code of this app (sol.changuito.me) does. It is not a legal opinion and it is not a compliance promise.',
  sections: [
    {
      id: 'cuenta',
      heading: 'How you sign in',
      paragraphs: [
        'You can sign in with email or Google. Privy handles that sign-in and creates a Solana wallet on your account. The app stores a server-signed session cookie (chg_user) for 30 days after it verifies the Privy token. The server reads the address from Privy, not from an address the browser claims.',
        'On a phone with Mobile Wallet Adapter you can sign in by signing a message the server writes (the site, your address, a single-use nonce, and a five-minute expiry). The server checks the ed25519 signature and only then issues the same cookie. An address on its own does not open a session.',
        'The app does not ask for or receive your seed phrase.',
      ],
    },
    {
      id: 'dia',
      heading: 'Día details',
      paragraphs: [
        'If you save them, your Día email, password, DNI and postal code are stored encrypted with AES-256-GCM. The key (PROFILE_ENC_KEY) stays on the server and is not in the database. The ciphertext is bound to the network and your address: a row moved to another account does not open.',
        'The password never comes back to the browser. It is decrypted in one place, when a member checkout starts, and sent in the job body to the service that logs into Día. That service does not read the database or the key.',
        "For a member, the order is paid with the operator's card, not with a card saved in your Día account. The profile DNI is the cardholder document. If you are not a member, the run is a demo: it stops at payment and does not ask for your Día login.",
      ],
    },
    {
      id: 'chats',
      heading: 'Conversations and orders',
      paragraphs: [
        'Once you are signed in, the chat transcript is stored in the database under your address. The in-progress turn lives in a table that expires in about an hour. This browser also keeps chats in localStorage, under keys that start with changuito:.',
        'A stored checkout (about 24 hours) holds the basket, postal code, amounts and buyer. Finished orders stay in the orders table.',
        'There is a per-address usage counter for the message limit.',
        'What you write, and what the tools answer, is sent to the model the server is configured with: Anthropic by default, or OpenAI when that key is set. Product search goes to Día, Jumbo, Disco and Carrefour. Photos come from those stores’ CDNs. The quote’s exchange rate is belo’s USDC buy price from dolarapi, with no fallback source. This build’s chain is Solana devnet (the public devnet RPC).',
      ],
    },
    {
      id: 'cookies',
      heading: 'Cookies and measurement',
      paragraphs: [
        'chg_user is the session (HttpOnly). chg_human is the Cloudflare Turnstile check. chg_lang stores the language and is not HttpOnly: the button writes it, and it only chooses words.',
        'When the server has the ids, the browser loads Google Analytics 4, Meta or Microsoft Clarity. Before an event is sent, the client drops the address, amounts, text, email, cart and other fields that would identify an order. If those ids are unset, those scripts are not loaded.',
      ],
    },
    {
      id: 'borrar',
      heading: 'What you can delete here',
      paragraphs: [
        'From your profile you can delete the Changuito account for this session: the encrypted profile, chats, orders that hang off them, checkouts stored for your address, the usage counter, the session cookie, and Changuito data in this browser.',
        'If the Privy token verifies and Privy accepts the delete, that Privy user is deleted too. If Privy does not answer or the call fails, Changuito’s data is still deleted and the screen says so: you can sign in again and retry. A phone-only sign-in has no Privy user to delete.',
        'We do not delete your Día account. We do not delete what is already written on Solana (the USDC deposit and the transactions). A turn that was not archived yet expires on its own within the hour: its key is the session, and we do not accept a browser telling us which sessions to delete.',
      ],
    },
  ],
  gapsHeading: 'Still for the publisher to review (Simoneth)',
  gapsLead:
    'These points are not settled in the code and they are not legal claims. They are for Simoneth, who publishes the app.',
  gaps: [
    'The repository has no lawyer and no legal entity beyond the founders’ attribution (SimonethG and Fabio).',
    'The USDC deposit may be a regulated financial service. That is not decided here.',
    'The supermarkets sell alcohol and the app has no age gate.',
    'This build pays on Solana devnet, not mainnet. A Seeker wallet that only accepts mainnet may refuse to sign.',
    'What is written on the chain cannot be erased, even if the Changuito account is deleted.',
    'Deleting the Changuito account does not delete the Día account.',
    'If Privy’s delete API fails, the email sign-in can remain. The screen lets you retry after signing in again.',
    'There is no dedicated privacy email. The contacts that already exist are below.',
  ],
  contactHeading: 'Contact',
  contactLead: 'For a problem with the app, the channel that already exists is the bug report. The public accounts are there too.',
};

export function privacyCopy(lang: Lang): PrivacyCopy {
  return lang === 'en' ? EN : ES;
}
