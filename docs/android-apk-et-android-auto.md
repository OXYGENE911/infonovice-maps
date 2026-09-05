# Infonovice Maps sur Android : APK d'essai et Android Auto (étude du 05/09/2026)

Demande d'Armelin : « évalue comment on pourrait packager l'application en APK
pour que je teste avec une vraie application Android » et « comment faire
fonctionner cette application dans Android Auto afin de tester dans une
voiture ». Ce qui suit distingue ce qui se fait EN UNE SOIRÉE de ce qui est un
chantier natif — CLAUDE.md le dit depuis le premier jour : « L'app Android
native (Kotlin, filtrage GNSS Galileo) sera un repo séparé en phase 2 ».

## 1. L'APK d'essai : la Trusted Web Activity (une soirée, zéro code)

Une **Trusted Web Activity (TWA)** emballe la PWA telle quelle dans une
application Android signée : c'est Chrome qui l'affiche, plein écran, sans
barre d'adresse, avec l'icône et le nom d'Infonovice Maps. Le service worker,
le hors-ligne, la géolocalisation, le verrou d'écran et la voix marchent comme
dans le navigateur — parce que c'EST le navigateur. Google publie l'outil
(**Bubblewrap**) et Microsoft l'interface (**PWABuilder**), qui produit un
`.apk` (test) et un `.aab` (Play Store) à partir du manifeste.

Étapes, mesurées sur la documentation :
1. `npx @bubblewrap/cli init --manifest https://maps.infonovice.fr/manifest.webmanifest`
   (ou pwabuilder.com → Android). Bubblewrap passe le manifeste à Lighthouse
   et refuse une PWA incomplète — la nôtre est installable depuis la 0.x.
2. `npx @bubblewrap/cli build` → `app-release-signed.apk` + `app-release-bundle.aab`,
   avec une clé de signature générée localement (à garder : elle identifie
   l'application pour toujours).
3. Publier `/.well-known/assetlinks.json` sur maps.infonovice.fr avec
   l'empreinte SHA-256 de la clé : c'est ce lien qui retire la barre d'adresse.
   Sans lui, l'application s'ouvre quand même, avec une barre Chrome — utile
   pour un premier essai à la main.
4. Installer l'APK sur le téléphone (« sources inconnues ») et tester.

Ce que la TWA n'apporte PAS : rien de natif. Pas d'accès aux mesures GNSS
brutes (le filtrage Galileo de la phase 2), pas de service en arrière-plan
pour un guidage écran éteint, pas d'Android Auto. Ce qu'elle apporte : une
icône, un nom, un plein écran, la Play Store si l'on veut, en une soirée.

Alternative : **Capacitor** (la voie de Family Circle, apps/mobile). C'est un
WebView plus des greffons natifs (géolocalisation en arrière-plan, GNSS brut,
notifications). Une à deux journées pour le socle, et c'est la marche
suivante SI un greffon natif devient nécessaire. Toujours pas Android Auto.

## 2. Android Auto : un chantier natif, pas un emballage

Android Auto n'affiche **aucune vue web**. Une application de navigation y
est une application Android native qui déclare la catégorie
`androidx.car.app.category.NAVIGATION` et dessine sa carte elle-même sur une
`Surface` fournie par la voiture, à travers les gabarits de l'**Android for
Cars App Library** (liste de lieux, aperçu d'itinéraire, carte de manœuvre,
estimation de trajet, alertes, intégration au combiné). Google impose ses
règles de qualité (« Car app quality »), l'assistance vocale, et une revue
avant publication ; depuis le 11/03/2026, la documentation vit sur
docs.partner.android.com/drivingux.

Le rendu de la carte : MapLibre est disponible en natif (**MapLibre Native
Android**) et la fondation publie un exemple Android Auto
(`maplibre/MapLibre-Android-Auto-Sample`). Le principe est un contournement
assumé : la carte se rend hors écran dans une `TextureView`, capturée trente
fois par seconde et recopiée sur la `Surface` de la voiture. Ça marche, et
c'est ce que font les applications libres qui sont sur Android Auto.

Ce que ça coûte, honnêtement : une application Kotlin séparée (le dépôt de
la phase 2), qui réutilise NOS services (recherche multi-sources,
itinéraire Géoplateforme, plan de recharge) par les mêmes URL publiques —
la logique métier vit dans `src/lib` en TypeScript ; en natif, on la
réécrit ou on l'embarque dans un moteur JS. Compter plusieurs semaines pour
un premier guidage Android Auto crédible, puis la revue Google (catégorie
navigation) avant qu'un testeur puisse l'installer autrement que par
l'outil de développement. Le **Desktop Head Unit (DHU)** simule la voiture
sur l'ordinateur pendant le développement ; en voiture, il faut un APK
signé installé sur le téléphone et, pour un non-développeur, un passage
par la Play Store (test interne suffit).

Apple CarPlay suit la même logique (entitlement « navigation » à demander à
Apple, application native).

## 3. Ce que je propose pour le Mondial (octobre)
- **Maintenant** : l'APK TWA pour les testeurs — même produit, une icône.
  Une soirée, et l'assetlinks à poser sur le site.
- **Après le Mondial** : ouvrir le dépôt natif (Kotlin, MapLibre Native, Car
  App Library) avec le guidage comme premier objectif — c'est la phase 2 de
  CLAUDE.md, et Android Auto est sa raison d'être.

Sources : developer.android.com/training/cars/apps/navigation,
developer.android.com/develop/ui/views/layout/webapps/guide-trusted-web-activities-version2,
github.com/pwa-builder/pwabuilder-google-play, github.com/maplibre/MapLibre-Android-Auto-Sample.
