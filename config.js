/* Where the app finds its API and which Google sign-in client it is (ROADMAP PWA-D1).
   Both are public by nature: the server refuses every request without an allowlisted
   Google sign-in. Set 2026-09-25.
   A module (2026-10-02): app.js imports it; scripts/pwa-modules.cjs runs it for the tests and the publish guard. */
const CONFIG=Object.freeze({
  /** The thin Apps Script API deployment's URL, ending /exec. */
  apiUrl:'https://script.google.com/macros/s/AKfycbyaYpc90ltbBS7QTpk52MVS54qJcjqpsoO06pTaUfJztFnOu7qO3BdRq8pT_qybzq57Nw/exec',
  /** Prefix of this app's keys in device storage: the three apps share one origin (../app-kit's auth.js). */
  storage:'property-portfolio',
  /** This app shows its own sign-in screen (../app-kit's calls.js): signed out is an answer, not a wait for Google. */
  ownSignIn:true,
  /** What kind each action is (calls.js). `reads` only read: they wait 45 seconds and are tried once more, and the saved copy
      stays on screen. `slow` take long by nature (an upload): one try of three minutes. Every other action is a
      save: an id, a first try, a pause, one retry with the same id. A save here reads the whole workbook, writes
      and reads back, so its two tries wait longer than the other apps': 20 s and 68 s (90 s in all). */
  waits:Object.freeze({reads:Object.freeze(['all','home','attention','portfolio','company_compliance','maintenance','compliance','document.open']),
    slow:Object.freeze(['document.upload']),save:Object.freeze({first:20000,retry:68000})}),
  /** The OAuth Web client ID, ending .apps.googleusercontent.com. */
  clientId:'602190595584-hfppne6gp2a7ga89li1oj1m7j6lo3lop.apps.googleusercontent.com'
});
export { CONFIG };
