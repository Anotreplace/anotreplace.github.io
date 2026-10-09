// Page Documents : téléchargement d'un document, d'une sélection ou de tout,
// dans un fichier .zip fabriqué directement dans le navigateur (aucun service extérieur).
(function () {
  var zone = document.querySelector('[data-docs]');
  if (!zone) return;
  var cases = Array.prototype.slice.call(zone.querySelectorAll('.docl input[type="checkbox"]'));
  var tous = zone.querySelector('[data-docs-tous]');
  var btnSel = zone.querySelector('[data-docs-selection]');
  var btnTout = zone.querySelector('[data-docs-tout]');
  var nb = zone.querySelector('[data-docs-nb]');
  var etat = zone.querySelector('[data-docs-etat]');

  function taille(o) { return o < 1024 * 1024 ? Math.round(o / 1024) + ' Ko' : (o / 1024 / 1024).toFixed(1).replace('.', ',') + ' Mo'; }

  // Taille de chaque fichier, lue sur le serveur (toujours à jour)
  cases.forEach(function (c) {
    var cible = c.parentNode.querySelector('[data-taille]');
    fetch(c.value, { method: 'HEAD' }).then(function (r) {
      var l = Number(r.headers.get('Content-Length'));
      if (l && cible) cible.textContent = '· PDF, ' + taille(l);
    }).catch(function () {});
  });

  function maj() {
    var n = cases.filter(function (c) { return c.checked; }).length;
    btnSel.disabled = n === 0;
    nb.textContent = n ? '(' + n + ')' : '';
    tous.checked = n === cases.length;
    tous.indeterminate = n > 0 && n < cases.length;
    cases.forEach(function (c) { c.closest('.docl').classList.toggle('is-selected', c.checked); });
  }
  cases.forEach(function (c) { c.addEventListener('change', maj); });
  tous.addEventListener('change', function () { cases.forEach(function (c) { c.checked = tous.checked; }); maj(); });
  maj();

  // ---------- Fabrication d'un .zip (fichiers stockés tels quels, les PDF sont déjà compressés) ----------
  var TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(octets) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < octets.length; i++) c = TABLE[(c ^ octets[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function zip(fichiers) {
    var enc = new TextEncoder();
    var morceaux = [], central = [], decalage = 0;
    var d = new Date();
    var heure = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    var jour = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    fichiers.forEach(function (f) {
      var nom = enc.encode(f.nom), data = f.octets, crc = crc32(data);
      var tete = new DataView(new ArrayBuffer(30));
      tete.setUint32(0, 0x04034b50, true); tete.setUint16(4, 20, true); tete.setUint16(6, 0x0800, true); // noms en UTF-8
      tete.setUint16(8, 0, true); tete.setUint16(10, heure, true); tete.setUint16(12, jour, true);
      tete.setUint32(14, crc, true); tete.setUint32(18, data.length, true); tete.setUint32(22, data.length, true);
      tete.setUint16(26, nom.length, true); tete.setUint16(28, 0, true);
      morceaux.push(tete.buffer, nom, data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint16(10, 0, true); c.setUint16(12, heure, true); c.setUint16(14, jour, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, nom.length, true); c.setUint32(42, decalage, true);
      central.push(c.buffer, nom);
      decalage += 30 + nom.length + data.length;
    });
    var tailleCentral = central.reduce(function (s, b) { return s + (b.byteLength || b.length); }, 0);
    var fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, fichiers.length, true); fin.setUint16(10, fichiers.length, true);
    fin.setUint32(12, tailleCentral, true); fin.setUint32(16, decalage, true);
    return new Blob(morceaux.concat(central, [fin.buffer]), { type: 'application/zip' });
  }

  function enregistrer(blob, nom) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = nom;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function telecharger(liste, nomZip) {
    if (!liste.length) return;
    // Un seul document : téléchargement direct, sans .zip
    if (liste.length === 1) {
      var a = document.createElement('a');
      a.href = liste[0].value; a.download = liste[0].getAttribute('data-nom');
      document.body.appendChild(a); a.click(); a.remove();
      return;
    }
    btnSel.disabled = btnTout.disabled = true;
    etat.textContent = 'Préparation de ton fichier .zip (' + liste.length + ' documents)…';
    Promise.all(liste.map(function (c) {
      return fetch(c.value).then(function (r) {
        if (!r.ok) throw new Error(c.value);
        return r.arrayBuffer();
      }).then(function (b) { return { nom: c.getAttribute('data-nom'), octets: new Uint8Array(b) }; });
    })).then(function (fichiers) {
      enregistrer(zip(fichiers), nomZip);
      etat.textContent = 'C\'est prêt : ' + liste.length + ' documents dans « ' + nomZip + ' ».';
    }).catch(function () {
      etat.textContent = 'Le téléchargement groupé n\'a pas abouti. Tu peux télécharger chaque document en cliquant dessus.';
    }).then(function () { btnTout.disabled = false; maj(); });
  }

  btnSel.addEventListener('click', function () {
    telecharger(cases.filter(function (c) { return c.checked; }), 'Anotreplace-documents.zip');
  });
  btnTout.addEventListener('click', function () { telecharger(cases, 'Anotreplace-tous-les-documents.zip'); });
})();
