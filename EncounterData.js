/**
 * EncounterData.js - Die inhaltliche Basis für Zufallsereignisse auf der Straße.
 * Jedes Event hat ein Gewicht (Summe: 550) und Kosten für den Spieler.
 */
export const ENCOUNTERS = [
  { id: "pickpocket", weight: 100, cost: 20, title: "Loch in der Tasche", text: "Ein Rempler im Gedränge. Später merkst du: 20 € fehlen. Anfängerfehler." },
  { id: "phone_snatch", weight: 90, cost: 150, title: "Digitale Finsternis", text: "Smartphone weg! Der Ersatz kostet dich 150 € und Nerven." },
  { id: "fraud", weight: 80, cost: 30, title: "Falsches Spiel", text: "Ein Hütchenspieler hat dich abgezockt. 30 € Lehrgeld für die Straße." },
  { id: "harassment", weight: 70, cost: 15, title: "Klebrige Blicke", text: "Um die Belästigung loszuwerden, 'spendest' du 15 € für Ablenkung." },
  { id: "assault", weight: 60, cost: 60, title: "Spontane Kaltverformung", text: "Ein Schlag aus dem Nichts. Die Behandlung deiner Rippen kostet 60 €." },
  { id: "robbery", weight: 50, cost: 100, title: "Zollstation der Straße", text: "Ein Messer blitzt auf. Du gibst 100 € ab, um heil davonzukommen." },
  { id: "gang", weight: 40, cost: 80, title: "Falsches Revier", text: "Eine Gang fordert Wegzoll. Du zahlst 80 € für dein Durchgangsrecht." },
  { id: "threat", weight: 30, cost: 25, title: "Ein unmissverständlicher Rat", text: "Einschüchterung pur. Du zahlst 25 €, damit der Typ das Messer stecken lässt." },
  { id: "drunk", weight: 20, cost: 10, title: "Alkohol und Adrenalin", text: "Ein Betrunkener rempelt dich an. Dein Kleingeld (10 €) landet im Gulli." },
  { id: "hatecrime", weight: 10, cost: 50, title: "Blinder Hass", text: "Pöbelnde Gestalten beschädigen deine Ausrüstung. Reparatur: 50 €." }
];
