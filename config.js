/* Where the app finds its API and which Google sign-in client it is (ROADMAP PWA-D1).
   Both are public by nature: the server refuses every request without an allowlisted
   Google sign-in. Set 2026-09-25. */
(function (root) {
  'use strict';
  root.PortfolioConfig=Object.freeze({
    /** The thin Apps Script API deployment's URL, ending /exec. */
    apiUrl:'https://script.google.com/macros/s/AKfycbyaYpc90ltbBS7QTpk52MVS54qJcjqpsoO06pTaUfJztFnOu7qO3BdRq8pT_qybzq57Nw/exec',
    /** The OAuth Web client ID, ending .apps.googleusercontent.com. */
    clientId:'602190595584-hfppne6gp2a7ga89li1oj1m7j6lo3lop.apps.googleusercontent.com'
  });
})(globalThis);
