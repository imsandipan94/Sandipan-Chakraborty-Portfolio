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

/* Hero phones: each screen plays three game trailers for 5 seconds each, in a loop. */
(function () {
  var SECONDS = 5;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('.phone[data-rotate]').forEach(function (phone) {
    var vids = Array.prototype.slice.call(phone.querySelectorAll('video.rv'));
    var cap = phone.querySelector('.cap');
    if (vids.length < 2) return;
    var i = 0, timer = null, visible = false;
    function start(v) { return parseFloat(v.getAttribute('data-start') || '0') || 0; }
    function playFrom(v) {
      try { v.currentTime = start(v); } catch (e) {}
      var p = v.play(); if (p && p.catch) p.catch(function () {});
    }
    function warm(v) { if (v.preload !== 'auto') { v.preload = 'auto'; try { v.load(); } catch (e) {} } }
    function show(n) {
      var prev = vids[i];
      i = n;
      var v = vids[i];
      playFrom(v);
      v.classList.add('on');
      if (prev !== v) { prev.classList.remove('on'); setTimeout(function () { if (!vids[i] || vids[i] !== prev) prev.pause(); }, 500); }
      if (cap) { cap.classList.add('fade'); setTimeout(function () { cap.textContent = v.getAttribute('data-title'); cap.classList.remove('fade'); }, 200); }
      warm(vids[(i + 1) % vids.length]);
    }
    function tick() { show((i + 1) % vids.length); }
    function run() { if (!timer && !reduce) timer = setInterval(tick, SECONDS * 1000); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } vids.forEach(function (v) { v.pause(); }); }
    warm(vids[1]);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) {
        visible = en[0].isIntersecting;
        if (visible) { playFrom(vids[i]); run(); } else { stop(); }
      }, { threshold: 0.25 }).observe(phone);
    } else { playFrom(vids[0]); run(); }
  });
})();
