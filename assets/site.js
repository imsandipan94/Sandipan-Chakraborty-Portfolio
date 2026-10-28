/* Mobile menu, image zoom, and pause videos that are off-screen. No dependencies. */
(function () {
  var btn = document.querySelector('.menu-btn');
  var links = document.getElementById('nav-links');
  if (btn && links) {
    btn.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.textContent = open ? 'CLOSE' : 'MENU';
    });
  }

  // Click any image inside <figure> to view it full size.
  var lb = document.createElement('div');
  lb.className = 'lb';
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-label', 'Image viewer');
  lb.innerHTML = '<button type="button" aria-label="Close">CLOSE</button><img alt="">';
  document.body.appendChild(lb);
  var lbImg = lb.querySelector('img');
  function closeLb() { lb.classList.remove('on'); }
  lb.addEventListener('click', closeLb);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeLb(); });
  document.querySelectorAll('figure img').forEach(function (img) {
    img.addEventListener('click', function () {
      lbImg.src = img.currentSrc || img.src;
      lbImg.alt = img.alt;
      lb.classList.add('on');
    });
  });

  // Only play videos while they are on screen.
  var vids = document.querySelectorAll('video[data-autoplay]');
  if ('IntersectionObserver' in window && vids.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.play().catch(function () {}); } else { en.target.pause(); }
      });
    }, { threshold: 0.25 });
    vids.forEach(function (v) { io.observe(v); });
  }
})();
