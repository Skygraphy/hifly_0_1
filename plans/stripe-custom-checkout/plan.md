# Stripe Custom Checkout (Payment Element statt Redirect)

## Context

Der Checkout leitet aktuell komplett auf `checkout.stripe.com` weiter
(`stripe.checkout.sessions.create({ mode: "payment", ... })` +
`redirect(checkoutSession.url)` in `src/app/checkout/actions.ts`). Der
User möchte stattdessen möglichst in der eigenen App bleiben und hat sich
für die Variante mit voller gestalterischer Kontrolle entschieden: ein
eigenes, im HiFly-Design gehaltenes Zahlungsformular auf einer eigenen
Seite, gerendert über Stripe **Payment Element**, bestätigt per
`checkout.confirm()` im Browser statt per Server-Redirect.

Laut Stripe-eigenen Best Practices (siehe `stripe-best-practices`-Skill,
`references/payments.md`, Abschnitt "Integration surfaces"): *"When using
the Payment Element, back it with the Checkout Sessions API (via
`ui_mode: 'custom'`) over a raw PaymentIntent where possible."* — d.h. wir
bauen NICHT auf einem rohen PaymentIntent auf, sondern auf einer Checkout
Session. Das ist wichtig, weil unsere Session bereits Rabatt-Coupons,
Versandkosten und Adress-Erfassung über die Checkout-Session-API abwickelt
(siehe `createCheckoutSession`) — das bei einem rohen PaymentIntent alles
manuell nachzubauen wäre unnötige Arbeit und eine Fehlerquelle.

**Korrektur nach Prüfung der installierten SDK-Typen (`stripe` v22.5.0,
API-Version `2026-07-29.dahlia`, `@stripe/stripe-js` v6.x):** Der Wert
`ui_mode: "custom"` aus dem Skill-Dokument ist in dieser (neueren)
API-Version umbenannt zu **`ui_mode: "elements"`** (`Session.UiMode =
'elements' | 'embedded_page' | 'form' | 'hosted_page'` in
`node_modules/stripe/esm/resources/Checkout/Sessions.d.ts` — `'custom'`
existiert dort nicht mehr). Client-seitig gibt es dafür in
`@stripe/react-stripe-js` (aktuell v6.8.1) **keine** React-Hooks/-Provider
(`CheckoutProvider`/`useCheckout` existieren nicht in dieser Version) —
nur für `embedded_page` (`EmbeddedCheckoutProvider`) und das
Beta-only `form`. Für `ui_mode: "elements"` muss direkt das vanilla
`@stripe/stripe-js`-API verwendet werden: `stripe.initCheckoutElementsSdk({
clientSecret, elementsOptions })` → `.loadActions()` → `actions.confirm()`
sowie `.createPaymentElement().mount(ref)` (Typen siehe
`node_modules/@stripe/stripe-js/dist/stripe-js/checkout.d.ts`). Deshalb
wird **nur** `@stripe/stripe-js` installiert, **nicht**
`@stripe/react-stripe-js` (unnötig für dieses Muster) — eigener kleiner
React-Wrapper um `initCheckoutElementsSdk` statt fertiger Komponenten.

**Wichtiger Fund aus der Recherche:** Der Webhook
(`src/app/api/stripe/webhook/route.ts`, Events `checkout.session.completed`
/`.expired`, `charge.refunded`) bleibt **komplett unverändert** — eine
Custom-Checkout-Session ist weiterhin eine ganz normale Checkout Session,
feuert dieselben Events mit derselben Objektform (inkl.
`collected_information.shipping_details` für die Lieferadresse). Der
Webhook ist und bleibt die einzige Quelle der Wahrheit für `status: "paid"`
— daran ändert dieser Umbau nichts.

## Aktueller Ablauf → neuer Ablauf

| | Bisher | Neu |
|---|---|---|
| Warenkorb "Zur Kasse" | `createCheckoutSession` validiert Cart, legt Order+Zeilen an, erstellt Stripe-Session, `redirect()` zu Stripe | `createCheckoutSession` validiert Cart, legt Order+Zeilen an, gibt `{success:true, id: orderId}` zurück — Client navigiert zu `/checkout/[orderId]` |
| "Jetzt bezahlen" (offene Bestellung) | `resumeCheckoutSession` erstellt neue Stripe-Session aus den bereits gespeicherten Order-Zeilen, `redirect()` | `PayNowButton` navigiert direkt zu `/checkout/[orderId]` (kein Server-Call mehr nötig) |
| Zahlungsformular | Stripe-gehostete Seite | Eigene Seite `/checkout/[orderId]`, Stripe **Payment Element** im HiFly-Design |
| Session-Erstellung fürs Formular | — | Neue, konsolidierte Funktion `getCheckoutClientSecret(orderId)` (ersetzt `resumeCheckoutSession` inhaltlich) — baut **immer** aus den bereits committeten `orderLineItems`-Zeilen (Preis/Label/Menge), egal ob frisch angelegt oder wiederaufgenommen. Das ist derselbe Trick, den `resumeCheckoutSession` heute schon nutzt, jetzt aber der EINZIGE Pfad, nicht nur der Resume-Sonderfall. |
| Bestätigung | Stripe-Redirect zu `success_url`/`cancel_url` | `client.confirm()` im Browser; bei Kartenzahlung KEIN Redirect — wir navigieren selbst zu `/checkout/success`. `return_url` bleibt als Fallback für redirect-basierte Zahlarten (z.B. giropay, 3-D-Secure-Interstitial) gesetzt. |
| Webhook | `checkout.session.completed`/`.expired`, `charge.refunded` | **unverändert** |

## Änderungen im Detail

### 1. Neue Abhängigkeiten

`npm install @stripe/stripe-js @stripe/react-stripe-js` — Client-seitige
Stripe-Bibliotheken, bisher nicht installiert (nur das Server-SDK `stripe`
ist vorhanden, siehe `src/lib/stripe.ts`).

### 2. Neue Umgebungsvariable

`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — muss client-seitig lesbar sein
(`NEXT_PUBLIC_`-Präfix), analog zu den bestehenden `NEXT_PUBLIC_*`-Einträgen
in `.env.example`. Ergänzung in `.env.example` neben `STRIPE_SECRET_KEY`;
der User trägt den echten Wert selbst in `.env.local` ein (Secrets-Datei,
wird nicht von mir bearbeitet).

### 3. `src/app/checkout/actions.ts`

- `createCheckoutSession`: der komplette Block ab `stripe.checkout.sessions.create(...)`
  bis `redirect(checkoutSession.url)` entfällt. Stattdessen: nach dem
  Insert von `orders`/`orderLineItems` direkt `return { success: true, id: orderRow.id }`.
  Kein Stripe-API-Call mehr in dieser Funktion.
- `resumeCheckoutSession` → umgebaut/umbenannt zu `getCheckoutClientSecret(orderId)`:
  - Ownership-/Status-Prüfung bleibt identisch (nur eigene, `pending_payment`-Bestellungen).
  - `stripe.checkout.sessions.create({...})`-Aufruf bleibt inhaltlich
    gleich (line_items aus den gespeicherten `orderLineItems`, Coupon,
    `shipping_options`, `shipping_address_collection`), **zusätzlich**:
    - `ui_mode: "custom"`
    - `return_url: `${baseUrl}/checkout/success?order=${orderId}`` statt
      `success_url`/`cancel_url`
  - Rückgabe: `{ success: true, clientSecret: checkoutSession.client_secret }`
    statt `redirect(...)`. Neuer Rückgabetyp `CheckoutClientSecretResult`
    (eigenes Interface neben `ShopActionResult`, da `clientSecret` kein
    Feld von `ShopActionResult` ist).
  - `stripeCheckoutSessionId` wird wie bisher auf der Order aktualisiert.

### 4. Neue Seite `src/app/checkout/[orderId]/page.tsx`

Server Component, gleiches Schutzmuster wie `/checkout/success`:
Login-Pflicht (`redirect("/login")`), danach Ownership-Check per
`orders`-Query (userId muss passen, Status muss `pending_payment` sein —
sonst `redirect("/orders")` mit Hinweis, analog zum bestehenden Verhalten
von `getCheckoutClientSecret`). Lädt zusätzlich die Order-Summary
(Zeilen + Preise, gleiche Query-Form wie in `src/app/orders/page.tsx`) für
eine Bestellübersicht neben dem Zahlungsformular. Rendert
`<CustomCheckoutClient orderId={...} summary={...} />`.

### 5. Neue Client-Komponente `src/app/checkout/[orderId]/custom-checkout-client.tsx`

- `loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)` einmalig
  außerhalb der Komponente (Modul-Scope), gleiches Muster wie Stripes
  eigene Beispiele.
- `<CheckoutProvider stripe={stripePromise} options={{ fetchClientSecret, elementsOptions: { appearance } }}>`
  — `fetchClientSecret` ruft `getCheckoutClientSecret(orderId)` auf und
  gibt `clientSecret` zurück (wird von Stripe automatisch erneut
  aufgerufen, falls die Session abläuft, während der User auf der Seite
  bleibt — kein eigenes Retry-Handling nötig).
- `appearance`: `variables` (colorPrimary, colorBackground,
  borderRadius, fontFamily) an die Tailwind-Theme-Tokens angelehnt (coral
  Primärfarbe, dunkler Hintergrund) statt Stripes Default-Look — das ist
  der eigentliche Mehrwert der Payment-Element-Variante gegenüber der
  gehosteten Seite.
- Innerhalb des Providers: eigene Komponente mit `useCheckout()` +
  `<PaymentElement />` + Button "Bezahlen", der `checkout.confirm()`
  aufruft. Lade-/Fehlerzustand wie bei den übrigen Server-Action-Buttons
  im Projekt (`isPending`, `showAppAlert` bei Fehler). Bei Erfolg (kein
  Redirect nötig, z.B. Kartenzahlung): `router.push('/checkout/success?order=' + orderId)`.
  Bei redirect-pflichtigen Zahlarten übernimmt Stripe selbst die
  Weiterleitung zu `return_url` (führt ebenfalls auf `/checkout/success`).

### 6. `src/app/cart/cart-page-client.tsx`

`handleCheckout` ändert sich minimal: statt den (bisher nie erreichten)
Erfolgsfall zu ignorieren, wird bei `result.success` per
`router.push(`/checkout/${result.id}`)` navigiert. `useRouter` neu
importiert.

### 7. `src/app/orders/orders-list-client.tsx` (`PayNowButton`)

Vereinfacht sich: kein Server-Action-Call mehr nötig, `onClick` wird zu
einem einfachen `<Link href={`/checkout/${orderId}`}>` (oder
`router.push`), da `/checkout/[orderId]` die Session-Erstellung selbst
über `getCheckoutClientSecret` anstößt. `resumeCheckoutSession`-Import
entfällt.

### 8. `/checkout/success`, `/checkout/cancel`

- `/checkout/success` bleibt inhaltlich unverändert (Polling auf
  `getOrderStatus`, Warenkorb-Leerung beim Mount) — funktioniert
  unabhängig davon, ob der User per eigenem `router.push` oder per
  Stripe-`return_url`-Redirect dort ankam.
- `/checkout/cancel` wird nach dem Umbau nicht mehr angesteuert (kein
  `cancel_url` mehr im Custom-Checkout-Modus). Bleibt im Code, aber
  unverlinkt — im Plan vermerkt, damit das später bewusst aufgeräumt
  werden kann, statt unbemerkt zu Totcode zu werden.

### 9. Was NICHT angefasst wird

- `src/app/api/stripe/webhook/route.ts` — keine Änderung (siehe Context).
- DB-Schema (`orders`, `orderLineItems`) — keine Änderung, `stripeCheckoutSessionId`
  wird weiterhin genauso befüllt.
- Rabatt-Coupon-Logik (`ensureStripeCouponForTier`), Kunden-Anlage
  (`ensureStripeCustomer`) — unverändert, nur in `getCheckoutClientSecret`
  statt in zwei getrennten Funktionen verwendet.

## Verifikation

- `npx tsc --noEmit`, `npx eslint` auf allen geänderten/neuen Dateien,
  `npm test`.
- Kein bestehender e2e-Test deckt den Stripe-Checkout-Flow ab (geprüft,
  keine Treffer in `e2e/`) — Verifikation daher live im Browser mit
  Stripe-Testkarte (`4242 4242 4242 4242`), Playwright-Skript unter
  `scripts/verify-*.mjs` (danach gelöscht): Warenkorb → "Zur Kasse" →
  landet auf `/checkout/[orderId]` mit sichtbarem Payment Element im
  HiFly-Design → Testkarte eingeben → "Bezahlen" → landet ohne
  Seitenwechsel auf `/checkout/success` → Status wechselt nach Webhook-
  Ankunft auf "paid" → Warenkorb ist geleert → Bestellung erscheint unter
  "Meine Bestellungen". Zusätzlich: abgebrochene Zahlung (z.B.
  Testkarte `4000 0000 0000 0002`, wird abgelehnt) zeigt einen
  Inline-Fehler auf derselben Seite, keine Weiterleitung. Und: "Jetzt
  bezahlen" bei einer bereits bestehenden `pending_payment`-Bestellung
  aus "Meine Bestellungen" führt ebenfalls zu `/checkout/[orderId]` und
  funktioniert identisch.
