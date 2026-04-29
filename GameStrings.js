export const STRINGS = {
    ui: {
        loading: (city) => `Lade Daten für ${city} …`,
        errorLoading: (msg) => `Fehler beim Laden der Karte: ${msg}`,
        noScenario: 'Konnte kein gültiges Start-Szenario mit Kneipe generieren.',
        budget: (val) => `${val} €`,
        cooldown: (sec) => `Ziel erreicht, aber Cooldown aktiv: ${sec}s`
    },
    interactions: {
        pub: {
            title: (name) => `Kneipe: ${name}`,
            optionA: (city) => `Sprich mit dem Barkeeper. Wenn du ihm 50 Euro Trinkgeld gibst, erzählt er dir vielleicht, wie die Polizei in ${city} organisiert ist.`,
            optionB: (risk) => `Ein unseriös wirkender Gast bietet dir an, dich fachkundig über Einbruchsmöglichkeiten in der Stadt für ein einmaliges Beratungshonorar von 75 Euro und einer 20-prozentigen Gewinnbeteiligung zu beraten (Risiko: ${risk}%).`,
            optionC: (risk) => `Straßenraub (Risiko: ${risk}%)`,
            optionD: 'Nur Infos kaufen (Sicher) (10 €)',
            success: (task, reward) => `✅ Erfolg! Du kassierst ${reward} € für "${task}".`,
            caught: (fine) => `🚨 ERWISCHT! Strafe: ${fine} €.`,
            alreadyHaveRadar: '📡 Du hast die Polizeifrequenz bereits!',
            noMoney: (cost) => `❌ Nicht genug Geld! Du brauchst ${cost} €.`,
            barkeeperInfo: (count) => `Der Barkeeper meint, dass hier ${count} Polizeiwache(n) in der Umgebung sind.`
        }
    },
    tutorial: {
        welcome: 'Willkommen in der Unterwelt.',
        firstMove: 'Guter Anfang. Bleib im Schatten.'
    }
};
