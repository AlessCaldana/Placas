// Testi delle pagine legali, in italiano (testo giuridicamente vincolante).
// I dati del venditore arrivano da Impostazioni tramite `LegalContext`.
// Le pagine nelle altre lingue mostrano titolo e nota tradotti (src/messages/index.ts).
// Base normativa: diritto dell'Unione Europea (GDPR, Direttiva ePrivacy, Direttive
// 2011/83/UE e (UE) 2019/771, Regolamenti Roma I e Bruxelles I bis), con legge belga
// come legge del contratto, perché il venditore ha partita IVA belga.

import { legalRoutes } from "@/components/public/legal-routes";

export type LegalInline =
  | string
  | { kind: "link"; text: string; href: string }
  | { kind: "code"; text: string }
  | { kind: "strong"; text: string };

export type LegalBlock =
  | { kind: "p"; content: LegalInline[] }
  | { kind: "list"; items: LegalInline[][] }
  | { kind: "h3"; text: string };

export type LegalSection = { id: string; title: string; blocks: LegalBlock[] };

export type LegalContext = {
  /** Ragione sociale o nome e cognome del titolare (o nome del negozio). */
  holder: string;
  shopName: string;
  /** "" when not set. */
  email: string;
  vatNumber: string;
  taxCode: string;
  legalAddress: string;
  pecEmail: string;
  reaNumber: string;
  /** WhatsApp contact, or null when the number is not configured. */
  whatsapp: { label: string; href: string } | null;
  shipping: { italy: boolean; eu: boolean; world: string[] };
};

export const legalPlaceholder = "[dato in fase di registrazione]";

const link = (text: string, href: string): LegalInline => ({ kind: "link", text, href });
const code = (text: string): LegalInline => ({ kind: "code", text });
const strong = (text: string): LegalInline => ({ kind: "strong", text });
const p = (...content: LegalInline[]): LegalBlock => ({ kind: "p", content });
const h3 = (text: string): LegalBlock => ({ kind: "h3", text });
const list = (...items: (LegalInline | LegalInline[])[]): LegalBlock => ({
  kind: "list",
  items: items.map((item) => (Array.isArray(item) ? item : [item])),
});

function emailRef(ctx: LegalContext): LegalInline {
  return ctx.email ? link(ctx.email, `mailto:${ctx.email}`) : legalPlaceholder;
}

/** "email … oppure WhatsApp (+39 …)" */
function contactChannels(ctx: LegalContext): LegalInline[] {
  const channels: LegalInline[] = ["via email all'indirizzo ", emailRef(ctx)];
  if (ctx.whatsapp) channels.push(" oppure su WhatsApp al numero ", link(ctx.whatsapp.label, ctx.whatsapp.href));
  return channels;
}

function sellerIdentity(ctx: LegalContext): LegalBlock {
  const items: LegalInline[][] = [
    [strong("Titolare: "), ctx.holder],
    [strong("Sede legale: "), ctx.legalAddress || legalPlaceholder],
    [strong("Partita IVA: "), ctx.vatNumber || legalPlaceholder],
  ];
  if (ctx.taxCode) items.push([strong("Codice fiscale: "), ctx.taxCode]);
  if (ctx.reaNumber) items.push([strong("Numero REA: "), ctx.reaNumber]);
  if (ctx.pecEmail) items.push([strong("PEC: "), link(ctx.pecEmail, `mailto:${ctx.pecEmail}`)]);
  items.push([strong("Email: "), emailRef(ctx)]);
  if (ctx.whatsapp) items.push([strong("WhatsApp: "), link(ctx.whatsapp.label, ctx.whatsapp.href)]);
  return { kind: "list", items };
}

/** Modulo tipo di recesso (Allegato I, parte B, della Direttiva 2011/83/UE). */
function withdrawalForm(ctx: LegalContext): LegalBlock[] {
  const recipient = [ctx.holder, ctx.legalAddress || legalPlaceholder, ctx.email || legalPlaceholder].join(", ");
  return [
    h3("Modulo tipo di recesso"),
    p("(compila e restituisci il presente modulo solo se desideri recedere dal contratto)"),
    list(
      `Destinatario: ${recipient}`,
      "Con la presente io/noi (*) notifico/notifichiamo (*) il recesso dal mio/nostro (*) contratto di vendita dei seguenti beni: …",
      "Ordinato il (*) / ricevuto il (*): …",
      "Numero d'ordine: …",
      "Nome del/dei consumatore/i: …",
      "Indirizzo del/dei consumatore/i: …",
      "Firma del/dei consumatore/i (solo se il presente modulo è inviato in versione cartacea): …",
      "Data: …",
    ),
    p("(*) Cancellare la dicitura inutile."),
  ];
}

const customsNotice = p(
  "Per le spedizioni fuori dall'Unione Europea il paese di destinazione può applicare dazi doganali, imposte di importazione (ad esempio l'IVA locale) e diritti di sdoganamento: sono a carico del destinatario e non sono compresi nel prezzo.",
);

function joinItalian(values: string[]): string {
  if (values.length <= 1) return values.join("");
  return `${values.slice(0, -1).join(", ")} e ${values[values.length - 1]}`;
}

export function privacyPolicy(ctx: LegalContext): LegalSection[] {
  return [
    {
      id: "titolare",
      title: "Titolare del trattamento",
      blocks: [
        p(
          `Questa informativa è resa ai sensi degli artt. 13 e 14 del Regolamento (UE) 2016/679 sulla protezione dei dati personali ("GDPR"), che si applica in tutta l'Unione Europea, a chi visita il sito ${ctx.shopName} e a chi vi effettua acquisti. Il titolare del trattamento dei dati personali è:`,
        ),
        sellerIdentity(ctx),
        p("Per qualsiasi domanda sul trattamento dei tuoi dati puoi scriverci ", ...contactChannels(ctx), "."),
      ],
    },
    {
      id: "dati-trattati",
      title: "Quali dati trattiamo",
      blocks: [
        h3("Dati dell'ordine"),
        p(
          "Quando acquisti, il pagamento avviene sulla pagina sicura di Stripe Checkout, che raccoglie e ci trasmette: nome e cognome, indirizzo email, numero di telefono e indirizzo di spedizione. Conserviamo inoltre i dati dell'ordine: numero d'ordine, prodotti e quantità, importi, paese di spedizione, lingua scelta sul sito e, dopo la spedizione, corriere e codice di tracciamento.",
        ),
        p(
          "I dati della carta o degli altri strumenti di pagamento sono trattati direttamente da Stripe: noi non li riceviamo e non li conserviamo.",
        ),
        h3("Opinioni sui prodotti"),
        p(
          "Dopo un acquisto puoi lasciare un'opinione indicando nome, cognome, una valutazione in stelle e un commento, collegati al tuo ordine. Le opinioni vengono pubblicate solo dopo la nostra approvazione e sul sito compaiono soltanto il nome e l'iniziale del cognome, insieme alle stelle e al commento.",
        ),
        h3("Messaggi che ci invii"),
        p(
          "Se ci contatti via email o WhatsApp trattiamo il tuo indirizzo email o numero di telefono e il contenuto dei messaggi, per risponderti.",
        ),
        h3("Dati tecnici"),
        p(
          "Per funzionare e proteggersi da abusi il sito tratta dati tecnici minimi: l'indirizzo IP, usato solo temporaneamente per limitare i tentativi ripetuti (ad esempio nella ricerca di un ordine), e i dati di navigazione registrati dai sistemi del fornitore di hosting. Il conteggio delle visualizzazioni dei prodotti è anonimo. Non usiamo cookie di profilazione né strumenti di analisi statistica: i dettagli sono nella ",
          link("Cookie Policy", legalRoutes.cookie),
          ".",
        ),
      ],
    },
    {
      id: "finalita",
      title: "Finalità e basi giuridiche",
      blocks: [
        list(
          [
            strong("Gestire l'ordine"),
            ": ricevere il pagamento, preparare e spedire i prodotti, inviarti l'avviso di spedizione via WhatsApp o email, permetterti di seguire l'ordine e gestire recesso, resi e garanzia. Base giuridica: esecuzione del contratto (art. 6, par. 1, lett. b GDPR).",
          ],
          [
            strong("Rispettare gli obblighi di legge"),
            ", in particolare contabili e fiscali. Base giuridica: obbligo legale (art. 6, par. 1, lett. c GDPR).",
          ],
          [
            strong("Rispondere alle tue richieste"),
            " inviate via email o WhatsApp. Base giuridica: misure precontrattuali o esecuzione del contratto (art. 6, par. 1, lett. b GDPR).",
          ],
          [
            strong("Pubblicare la tua opinione"),
            " sul sito. Base giuridica: il tuo consenso (art. 6, par. 1, lett. a GDPR), che puoi revocare in qualsiasi momento.",
          ],
          [
            strong("Garantire la sicurezza del sito"),
            " e prevenire abusi e frodi. Base giuridica: legittimo interesse del titolare (art. 6, par. 1, lett. f GDPR).",
          ],
        ),
        p("Non prendiamo decisioni basate unicamente su trattamenti automatizzati e non effettuiamo profilazione."),
      ],
    },
    {
      id: "conferimento",
      title: "Natura del conferimento",
      blocks: [
        p(
          "I dati richiesti al pagamento sono necessari per concludere e consegnare l'ordine: senza di essi non è possibile acquistare. Lasciare un'opinione è facoltativo.",
        ),
      ],
    },
    {
      id: "destinatari",
      title: "A chi comunichiamo i dati",
      blocks: [
        p("I dati sono trattati dal titolare e possono essere comunicati, solo per le finalità indicate, a:"),
        list(
          [
            strong("Stripe Payments Europe, Ltd."),
            " (Irlanda), che gestisce i pagamenti come titolare autonomo secondo la propria informativa privacy;",
          ],
          [
            strong("corrieri"),
            ", per consegnare il pacco (a seconda della spedizione, ad esempio Poste Italiane, BRT, GLS, SDA, DHL, UPS, FedEx o altri corrieri), che ricevono nome, indirizzo e, se necessario, telefono ed email;",
          ],
          [
            strong("fornitori di hosting e di servizi informatici"),
            " che ospitano il sito e il database, in qualità di responsabili del trattamento;",
          ],
          "consulenti e autorità pubbliche, quando previsto dalla legge (ad esempio per gli adempimenti contabili e fiscali).",
        ),
        p("I dati non vengono venduti né diffusi, salvo la pubblicazione delle opinioni descritta sopra."),
      ],
    },
    {
      id: "trasferimenti",
      title: "Trasferimenti fuori dall'Unione Europea",
      blocks: [
        p(
          "Stripe può trattare alcuni dati anche negli Stati Uniti o in altri paesi fuori dallo Spazio Economico Europeo. In questi casi il trasferimento avviene con le garanzie adeguate previste dagli artt. 44 e seguenti del GDPR, come la decisione di adeguatezza UE-USA (EU-U.S. Data Privacy Framework) o le clausole contrattuali standard approvate dalla Commissione europea. Lo stesso vale per i corrieri, quando spediamo verso paesi fuori dall'Unione Europea.",
        ),
      ],
    },
    {
      id: "conservazione",
      title: "Per quanto tempo conserviamo i dati",
      blocks: [
        list(
          [
            strong("Dati degli ordini"),
            ": per il periodo richiesto dalla normativa fiscale e contabile applicabile (in genere fino a 10 anni dalla conclusione dell'ordine).",
          ],
          [strong("Opinioni"), ": finché non vengono eliminate o finché non revochi il consenso alla pubblicazione."],
          [strong("Messaggi"), ": per il tempo necessario a gestire la richiesta e l'eventuale ordine collegato."],
          [strong("Dati tecnici"), ": per il tempo strettamente necessario alla sicurezza del sito."],
        ),
      ],
    },
    {
      id: "diritti",
      title: "I tuoi diritti",
      blocks: [
        p("In base agli artt. 15–22 del GDPR puoi chiedere in qualsiasi momento:"),
        list(
          "l'accesso ai tuoi dati e una copia degli stessi;",
          "la rettifica dei dati inesatti o incompleti;",
          "la cancellazione dei dati, salvo quelli che dobbiamo conservare per legge;",
          "la limitazione del trattamento;",
          "la portabilità dei dati che ci hai fornito;",
          "l'opposizione al trattamento basato sul legittimo interesse;",
          "la revoca del consenso (ad esempio alla pubblicazione della tua opinione), senza conseguenze sui trattamenti già effettuati.",
        ),
        p(
          "Per esercitarli scrivici ",
          ...contactChannels(ctx),
          ...(ctx.pecEmail ? [" o via PEC a ", link(ctx.pecEmail, `mailto:${ctx.pecEmail}`)] : []),
          ", indicando il numero d'ordine se la richiesta riguarda un acquisto. Ti risponderemo entro un mese (art. 12 GDPR).",
        ),
      ],
    },
    {
      id: "reclamo",
      title: "Reclamo a un'autorità di controllo",
      blocks: [
        p(
          "Se ritieni che il trattamento dei tuoi dati violi il GDPR, hai il diritto di proporre reclamo a un'autorità di controllo per la protezione dei dati, in particolare nello Stato membro in cui risiedi abitualmente, in cui lavori o in cui si è verificata la presunta violazione (art. 77 GDPR). Ad esempio:",
        ),
        list(
          [
            strong("Belgio"),
            ": Autorité de protection des données / Gegevensbeschermingsautoriteit (",
            link("www.autoriteprotectiondonnees.be", "https://www.autoriteprotectiondonnees.be"),
            ");",
          ],
          [
            strong("Italia"),
            ": Garante per la protezione dei dati personali (",
            link("www.garanteprivacy.it", "https://www.garanteprivacy.it"),
            ").",
          ],
        ),
        p(
          "L'elenco delle autorità di controllo degli altri paesi dell'Unione Europea è pubblicato dal Comitato europeo per la protezione dei dati (",
          link("www.edpb.europa.eu", "https://www.edpb.europa.eu"),
          ").",
        ),
      ],
    },
    {
      id: "whatsapp",
      title: "WhatsApp",
      blocks: [
        p(
          "Se ci scrivi su WhatsApp, oppure se ti inviamo lì l'avviso di spedizione, i messaggi passano anche attraverso il servizio WhatsApp, fornito da WhatsApp Ireland Limited (gruppo Meta), che li tratta secondo la propria informativa privacy. Se preferisci, puoi contattarci via email.",
        ),
      ],
    },
    {
      id: "modifiche",
      title: "Modifiche a questa informativa",
      blocks: [
        p(
          "Possiamo aggiornare questa informativa, ad esempio se cambiano i servizi del sito. La data dell'ultimo aggiornamento è indicata in cima alla pagina.",
        ),
      ],
    },
  ];
}

export function cookiePolicy(ctx: LegalContext): LegalSection[] {
  return [
    {
      id: "cosa-sono",
      title: "Cosa sono i cookie",
      blocks: [
        p(
          "I cookie sono piccoli file di testo che un sito salva nel browser per ricordare alcune informazioni tra una visita e l'altra. Tecnologie simili, come l'archiviazione locale del browser (localStorage e sessionStorage), funzionano in modo analogo.",
        ),
        p(`Questa pagina descrive i cookie e le tecnologie simili usati dal sito ${ctx.shopName}, gestito da ${ctx.holder}.`),
      ],
    },
    {
      id: "cookie-usati",
      title: "Cookie che usiamo",
      blocks: [
        p("Il sito usa esclusivamente cookie tecnici, strettamente necessari al suo funzionamento:"),
        list(
          [
            code("placa_locale"),
            ": ricorda la lingua che hai scelto, così non te la chiediamo a ogni visita. Durata: 1 anno.",
          ],
          [
            code("placa_admin_session"),
            ": mantiene l'accesso all'area di gestione del negozio. Viene impostato solo al personale autorizzato che effettua l'accesso, non ai visitatori. Durata: 12 ore.",
          ],
        ),
        p("Il sito non usa cookie di profilazione, cookie di analisi statistica né cookie di terze parti."),
      ],
    },
    {
      id: "tecnologie-simili",
      title: "Archiviazione locale del browser",
      blocks: [
        list(
          [
            code("placa-product-view:…"),
            " (sessionStorage): evita di contare più volte la visualizzazione dello stesso prodotto durante la visita. Non contiene dati personali e si cancella alla chiusura della scheda.",
          ],
          [
            code("placa_product_options_v2"),
            " (localStorage): usato solo nell'area di gestione, per ricordare le misure e i prezzi proposti nel modulo dei prodotti.",
          ],
        ),
      ],
    },
    {
      id: "servizi-esterni",
      title: "Pagamenti e servizi esterni",
      blocks: [
        p(
          "Il pagamento avviene sulla pagina di Stripe, fuori dal nostro sito: lì Stripe usa i propri cookie, anche per prevenire le frodi, secondo la sua politica sui cookie. Allo stesso modo, i link a WhatsApp e ai siti dei corrieri aprono servizi esterni che applicano le proprie politiche.",
        ),
      ],
    },
    {
      id: "consenso",
      title: "Perché non mostriamo un banner",
      blocks: [
        p(
          "In base all'art. 5, paragrafo 3, della Direttiva 2002/58/CE (direttiva «ePrivacy»), recepita nelle leggi nazionali degli Stati membri dell'Unione Europea, l'archiviazione di informazioni nel tuo dispositivo richiede il consenso, salvo quando è strettamente necessaria a fornire il servizio che hai richiesto. I cookie tecnici e le tecnologie simili descritti sopra rientrano in questa eccezione: per loro basta questa informativa.",
        ),
        p(
          "Lo confermano anche le indicazioni delle autorità di protezione dei dati, ad esempio quelle dell'Autorité de protection des données / Gegevensbeschermingsautoriteit belga sui cookie e le Linee guida del Garante per la protezione dei dati personali italiano sui cookie e altri strumenti di tracciamento (provvedimento del 10 giugno 2021).",
        ),
        p(
          "Per questo il sito non mostra un banner di consenso. Se in futuro introducessimo cookie non strettamente necessari, ti chiederemo prima il consenso.",
        ),
      ],
    },
    {
      id: "gestire",
      title: "Come gestire o cancellare i cookie",
      blocks: [
        p(
          "Puoi vedere e cancellare i cookie e i dati dei siti dalle impostazioni del browser, di solito nella sezione Privacy o Cronologia (ad esempio in Chrome, Safari, Firefox o Edge). Puoi anche bloccarli, ma senza il cookie della lingua il sito ti chiederà di nuovo quale lingua preferisci.",
        ),
        p(
          "Per il trattamento dei dati personali consulta la ",
          link("Privacy Policy", legalRoutes.privacy),
          ". Per domande scrivici ",
          ...contactChannels(ctx),
          ".",
        ),
      ],
    },
  ];
}

export function salesConditions(ctx: LegalContext): LegalSection[] {
  return [
    {
      id: "venditore",
      title: "Venditore",
      blocks: [
        p(`I prodotti presentati sul sito ${ctx.shopName} sono venduti da:`),
        sellerIdentity(ctx),
      ],
    },
    {
      id: "ambito",
      title: "Ambito di applicazione",
      blocks: [
        p(
          "Queste condizioni regolano gli acquisti effettuati sul sito da clienti dell'Unione Europea e degli altri paesi in cui spediamo. Effettuando un ordine dichiari di averle lette e accettate.",
        ),
        p(
          "Se acquisti come consumatore ti spettano in ogni caso le tutele previste dal diritto dell'Unione Europea, in particolare dalla Direttiva 2011/83/UE sui diritti dei consumatori e dalla Direttiva (UE) 2019/771 sulla vendita di beni, come recepite nelle leggi nazionali (ad esempio il Code de droit économique in Belgio e il Codice del Consumo, D.Lgs. 206/2005, in Italia). Queste condizioni non limitano tali tutele.",
        ),
      ],
    },
    {
      id: "prodotti",
      title: "Prodotti",
      blocks: [
        p(
          "Vendiamo targhe decorative. Misure, materiale, prezzo e disponibilità sono indicati nella scheda di ciascun prodotto. Le immagini sono rappresentative: colori e dettagli possono variare leggermente a seconda dello schermo.",
        ),
      ],
    },
    {
      id: "prezzi",
      title: "Prezzi e IVA",
      blocks: [
        p(
          "I prezzi sono espressi in euro e sono prezzi finali per il consumatore: comprendono l'IVA, ove dovuta, secondo il regime fiscale del venditore. Per le vendite a distanza verso consumatori di altri paesi dell'Unione Europea l'IVA può essere applicata tramite il regime dello sportello unico (OSS, One-Stop Shop), senza costi aggiuntivi per te.",
        ),
        p(
          "Il totale da pagare è dato dal prezzo dei prodotti più la voce «Spedizione e gestione», che dipende dal paese di spedizione e viene mostrata nella pagina di pagamento prima della conferma. Non ci sono altri costi da pagare a noi.",
        ),
        ...(ctx.shipping.world.length ? [customsNotice] : []),
      ],
    },
    {
      id: "ordine",
      title: "Ordine e conclusione del contratto",
      blocks: [
        p(
          "Per ordinare aggiungi i prodotti al carrello, scegli il paese di spedizione e prosegui al pagamento. Nella pagina di Stripe inserisci i dati di contatto, l'indirizzo di spedizione e i dati di pagamento e controlli il riepilogo prima di confermare.",
        ),
        p(
          "Il contratto si conclude quando il pagamento viene confermato. Al termine ricevi un numero d'ordine nel formato ",
          code("PL-XXXXXX"),
          ": conservalo, ti serve per seguire la spedizione e per qualsiasi richiesta.",
        ),
        p(
          "Se, per un errore eccezionale, un prodotto pagato non fosse disponibile, ti contatteremo e ti rimborseremo per intero l'importo corrispondente.",
        ),
      ],
    },
    {
      id: "pagamento",
      title: "Pagamento",
      blocks: [
        p(
          "Il pagamento avviene online tramite Stripe con carta di credito o di debito o con gli altri metodi proposti da Stripe nella pagina di pagamento. L'importo è addebitato al momento dell'ordine. Non riceviamo né conserviamo i dati della tua carta.",
        ),
      ],
    },
    {
      id: "consegna",
      title: "Spedizione e consegna",
      blocks: [
        p(
          "Zone di spedizione, tempi e tracciamento sono descritti nella pagina ",
          link("Spedizioni e resi", legalRoutes.shipping),
          ". Salvo diverso accordo, consegniamo i prodotti senza ritardo e comunque entro 30 giorni dalla conclusione del contratto (art. 18 della Direttiva 2011/83/UE).",
        ),
        p(
          "Il rischio di perdita o danneggiamento dei prodotti passa a te quando tu, o una persona da te indicata diversa dal corriere, ne entri materialmente in possesso (art. 20 della Direttiva 2011/83/UE).",
        ),
      ],
    },
    {
      id: "recesso",
      title: "Diritto di recesso",
      blocks: [
        p(
          "Se sei un consumatore puoi recedere dal contratto senza indicarne il motivo entro 14 giorni dal giorno in cui tu, o una persona da te indicata diversa dal corriere, ricevi i prodotti; se i prodotti di uno stesso ordine arrivano con consegne separate, il termine decorre dalla ricezione dell'ultimo (artt. 9 e seguenti della Direttiva 2011/83/UE).",
        ),
        h3("Come esercitarlo"),
        p(
          "Inviaci una dichiarazione esplicita ",
          ...contactChannels(ctx),
          ", indicando il numero d'ordine e i prodotti che vuoi restituire. Puoi usare il modulo tipo di recesso riportato qui sotto, ma non è obbligatorio. Basta che la comunicazione parta entro i 14 giorni.",
        ),
        h3("Restituzione dei prodotti"),
        p(
          "Ti indicheremo l'indirizzo a cui spedire i prodotti, da restituire senza ritardo e comunque entro 14 giorni dalla comunicazione di recesso. Le spese dirette di restituzione sono a tuo carico, salvo che il prodotto sia difettoso o diverso da quello ordinato.",
        ),
        p(
          "I prodotti vanno restituiti integri e ben imballati. Sei responsabile solo della diminuzione di valore dovuta a una manipolazione diversa da quella necessaria per verificarne natura, caratteristiche e funzionamento (art. 14 della Direttiva 2011/83/UE).",
        ),
        h3("Rimborso"),
        p(
          "Ti rimborseremo tutti i pagamenti ricevuti, comprese le spese di consegna standard iniziali, senza ritardo e comunque entro 14 giorni dal giorno in cui riceviamo la comunicazione di recesso, con lo stesso mezzo di pagamento usato per l'acquisto e senza costi per te. Possiamo sospendere il rimborso fino a quando riceviamo i prodotti o la prova della loro spedizione, se precedente (art. 13 della Direttiva 2011/83/UE).",
        ),
        ...withdrawalForm(ctx),
      ],
    },
    {
      id: "garanzia",
      title: "Garanzia legale di conformità",
      blocks: [
        p(
          "Tutti i prodotti godono della garanzia legale di conformità prevista dalla Direttiva (UE) 2019/771, come recepita nella legge nazionale applicabile (in Italia, ad esempio, gli artt. 128 e seguenti del Codice del Consumo). Il venditore risponde dei difetti di conformità che esistono al momento della consegna e si manifestano entro almeno due anni dalla consegna; la legge del tuo paese può prevedere un termine più lungo. I difetti che si manifestano entro un anno dalla consegna si presumono esistenti già al momento della consegna, salvo prova contraria.",
        ),
        p(
          "In caso di difetto puoi chiedere la riparazione o la sostituzione del prodotto senza spese e, nei casi previsti dalla legge, una riduzione del prezzo o la risoluzione del contratto. Scrivici ",
          ...contactChannels(ctx),
          " con il numero d'ordine, una breve descrizione e alcune foto del problema.",
        ),
      ],
    },
    {
      id: "reclami",
      title: "Reclami e risoluzione delle controversie",
      blocks: [
        p(
          "Per qualsiasi reclamo scrivici ",
          ...contactChannels(ctx),
          ": cercheremo una soluzione il prima possibile.",
        ),
        p(
          "Se non troviamo un accordo puoi rivolgerti a un organismo di risoluzione alternativa delle controversie (ADR) riconosciuto nel tuo paese o in quello del venditore. Ad esempio:",
        ),
        list(
          [
            strong("Belgio"),
            ": Service de Médiation pour le Consommateur / Consumentenombudsdienst (",
            link("www.mediationconsommateur.be", "https://www.mediationconsommateur.be"),
            ");",
          ],
          [
            strong("Italia"),
            ": gli organismi ADR iscritti nell'elenco tenuto dal Ministero delle Imprese e del Made in Italy (MIMIT).",
          ],
        ),
        p(
          "Per le controversie con un venditore di un altro paese dell'Unione Europea puoi anche chiedere assistenza gratuita alla rete dei Centri europei dei consumatori (ECC-Net), presente in ogni Stato membro. Resta salvo il tuo diritto di rivolgerti all'autorità giudiziaria.",
        ),
        p(
          "La piattaforma europea per la risoluzione online delle controversie (ODR) è stata chiusa il 20 luglio 2025, in applicazione del Regolamento (UE) 2024/3228, e non è più disponibile.",
        ),
      ],
    },
    {
      id: "legge",
      title: "Legge applicabile e foro competente",
      blocks: [
        p(
          "Il contratto è regolato dalla legge belga, legge del paese del venditore. Se sei un consumatore, in base all'art. 6 del Regolamento (CE) n. 593/2008 («Roma I») questa scelta non ti priva della protezione assicurata dalle norme imperative più favorevoli della legge del paese in cui hai la residenza abituale.",
        ),
        p(
          "Per le controversie con i consumatori domiciliati nell'Unione Europea si applica l'art. 18 del Regolamento (UE) n. 1215/2012 («Bruxelles I bis»): puoi agire davanti ai giudici dello Stato membro in cui hai il domicilio oppure davanti a quelli dello Stato membro del venditore, mentre il venditore può agire contro di te soltanto davanti ai giudici dello Stato membro in cui hai il domicilio.",
        ),
      ],
    },
  ];
}

export function shippingAndReturns(ctx: LegalContext): LegalSection[] {
  const zones: LegalInline[][] = [];
  if (ctx.shipping.italy) zones.push([strong("Italia")]);
  if (ctx.shipping.eu) zones.push([strong("Unione Europea"), ": tutti gli altri paesi membri."]);
  if (ctx.shipping.world.length) zones.push([strong("Resto del mondo"), `: ${joinItalian(ctx.shipping.world)}.`]);

  return [
    {
      id: "zone",
      title: "Dove spediamo",
      blocks: [
        ...(zones.length
          ? [p("Al momento spediamo in queste zone:"), { kind: "list", items: zones } satisfies LegalBlock]
          : [p("Le zone di spedizione sono in fase di definizione. Scrivici ", ...contactChannels(ctx), " per sapere se possiamo spedire nel tuo paese.")]),
        p("Il paese di spedizione si sceglie nel carrello, prima di procedere al pagamento."),
      ],
    },
    {
      id: "costi",
      title: "Costi di spedizione",
      blocks: [
        p(
          "Il costo dipende dalla zona di destinazione ed è indicato nella pagina di pagamento con la voce «Spedizione e gestione», prima che tu confermi l'ordine.",
        ),
        ...(ctx.shipping.world.length ? [customsNotice] : []),
      ],
    },
    {
      id: "tempi",
      title: "Tempi di preparazione e consegna",
      blocks: [
        p(
          "Di solito prepariamo e affidiamo il pacco al corriere entro 2–5 giorni lavorativi dal pagamento. È un'indicazione orientativa: nei periodi di maggiore richiesta può servire qualche giorno in più.",
        ),
        p(
          "A questo si aggiungono i tempi del corriere, che dipendono dalla destinazione. A seconda della spedizione ci affidiamo, ad esempio, a Poste Italiane, BRT, GLS, SDA, DHL, UPS, FedEx o ad altri corrieri. Salvo diverso accordo, la consegna avviene comunque entro 30 giorni dalla conclusione del contratto (art. 18 della Direttiva 2011/83/UE).",
        ),
      ],
    },
    {
      id: "tracciamento",
      title: "Avviso di spedizione e tracciamento",
      blocks: [
        p(
          "Quando il pacco parte ti avvisiamo su WhatsApp o via email con il nome del corriere e il codice di tracciamento.",
        ),
        p(
          "Puoi controllare lo stato dell'ordine in qualsiasi momento nella pagina ",
          link("Traccia ordine", "/traccia-ordine"),
          ", inserendo il numero d'ordine (nel formato ",
          code("PL-XXXXXX"),
          ") e l'email usata per il pagamento.",
        ),
      ],
    },
    {
      id: "danni",
      title: "Pacco danneggiato o incompleto",
      blocks: [
        p(
          "Al momento della consegna controlla che l'imballo sia integro. Se è visibilmente danneggiato, quando possibile accetta il pacco «con riserva» indicandolo al corriere.",
        ),
        p(
          "Se il prodotto arriva danneggiato o non corrisponde all'ordine, ti chiediamo di scriverci se possibile entro 48 ore dalla consegna ",
          ...contactChannels(ctx),
          ", con il numero d'ordine e alcune foto del pacco e del prodotto: ci aiuta a risolvere più in fretta con il corriere. Ti proporremo la sostituzione o il rimborso. Questa richiesta non limita in alcun modo la ",
          link("garanzia legale di conformità", `${legalRoutes.sales}#garanzia`),
          ".",
        ),
      ],
    },
    {
      id: "resi",
      title: "Resi e diritto di recesso",
      blocks: [
        p(
          "Se sei un consumatore hai 14 giorni dalla consegna per recedere dal contratto senza indicarne il motivo, come previsto dalla Direttiva 2011/83/UE. Per esercitare il recesso scrivici con il numero d'ordine: ti indicheremo come spedire il reso. Le spese di restituzione sono a tuo carico, salvo prodotti difettosi o non conformi all'ordine.",
        ),
        p(
          "Il rimborso, comprese le spese di consegna standard iniziali, avviene entro 14 giorni dalla tua comunicazione di recesso, con lo stesso mezzo di pagamento; possiamo attendere di ricevere i prodotti o la prova della loro spedizione. Tutti i dettagli, compreso il modulo tipo di recesso, sono nelle ",
          link("Condizioni di vendita", `${legalRoutes.sales}#recesso`),
          ".",
        ),
      ],
    },
  ];
}
