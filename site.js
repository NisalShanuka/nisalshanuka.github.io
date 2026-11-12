/* Nisal Shanuka Perera · page-local behaviour (the engine stays untouched).
   Marks the nav link for the section in view. Everything else is CSS. */
(function () {
  'use strict';
  var links = Array.prototype.slice.call(document.querySelectorAll('.bar__nav a'));
  if (!links.length || !('IntersectionObserver' in window)) return;

  var byId = {};
  links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      links.forEach(function (a) { a.removeAttribute('aria-current'); });
      var a = byId[e.target.id];
      if (a) a.setAttribute('aria-current', 'true');
    });
  }, { rootMargin: '-45% 0px -50% 0px' });

  ['top', 'services', 'experience', 'work', 'contact'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) io.observe(el);
  });
})();
