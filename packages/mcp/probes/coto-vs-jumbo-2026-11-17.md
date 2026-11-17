# Coto vs Jumbo anonymous search

Ran: 2026-11-17 01:13:21 ART.

Coto endpoint: `GET https://ac.cnstrc.com/search/{query}?key=<public browser key>&section=Products&num_results_per_page=1`.
No cookies, no Coto session, and no store id on the query string.
Shelf price is `data.price[store=200].listPrice` (pesos, as returned).
Store 200 is chosen locally: it is the branch the public storefront uses when no address is saved, and that row is already in the response.
If that row has no positive listPrice, the shelf falls back to `data.product_list_price` and the row says so.
List price is `data.product_list_price` when it differs from the shelf.
EAN is `data.product_main_ean`. Brand is `data.product_brand`.
Size is the pack net content, taken from the product name (`value`) and marked `from name`.
The response has no net-content field. `data.product_format_quantity` and `data.product_format` are the unit `formatPrice` is quoted per, and are not the size.
Available is whether "200" is in `data.store_availability`.

## Coto

| # | Query | Name | Shelf price (ARS) | List price | EAN | Brand | Size | Available | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | leche entera | Leche Larga Vida Entera Ua Clasica 3% LA SERENISIMA 1l | 3030 | — | 7790742363008 | LA SERENISIMA | from name: 1l | yes | — |
| 2 | arroz largo fino | Arroz Largo Fino Dos Hnos. Paq 1 Kgm | 2100 | — | 7790503199082 | DOS HERMANOS | from name: 1 Kgm | yes | — |
| 3 | fideos spaghetti | Fideos Spaghetti N° 7 LUCCHETTI 500g | 1850 | — | 7790070336385 | LUCCHETTI | from name: 500g | yes | formatPrice 3700 differs (unit reference, not the shelf) |
| 4 | aceite de girasol | Aceite Girasol NATURA Botella 1.5 L | 7464 | — | 7790272001029 | NATURA | from name: 1.5 L | yes | formatPrice 4976 differs (unit reference, not the shelf) |
| 5 | azucar | Azúcar La Campechana 1kg | 1390 | — | 659525879112 | LA CAMPECHANA | from name: 1kg | yes | — |
| 6 | yerba mate | Yerba Mate Suave PLAYADITO 1 Kg | 5250 | — | 7793704000928 | PLAYADITO | from name: 1 Kg | yes | — |
| 7 | harina 0000 | Harina Trigo 0000 Fortificado Con Hierro Favorita 1kg | 1700 | — | 7790070562265 | FAVORITA | from name: 1kg | yes | — |
| 8 | huevos | Huevo blanco grande maple CYCLAMEN 30u | 9990 | 7999 | 7798187930045 | CYCLAMEN | from name: 30u | yes | formatPrice 333 differs (unit reference, not the shelf) |
| 9 | pan lactal | Pan Blanco LACTAL 315g | 3612.99 | — | 7793890258769 | LACTAL | from name: 315g | yes | formatPrice 11469.81 differs (unit reference, not the shelf) |
| 10 | papel higienico | Papel Higiénico HIGIENOL Plus Fusión Doble Hoja 30 M 4 Un | 4936.99 | — | 7790250015536 | HIGIENOL | from name: 30 M 4 Un | yes | formatPrice 411.42 differs (unit reference, not the shelf) |

Shelf price 10/10, EAN 10/10, brand 10/10, size 10/10.

## Jumbo

Existing VTEX adapter: `getAdapter('jumbo').resolveLocation('1425')`, then `search(query, ctx, { limit: 5 })`. Top result only. No price check and no cart.
Shelf price is `price.display`. List price is `listPrice.display` when the adapter set one. EAN is `ean`. Brand is `brand`.
Size is the pack net content, taken from `name` and marked `from name`. `unitMultiplier` and `measurementUnit` are the selling unit, and Product has no net-content field, so they are not the size. Available is `available`.

| # | Query | Name | Shelf price (ARS) | List price | EAN | Brand | Size | Available | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | leche entera | Leche Entera 3% Sachet 1 Lts La Serenísima | $ 2.190,00 | — | 7790742348302 | LA SERENISIMA | from name: 1 Lts | yes | — |
| 2 | arroz largo fino | Arroz Grano Largo Fino 1 Kg Gallo | $ 2.590,00 | — | 7790070431448 | GALLO | from name: 1 Kg | yes | — |
| 3 | fideos spaghetti | Fideos Spaghetti N°3 500 Grs Matarazzo | $ 1.990,00 | — | 7790070336309 | MATARAZZO | from name: 500 Grs | yes | — |
| 4 | aceite de girasol | Aceite De Girasol 1.5 L Cañuelas | $ 6.990,00 | — | 7792180001665 | CAÑUELAS | from name: 1.5 L | yes | — |
| 5 | azucar | — | — | — | — | — | — | — | no results |
| 6 | yerba mate | Yerba Mate con Palo Sabor Boldo y Menta 500 Grs Cruz De Malta | $ 2.790,00 | — | 7790070509062 | CRUZ DE MALTA | from name: 500 Grs | yes | — |
| 7 | harina 0000 | Harina 0000 Vit X 1 Kg Favorita | $ 1.690,00 | — | 7790070562265 | FAVORITA | from name: 1 Kg | yes | — |
| 8 | huevos | Huevos Blancos Extra Grandes 12 Un Cuisine & Co | $ 4.690,00 | — | 7792052073073 | Cuisine & CO | from name: 12 Un | yes | — |
| 9 | pan lactal | Pan Blanco Con Masa Madre 500 Grs Artesano | $ 9.790,00 | — | 7793890260885 | ARTESANO | from name: 500 Grs | yes | — |
| 10 | papel higienico | Papel Higienico Doble Hoja 4x30 M Family Care | $ 4.690,00 | — | 7792052998727 | FAMILY CARE | from name: 4x30 M | yes | — |

Shelf price 9/10, EAN 9/10, brand 9/10, size 9/10.

Decision: Coto — anonymous Constructor search returned a numeric shelf price greater than 0 on 10 of 10 top results.
