// LES ICÔNES NE SE GÉNÈRENT PLUS ICI (LOGO-1, 03/09).
//
// Jusqu'à la 1.67, ce script DESSINAIT l'icône par le code — une épingle sur
// fond bleu, reproductible sans outil graphique, fidèle au principe « pas de
// binaire opaque au dépôt ».
//
// DEPUIS LOGO-1, l'icône est la MASCOTTE OFFICIELLE d'Infonovice — le chien à
// la carte — fournie par Armelin (pack du 30/08, généré via GPT, remis le
// 03/09). C'est une œuvre, pas un dessin procédural : elle ne PEUT pas se
// régénérer par le code. Le principe s'adapte plutôt qu'il ne se contourne :
//   · les SOURCES canoniques vivent dans /brand (1024 px, transparentes),
//     avec leur provenance écrite ici ;
//   · les déclinaisons de /public/icones en dérivent par redimensionnement
//     Lanczos + quantification 256 couleurs (l'illustration est en aplats,
//     le grain de génération ne mérite pas ses kilo-octets) — la recette est
//     documentée dans la PR LOGO-1 ;
//   · ce script REFUSE désormais de tourner, pour qu'un `node` distrait
//     n'écrase pas la mascotte par l'ancienne épingle.
console.error(
  'Les icônes sont désormais la mascotte officielle (voir /brand et LOGO-1).\n'
  + 'Ce script ne génère plus rien — il protégeait l’ancienne épingle dessinée'
  + ' par code.',
);
process.exit(1);
