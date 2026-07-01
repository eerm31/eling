(() => {
  const sceneNames = ["intro", "reveal", "letter"];

  // Preloaded SFX — hoisted so Gengar's handler and init() both share the same element
  const _selectSFX = (() => { try { const a = new Audio('assets/select-button.mp3'); a.volume = 1.0; return a; } catch(_){return null;} })();
  const _playSelectSFX = () => { if (!_selectSFX) return; try { const s = _selectSFX.cloneNode(); s.volume = 1.0; s.play().catch(() => {}); } catch(_) {} };
  const sceneLabels = {
    intro: "opening screen",
    reveal: "reveal scene",
    letter: "letter scene",
  };
  let currentSceneIndex = 0;
  let isTransitioning = false;
  const sceneStatus = document.getElementById("scene-status");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ── Sound Manager ──────────────────────────────────────────────────────────
  const SoundManager = (() => {
    const BGM_URLS = {
      intro:  'assets/lustrous-moonlight.mp3',
      reveal: 'assets/hgss-johto-trainer.mp3',
      letter: 'assets/mew-theme.mp3',
    };
    const BGM_VOL = 0.30;
    const SFX_VOL = 0.70;
    const BLEEP_INTERVAL = 80; // ms minimum gap between typing bleeps

    let _ctx = null;
    let _bgm = null;
    let _bgmUrl = null;
    let _unlocked = false;
    let _pendingScene = null;
    let _snoreTimer = null;
    let _snoreAudio = null;
    let _lastBleep = 0;

    const getCtx = () => {
      if (!_ctx) {
        try { _ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
      }
      return _ctx;
    };

    const unlock = () => {
      if (_unlocked) return;
      _unlocked = true;
      const c = getCtx();
      if (c && c.state === 'suspended') c.resume().catch(() => {});
      if (_pendingScene) { _switchBGM(_pendingScene); _pendingScene = null; }
    };

    // Classic Game Boy square-wave bleep — throttled so fast typewriters don't screech
    const playTypingBleep = () => {
      if (prefersReducedMotion) return;
      const now = performance.now();
      if (now - _lastBleep < BLEEP_INTERVAL) return;
      _lastBleep = now;
      try {
        const c = getCtx();
        if (!c) return;
        const osc  = c.createOscillator();
        const gain = c.createGain();
        osc.connect(gain);
        gain.connect(c.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, c.currentTime);
        gain.gain.setValueAtTime(0.055, c.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.03);
        osc.start(c.currentTime);
        osc.stop(c.currentTime + 0.032);
      } catch (e) {}
    };

    // Gengar voice clips played at random
    const GENGAR_VOICES = [
      'assets/gengar-voice-1.mp3',
      'assets/gengar-voice-2.mp3',
      'assets/gengar-voice-3.mp3',
      'assets/gengar-voice-6.mp3',
    ];

    const playGengarVoice = () => {
      if (prefersReducedMotion) return;
      try {
        const url = GENGAR_VOICES[Math.floor(Math.random() * GENGAR_VOICES.length)];
        const a = new Audio(url);
        a.volume = SFX_VOL;
        a.play().catch(() => {});
      } catch (e) {}
    };

    // Mew voice clips played in sequence
    const MEW_VOICES = [
      'assets/mew-voice-1.mp3',
      'assets/mew-voice-2.mp3',
      'assets/mew-voice-3.mp3',
      'assets/mew-voice-4.mp3',
    ];
    let _mewVoiceIndex = 0;

    const playMewVoice = () => {
      if (prefersReducedMotion) return;
      try {
        const a = new Audio(MEW_VOICES[_mewVoiceIndex]);
        a.volume = SFX_VOL;
        a.play().catch(() => {});
        _mewVoiceIndex = (_mewVoiceIndex + 1) % MEW_VOICES.length;
      } catch (e) {}
    };

    // Synthesised Love Ball activation — ascending sweep + sparkle ding
    const playPokeballSound = () => {
      if (prefersReducedMotion) return;
      try {
        const c = getCtx();
        if (!c) return;
        const t = c.currentTime;
        // Ascending tone
        const o1 = c.createOscillator(), g1 = c.createGain();
        o1.connect(g1); g1.connect(c.destination);
        o1.type = 'sine';
        o1.frequency.setValueAtTime(220, t);
        o1.frequency.exponentialRampToValueAtTime(880, t + 0.38);
        g1.gain.setValueAtTime(0.28, t);
        g1.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
        o1.start(t); o1.stop(t + 0.43);
        // Sparkle ding
        const o2 = c.createOscillator(), g2 = c.createGain();
        o2.connect(g2); g2.connect(c.destination);
        o2.type = 'sine';
        o2.frequency.setValueAtTime(2400, t + 0.28);
        o2.frequency.exponentialRampToValueAtTime(1760, t + 0.55);
        g2.gain.setValueAtTime(0.0001, t + 0.28);
        g2.gain.linearRampToValueAtTime(0.22, t + 0.33);
        g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.58);
        o2.start(t + 0.28); o2.stop(t + 0.6);
      } catch (e) {}
    };

    const _stopBGM = (fadeMs = 0) => {
      if (!_bgm) return;
      const bgm = _bgm;
      _bgm = null; _bgmUrl = null;
      if (fadeMs > 0) {
        const step = bgm.volume / (fadeMs / 40);
        const id = setInterval(() => {
          if (bgm.volume > step) { bgm.volume -= step; }
          else { bgm.pause(); clearInterval(id); }
        }, 40);
      } else {
        bgm.pause();
      }
    };

    const _playBGM = (key) => {
      const url = BGM_URLS[key];
      if (!url) return;
      if (_bgmUrl === url && _bgm && !_bgm.paused) return;
      _stopBGM();
      _bgmUrl = url;
      try {
        _bgm = new Audio(url);
        _bgm.loop = true;
        _bgm.volume = BGM_VOL;
        _bgm.play().catch(() => {
          // Autoplay blocked — retry on first user gesture
          const bgmRef = _bgm;
          const onGesture = () => { if (_bgm === bgmRef) _bgm.play().catch(() => {}); };
          document.addEventListener('click',      onGesture, { once: true });
          document.addEventListener('touchstart', onGesture, { once: true, passive: true });
          document.addEventListener('keydown',    onGesture, { once: true });
        });
      } catch (e) {}
    };

    const _stopSnore = () => {
      if (_snoreTimer) { clearTimeout(_snoreTimer); _snoreTimer = null; }
      if (_snoreAudio) { _snoreAudio.pause(); _snoreAudio = null; }
    };

    const _startSnore = () => {
      _stopSnore();
      try {
        _snoreAudio = new Audio('assets/snorlaxSleeping.mp3');
        _snoreAudio.loop = true;
        _snoreAudio.volume = 0.18;
        const snoreRef = _snoreAudio;
        _snoreAudio.play().catch(() => {
          const onGesture = () => { if (_snoreAudio === snoreRef) snoreRef.play().catch(() => {}); };
          document.addEventListener('click',      onGesture, { once: true });
          document.addEventListener('touchstart', onGesture, { once: true, passive: true });
        });
      } catch (e) {}
    };

    const playSnorlaxReveal = () => {
      _stopSnore();
      try {
        const a = new Audio('assets/SnorlaxReveal.mp3');
        a.volume = SFX_VOL;
        a.play().catch(() => {});
      } catch (e) {}
    };

    const playSnorlaxReturn = () => {
      _stopSnore();
      try {
        const a = new Audio('assets/SnorlaxReturn.mp3');
        a.volume = SFX_VOL;
        a.play().catch(() => {});
      } catch (e) {}
    };

    const _switchBGM = (scene) => {
      _stopSnore();
      _stopBGM(350);
      if (!BGM_URLS[scene]) return;
      setTimeout(() => {
        _playBGM(scene);
        if (scene === 'reveal') _startSnore();
      }, 400);
    };

    // Called from updateScene whenever the active scene changes
    const onSceneChange = (sceneName) => {
      if (!_unlocked) { _pendingScene = sceneName; return; }
      _switchBGM(sceneName);
    };

    // Fade BGM to a target volume (default 0.06 = soft duck; pass 0 to fully mute)
    const duckBGM = (targetVol = 0.06, fadeMs = 250) => {
      if (!_bgm) return;
      const bgm = _bgm, target = targetVol;
      const start = bgm.volume, diff = target - start;
      const steps = Math.round(fadeMs / 20); let i = 0;
      const id = setInterval(() => {
        i++;
        if (!_bgm || _bgm !== bgm) { clearInterval(id); return; }
        bgm.volume = Math.max(0, Math.min(1, start + diff * (i / steps)));
        if (i >= steps) clearInterval(id);
      }, 20);
    };

    // Restore BGM to its normal level
    const unduckBGM = (fadeMs = 400) => {
      if (!_bgm) return;
      const bgm = _bgm, target = BGM_VOL;
      const start = bgm.volume, diff = target - start;
      const steps = Math.round(fadeMs / 20); let i = 0;
      const id = setInterval(() => {
        i++;
        if (!_bgm || _bgm !== bgm) { clearInterval(id); return; }
        bgm.volume = Math.max(0, Math.min(1, start + diff * (i / steps)));
        if (i >= steps) clearInterval(id);
      }, 20);
    };

    // Pause / resume the snore loop (called when BL overlay covers everything)
    const pauseSnore = () => { try { if (_snoreAudio) _snoreAudio.pause(); } catch (_) {} };
    const resumeSnore = () => { try { if (_snoreAudio) _snoreAudio.play().catch(() => {}); } catch (_) {} };

    return { unlock, getCtx, playTypingBleep, playMewVoice, playGengarVoice, playSnorlaxReveal, playSnorlaxReturn, playPokeballSound, onSceneChange, duckBGM, unduckBGM, pauseSnore, resumeSnore };
  })();
  // ──────────────────────────────────────────────────────────────────────────

  const updateScene = (sceneName) => {
    const prevScene = document.querySelector('.scene.is-active');
    const nextScene = document.querySelector(`.scene[data-scene="${sceneName}"]`);

    if (!nextScene || prevScene === nextScene) {
      document.body.dataset.scene = sceneName;
      document.body.classList.toggle("reduced-motion", prefersReducedMotion);
      return;
    }

    if (prevScene) {
      prevScene.classList.remove('is-active');
      prevScene.setAttribute('aria-hidden', 'true');
    }

    nextScene.classList.add('is-active');
    nextScene.setAttribute('aria-hidden', 'false');
    document.body.dataset.scene = sceneName;
    document.body.classList.toggle("reduced-motion", prefersReducedMotion);
    SoundManager.onSceneChange(sceneName);
  };

  const updateButtons = (sceneName) => {
    const labels = {
      intro: "TAP? ;)",
      reveal: "Read the letter",
      letter: "Back to the front page",
    };

    document.querySelectorAll("[data-action='advance-scene']").forEach((button) => {
      button.textContent = labels[sceneName] ?? "Continue";
      button.disabled = false;
      button.setAttribute("aria-label", labels[sceneName] ?? "Continue");
      button.setAttribute("aria-busy", "false");
    });
  };

  const announceScene = (sceneName) => {
    if (sceneStatus) {
      sceneStatus.textContent = `Now showing the ${sceneLabels[sceneName] ?? sceneName}.`;
    }
  };

  const focusSceneControl = (sceneName, delay = prefersReducedMotion ? 0 : 300) => {
    const activeScene = document.querySelector(`.scene[data-scene="${sceneName}"]`);
    if (!activeScene) {
      return;
    }

    const focusTarget = activeScene.querySelector("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
    if (focusTarget instanceof HTMLElement) {
      setTimeout(() => {
        focusTarget.focus({ preventScroll: true });
      }, delay);
    }
  };

  const advanceScene = () => {
    if (isTransitioning) {
      return;
    }

    isTransitioning = true;

    if (currentSceneIndex >= sceneNames.length - 1) {
      currentSceneIndex = 0;
    } else {
      currentSceneIndex += 1;
    }

    const nextScene = sceneNames[currentSceneIndex];

    document.querySelectorAll("[data-action='advance-scene']").forEach((button) => {
      button.setAttribute("aria-busy", "true");
      // provide a short tactile feedback for touch devices
      button.classList.add('pressed');
      setTimeout(() => button.classList.remove('pressed'), 180);
    });

    const animationDuration = prefersReducedMotion ? 0 : 560;

    // For the reveal scene, defer the scene swap until the wipe fully covers the screen
    if (nextScene === "reveal") {
      const snorlaxFigureReset2 = document.querySelector(".snorlax-figure");
      if (snorlaxFigureReset2) snorlaxFigureReset2.classList.remove("cork-popped");
      resetRevealScene();

      const revealAtMidpoint = () => {
        // Screen is fully covered — snap textbox to hidden before scene swap
        const _tb = document.querySelector('.intro-textbox');
        const _te = document.querySelector('.intro-typewriter');
        if (_tb) _tb.style.animation = 'none';
        if (_te) _te.textContent = '';
        updateScene(nextScene, animationDuration);
        updateButtons(nextScene);
        announceScene(nextScene);
        focusSceneControl(nextScene, animationDuration + 20);
        const sf = document.querySelector(".snorlax-figure");
        if (sf) setTimeout(() => sf.classList.add("cork-popped"), prefersReducedMotion ? 0 : 1600);
      };

      if (prefersReducedMotion) {
        revealAtMidpoint();
        startRevealTypewriter();
        isTransitioning = false;
        document.querySelectorAll("[data-action='advance-scene']").forEach(b => b.setAttribute("aria-busy", "false"));
      } else {
        playGengarWipe(revealAtMidpoint);
        document.addEventListener('scene-transition-done', startRevealTypewriter, { once: true });
        document.addEventListener('scene-transition-done', () => {
          isTransitioning = false;
          document.querySelectorAll("[data-action='advance-scene']").forEach(b => b.setAttribute("aria-busy", "false"));
        }, { once: true });
      }

      return nextScene;
    }

    // All other scene transitions — swap immediately
    updateScene(nextScene, animationDuration);

    // T011: cork pop sequence
    const snorlaxFigureReset = document.querySelector(".snorlax-figure");
    if (snorlaxFigureReset) snorlaxFigureReset.classList.remove("cork-popped");

    updateButtons(nextScene);
    announceScene(nextScene);
    focusSceneControl(nextScene, animationDuration + 20);

    // Typewriter for the letter scene
    if (nextScene === "intro") SoundManager.playSnorlaxReturn();
    if (nextScene === "letter") {
      SoundManager.playSnorlaxReveal();
      // Capture texts before clearing (data-text attr or current textContent)
      window.__letterTexts = Array.from(document.querySelectorAll('.letter-content p'))
        .map(p => p.dataset.text || p.textContent.trim());
      document.querySelectorAll('.letter-content p').forEach(p => { p.innerHTML = ''; });
      const lc = document.querySelector('.letter-cursor');
      if (lc) lc.classList.remove('visible');
      if (prefersReducedMotion) { startLetterTypewriter(); }
      else { document.addEventListener('scene-transition-done', startLetterTypewriter, { once: true }); }
    }

    setTimeout(() => {
      isTransitioning = false;
      document.querySelectorAll("[data-action='advance-scene']").forEach((button) => {
        button.setAttribute("aria-busy", "false");
      });
    }, animationDuration);

    return nextScene;
  };

  const handleButtonClick = (button) => {
    if (button.disabled || isTransitioning) {
      return;
    }
    advanceScene();
  };

  const goToScene = (targetName) => {
    const targetIndex = sceneNames.indexOf(targetName);
    if (targetIndex === -1 || isTransitioning) return;

    isTransitioning = true;
    currentSceneIndex = targetIndex;
    const nextScene = sceneNames[currentSceneIndex];

    const animationDuration = prefersReducedMotion ? 0 : 560;

    const snorlaxFigureReset = document.querySelector(".snorlax-figure");
    if (snorlaxFigureReset) snorlaxFigureReset.classList.remove("cork-popped");

    updateScene(nextScene);
    updateButtons(nextScene);
    announceScene(nextScene);
    focusSceneControl(nextScene, animationDuration + 20);

    if (nextScene === "reveal") {
      resetRevealScene();
      const revealAtMidpoint = () => {
        // Screen is fully covered — snap textbox to hidden before scene swap
        const _tb = document.querySelector('.intro-textbox');
        const _te = document.querySelector('.intro-typewriter');
        if (_tb) _tb.style.animation = 'none';
        if (_te) _te.textContent = '';
        updateScene(nextScene, animationDuration);
        updateButtons(nextScene);
        announceScene(nextScene);
        const sf = document.querySelector(".snorlax-figure");
        if (sf) setTimeout(() => sf.classList.add("cork-popped"), prefersReducedMotion ? 0 : 1600);
      };
      if (prefersReducedMotion) {
        revealAtMidpoint();
        startRevealTypewriter();
      } else {
        playGengarWipe(revealAtMidpoint);
        document.addEventListener('scene-transition-done', startRevealTypewriter, { once: true });
      }
    }

    if (nextScene === "letter") {
      window.__letterTexts = Array.from(document.querySelectorAll('.letter-content p'))
        .map(p => p.dataset.text || p.textContent.trim());
      document.querySelectorAll('.letter-content p').forEach(p => { p.innerHTML = ''; });
      const lc = document.querySelector('.letter-cursor');
      if (lc) lc.classList.remove('visible');
      if (prefersReducedMotion) { startLetterTypewriter(); }
      else { document.addEventListener('scene-transition-done', startLetterTypewriter, { once: true }); }
    }

    setTimeout(() => { isTransitioning = false; }, animationDuration);
  };

  // Pokémon typewriter for the letter scene — types each paragraph sequentially
  const startLetterTypewriter = () => {
    const gen = ++letterTypewriterGen;
    const paragraphs = Array.from(document.querySelectorAll('.letter-page.is-active p'));
    const cursorEl = document.querySelector('.letter-cursor');
    if (!paragraphs.length) return;

    const texts = paragraphs.map((p, i) => {
      const t = (window.__letterTexts && window.__letterTexts[i]) || p.dataset.text || p.textContent.trim();
      p.innerHTML = '';
      return t;
    });
    if (cursorEl) cursorEl.classList.remove('visible');

    const esc = ch => ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch;

    let paraIdx = 0;
    let charIdx = 0;
    let displayed = '';
    let timerId = null;
    let done = false;

    const showAll = () => {
      if (done) return;
      done = true;
      if (timerId) clearTimeout(timerId);
      paragraphs.forEach((p, i) => {
        p.innerHTML = texts[i].split('\n').map(line => line.split('').map(esc).join('')).join('<br>');
      });
      if (cursorEl) cursorEl.classList.add('visible');
      if (gen === letterTypewriterGen) document.dispatchEvent(new CustomEvent('mewReady'));
    };

    const tick = () => {
      if (done) return;
      if (paraIdx >= paragraphs.length) {
        done = true;
        if (cursorEl) cursorEl.classList.add('visible');
        if (gen === letterTypewriterGen) document.dispatchEvent(new CustomEvent('mewReady'));
        return;
      }
      const p = paragraphs[paraIdx];
      const text = texts[paraIdx];
      if (charIdx < text.length) {
        const ch = text[charIdx];
        displayed += ch === '\n' ? '<br>' : esc(ch);
        p.innerHTML = displayed;
        charIdx++;
        if (ch !== ' ' && ch !== '\n') SoundManager.playTypingBleep();
        timerId = setTimeout(tick, 12);
      } else {
        paraIdx++;
        charIdx = 0;
        displayed = '';
        timerId = setTimeout(tick, 250);
      }
    };

    tick();
  };

  // Pokémon encounter textbox — slides up, types, pauses, slides down, loops
  const introMessages = [
    "A wild girlfriend has appeared! O_O",
    "HIII, PRINCESS!!!",
    "MY BABY!",
    "CUTIEEEE",
    "I MISS YOU!!!!",
    "ALWAYS DRINK WATERRR!!!",
    "MWAAAAHHHH <3",
    "LUV YAAA!!!!! <3"
  ];
  let introMsgIndex    = 0;
  let introLoopTimerId = null;
  let introLoopActive  = false;
  let introLoopGen     = 0;  // incremented each start; stale callbacks self-invalidate
  let letterTypewriterGen = 0;

  const stopIntroLoop = () => {
    introLoopActive = false;
    introLoopGen++;
    if (introLoopTimerId) { clearTimeout(introLoopTimerId); introLoopTimerId = null; }
  };

  const startIntroLoop = () => {
    stopIntroLoop();
    introLoopActive = true;
    introMsgIndex   = 0;
    const myGen = introLoopGen;  // capture generation for this run

    const textbox = document.querySelector('.intro-textbox');
    const typeEl  = document.querySelector('.intro-typewriter');
    const cursor  = document.querySelector('#intro .pokemon-cursor');
    if (!textbox || !typeEl) return;

    // Immediately snap textbox to hidden so old content isn't visible during the delay
    textbox.style.animation = 'none';
    void textbox.offsetWidth; // flush so CSS default (translateY(110%) / opacity 0) takes hold
    typeEl.textContent = '';
    if (cursor) cursor.classList.remove('visible');

    const alive = () => introLoopActive && introLoopGen === myGen;

    const schedule = (fn, ms) => {
      if (!alive()) return;
      introLoopTimerId = setTimeout(() => { if (alive()) fn(); }, ms);
    };

    const slideDown = () => {
      if (!alive()) return;
      if (cursor) cursor.classList.remove('visible');
      if (prefersReducedMotion) { schedule(slideUp, 600); return; }
      textbox.style.animation = 'introTextboxSlideDown 0.5s cubic-bezier(0.55, 0, 1, 0.45) both';
      textbox.addEventListener('animationend', () => { if (alive()) schedule(slideUp, 500); }, { once: true });
    };

    const typeText = (fullText) => {
      let i = 0;
      const tick = () => {
        if (!alive()) return;
        if (i < fullText.length) {
          const ch = fullText[i++];
          typeEl.textContent += ch;
          if (ch !== ' ') SoundManager.playTypingBleep();
          introLoopTimerId = setTimeout(tick, 120);
        } else {
          if (cursor) cursor.classList.add('visible');
          if (introMsgIndex === 1) document.dispatchEvent(new CustomEvent('introFirstMessageReady'));
          schedule(slideDown, 2500);
        }
      };
      tick();
    };

    const slideUp = () => {
      if (!alive()) return;
      const msg = introMessages[introMsgIndex % introMessages.length];
      introMsgIndex++;
      typeEl.textContent = '';
      if (cursor) cursor.classList.remove('visible');
      if (prefersReducedMotion) {
        typeEl.textContent = msg;
        if (cursor) cursor.classList.add('visible');
        if (introMsgIndex === 1) document.dispatchEvent(new CustomEvent('introFirstMessageReady'));
        schedule(slideDown, 3500);
        return;
      }
      textbox.style.animation = 'none';
      void textbox.offsetWidth;
      textbox.style.animation = 'introTextboxSlideUp 0.6s cubic-bezier(0.22, 1, 0.36, 1) both';
      textbox.addEventListener('animationend', () => {
        if (!alive()) return;
        typeText(msg);
      }, { once: true });
    };

    schedule(slideUp, prefersReducedMotion ? 0 : 800);
  };

  // Vertical Reflected Wipe: two black bars close from top+bottom, scene swap, bars open
  const playVerticalWipe = (onMidpoint) => {
    if (prefersReducedMotion) { onMidpoint(); return; }
    document.body.classList.add('is-transitioning');
    const top = document.createElement('div');
    top.className = 'vwipe-top';
    const bot = document.createElement('div');
    bot.className = 'vwipe-bottom';
    document.body.append(top, bot);
    const ease = 'cubic-bezier(0.6, 0, 1, 0.4)';
    const easeOut = 'cubic-bezier(0, 0.6, 0.4, 1)';
    top.style.animation = `vwipe-top-in 1.9s ${ease} forwards`;
    bot.style.animation = `vwipe-bottom-in 1.9s ${ease} forwards`;
    top.addEventListener('animationend', () => {
      // Lock closed position inline so the CSS default doesn't snap back
      top.style.transform = 'translateY(0)';
      bot.style.transform = 'translateY(0)';
      // Span: each bar sweeps to fill the full screen height
      top.style.animation = `vwipe-top-span 0.35s ease-in forwards`;
      bot.style.animation = `vwipe-bottom-span 0.35s ease-in forwards`;
      // Scene swap at 1s into the hold
      setTimeout(() => onMidpoint(), 1000);
      // Open after 2s hold — lock height inline so bars slide off at full height
      setTimeout(() => {
        top.style.height = '100%';
        bot.style.height = '100%';
        top.style.animation = `vwipe-top-out 2.0s ${easeOut} forwards`;
        bot.style.animation = `vwipe-bottom-out 2.0s ${easeOut} forwards`;
        top.addEventListener('animationend', () => {
          top.remove(); bot.remove();
          document.body.classList.remove('is-transitioning');
          document.dispatchEvent(new CustomEvent('scene-transition-done'));
        }, { once: true });
      }, 2000);
    }, { once: true });
  };

  // Fade to White: screen fades to white, scene swap, fades back
  const playFadeToWhite = (onMidpoint) => {
    if (prefersReducedMotion) { onMidpoint(); return; }
    document.body.classList.add('is-transitioning');
    const el = document.createElement('div');
    el.className = 'fade-to-white';
    document.body.appendChild(el);
    requestAnimationFrame(() => {
      el.style.animation = 'fade-white-in 1.4s ease-in forwards';
      el.addEventListener('animationend', () => {
        onMidpoint();
        el.style.animation = 'fade-white-out 1.7s ease-out 0.12s forwards';
        el.addEventListener('animationend', () => {
          el.remove();
          document.body.classList.remove('is-transitioning');
          document.dispatchEvent(new CustomEvent('scene-transition-done'));
        }, { once: true });
      }, { once: true });
    });
  };

  // Gengar wipe — radial dark-purple overlay that covers then uncovers the screen
  const playGengarWipe = (onMidpoint) => {
    if (prefersReducedMotion) { if (onMidpoint) onMidpoint(); return; }
    document.body.classList.add('is-transitioning');
    const el = document.createElement('div');
    el.className = 'gengar-wipe';
    document.body.appendChild(el);
    requestAnimationFrame(() => {
      el.style.animation = 'gengar-wipe-expand 1.2s cubic-bezier(0.6, 0, 1, 0.4) forwards';
      el.addEventListener('animationend', () => {
        if (onMidpoint) onMidpoint();
        el.style.clipPath = 'circle(150% at 50% 52%)';
        el.style.animation = 'gengar-wipe-contract 1.4s cubic-bezier(0, 0.6, 0.4, 1) 0.15s forwards';
        el.addEventListener('animationend', () => {
          el.remove();
          document.body.classList.remove('is-transitioning');
          document.dispatchEvent(new CustomEvent('scene-transition-done'));
        }, { once: true });
      }, { once: true });
    });
  };

  // ── Snorlax floating effect helpers ─────────────────────────────────────────
  let _snorlaxEffectTimer = null;

  const stopSnorlaxEffect = () => {
    if (_snorlaxEffectTimer) { clearInterval(_snorlaxEffectTimer); _snorlaxEffectTimer = null; }
  };

  const startZzzEffect = () => {
    stopSnorlaxEffect();
    const spawnZzz = () => {
      const fig = document.querySelector('.snorlax-figure');
      if (!fig) return;
      const rect = fig.getBoundingClientRect();
      if (!rect.width) return;
      [['z', '0.5rem', 0], ['z', '0.75rem', 1], ['Z', '1rem', 2]].forEach(([ch, sz, i]) => {
        setTimeout(() => {
          const el = document.createElement('span');
          el.className = 'snorlax-zzz';
          el.textContent = ch;
          el.style.fontSize = sz;
          el.style.left = (rect.left + rect.width * 0.28 + i * 5) + 'px';
          el.style.top  = (rect.top  + rect.height * 0.14 - i * 5) + 'px';
          el.style.setProperty('--zdx', (-8 + i * 4) + 'px');
          document.body.appendChild(el);
          setTimeout(() => el.remove(), 1600);
        }, i * 220);
      });
    };
    spawnZzz();
    _snorlaxEffectTimer = setInterval(spawnZzz, 1300);
  };

  const spawnMoyaMoya = () => {
    const fig = document.querySelector('.snorlax-figure');
    if (!fig) return;
    const rect = fig.getBoundingClientRect();
    ['〜〜', '〜〜', '∿∿', '〜〜', '∿∿'].forEach((ch, i) => {
      const dxs = [-28, 16, -6, 26, -16];
      setTimeout(() => {
        const el = document.createElement('span');
        el.className = 'snorlax-moya';
        el.textContent = ch;
        el.style.left = (rect.left + rect.width / 2 + dxs[i] - 14) + 'px';
        el.style.top  = (rect.top  + rect.height * 0.12) + 'px';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1200);
      }, i * 85);
    });
  };

  const startHeartEffect = () => {
    stopSnorlaxEffect();
    const spawnHearts = () => {
      const fig = document.querySelector('.snorlax-figure');
      if (!fig) return;
      const rect = fig.getBoundingClientRect();
      [0, -24, 24, -12, 12].forEach((dx, i) => {
        setTimeout(() => {
          const h = document.createElement('span');
          h.className = 'snorlax-heart';
          h.textContent = i % 2 === 0 ? '♡' : '♥';
          h.style.left = (rect.left + rect.width / 2 + dx - 12) + 'px';
          h.style.top  = (rect.top  + rect.height * 0.2) + 'px';
          document.body.appendChild(h);
          setTimeout(() => h.remove(), 1100);
        }, i * 90);
      });
    };
    spawnHearts();
    _snorlaxEffectTimer = setInterval(spawnHearts, 1400);
  };

  const startMoyaEffect = () => {
    stopSnorlaxEffect();
    spawnMoyaMoya();
    _snorlaxEffectTimer = setInterval(spawnMoyaMoya, 1400);
  };
  // ─────────────────────────────────────────────────────────────────────────────

  // Reset reveal scene to blank state (called immediately on transition, before typewriter delay)
  const resetRevealScene = () => {
    const textEl   = document.querySelector('.typewriter-text');
    const cursorEl = document.querySelector('[data-scene="reveal"] .pokemon-cursor');
    const promptEl = document.querySelector('.prompt-typewriter');
    const actions  = document.querySelector('[data-scene="reveal"] .battle-menu-box');
    if (actions)  actions.classList.remove('is-ready');
    if (promptEl) promptEl.textContent = '';
    if (textEl)   textEl.textContent = '';
    if (cursorEl) cursorEl.classList.remove('visible');
    stopSnorlaxEffect(); // clear any running floating-effect loop
  };

  // Pokémon typewriter for the reveal scene battle message
  const startRevealTypewriter = () => {
    const textEl   = document.querySelector('.typewriter-text');
    const cursorEl = document.querySelector('[data-scene="reveal"] .pokemon-cursor');
    const promptEl = document.querySelector('.prompt-typewriter');
    const actions  = document.querySelector('[data-scene="reveal"] .battle-menu-box');
    if (!textEl) return;
    startZzzEffect(); // begin default sleeping ZZZ loop
    if (actions)  actions.classList.remove('is-ready');
    if (promptEl) promptEl.textContent = '';
    textEl.textContent = '';
    if (cursorEl) cursorEl.classList.remove('visible');

    if (prefersReducedMotion) {
      textEl.textContent  = textEl.dataset.text || '';
      if (promptEl) promptEl.textContent = promptEl.dataset.text || '';
      if (cursorEl) cursorEl.classList.add('visible');
      if (actions)  actions.classList.add('is-ready');
      return;
    }

    // Step 1 — type main message
    const fullText = textEl.dataset.text || '';
    let i = 0;
    const mainTick = setInterval(() => {
      if (i < fullText.length) {
        const ch = fullText[i++];
        textEl.textContent += ch;
        if (ch !== ' ') SoundManager.playTypingBleep();
      } else {
        clearInterval(mainTick);
        if (cursorEl) cursorEl.classList.add('visible');

        // Step 2 — pause, then type prompt
        setTimeout(() => {
          if (!promptEl) { if (actions) actions.classList.add('is-ready'); return; }
          const promptText = promptEl.dataset.text || '';
          let j = 0;
          const promptTick = setInterval(() => {
            if (j < promptText.length) {
              const ch = promptText[j++];
              promptEl.textContent += ch;
              if (ch !== ' ') SoundManager.playTypingBleep();
            } else {
              clearInterval(promptTick);
              // Step 3 — reveal buttons
              setTimeout(() => { if (actions) actions.classList.add('is-ready'); }, 250);
            }
          }, 65);
        }, 700);
      }
    }, 52);
  };

  const handleKeydown = (event) => {
    if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-action='advance-scene']")) {
      event.preventDefault();
      handleButtonClick(event.target);
    }
  };

  // ── Mew autonomous flier (letter scene) ─────────────────────────────────────
  const initMewFollower = () => {
    const figure = document.getElementById('mew-follower');
    if (!figure) return;

    const SPRITE = 130;
    const clamp  = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    let curX = 0, curY = 0;
    let tgtX = 0, tgtY = 0;
    let velX = 0, velY = 0;
    let rafId = null;
    let active = false;
    let lastFlyTime = null;

    const applyPos = () => {
      figure.style.transform = `translate(${curX}px, ${curY}px)`;
    };

    // Pick a new random waypoint within the viewport
    const pickTarget = () => {
      const M = 80;
      tgtX = M + Math.random() * (window.innerWidth  - SPRITE - M * 2);
      tgtY = M + Math.random() * (window.innerHeight - SPRITE - M * 2);
    };

    // Velocity-based autonomous flight loop — delta-time normalised to 60 fps
    const flyTick = (timestamp) => {
      if (!active) { rafId = null; return; }

      // Clamp delta to [0, 3] frames so a tab-wake-up doesn't launch Mew off-screen
      const delta = (lastFlyTime !== null) ? Math.min((timestamp - lastFlyTime) / 16.667, 3) : 1;
      lastFlyTime = timestamp;

      const MAX_SPEED = 2.5;
      const ACCEL     = 0.13;
      const FRICTION  = 0.93;

      const dx   = tgtX - curX;
      const dy   = tgtY - curY;
      const dist = Math.hypot(dx, dy);

      if (dist < 25) pickTarget();

      if (dist > 0) {
        velX += (dx / dist) * ACCEL * delta;
        velY += (dy / dist) * ACCEL * delta;
      }

      const speed = Math.hypot(velX, velY);
      if (speed > MAX_SPEED) {
        velX = (velX / speed) * MAX_SPEED;
        velY = (velY / speed) * MAX_SPEED;
      }

      velX *= Math.pow(FRICTION, delta);
      velY *= Math.pow(FRICTION, delta);

      curX = clamp(curX + velX * delta, 0, window.innerWidth  - SPRITE);
      curY = clamp(curY + velY * delta, 0, window.innerHeight - SPRITE);

      // Flip sprite to face direction of travel
      if (Math.abs(velX) > 0.25) {
        figure.classList.toggle('facing-left', velX < 0);
      }

      applyPos();
      rafId = requestAnimationFrame(flyTick);
    };

    // Position Mew on the right side of the letter card
    const setStartPosition = () => {
      const card = document.querySelector('.letter-card');
      if (card) {
        const r = card.getBoundingClientRect();
        curX = r.right - SPRITE * 0.6;
        curY = r.top + r.height * 0.18 - SPRITE / 2;
      } else {
        curX = window.innerWidth * 0.85 - SPRITE / 2;
        curY = window.innerHeight * 0.15;
      }
      tgtX = curX; tgtY = curY;
      applyPos();
    };

    // Click: spin animation + floating hearts
    figure.addEventListener('click', e => {
      if (!active) return;
      SoundManager.playMewVoice();
      e.stopPropagation();
      figure.classList.remove('is-spinning');
      void figure.offsetWidth;
      figure.classList.add('is-spinning');
      setTimeout(() => figure.classList.remove('is-spinning'), 560);

      [0, -18, 18].forEach((offset, i) => {
        setTimeout(() => {
          const h = document.createElement('span');
          h.className = 'mew-heart';
          h.textContent = '♡';
          h.style.left = (curX + SPRITE / 2 + offset - 10) + 'px';
          h.style.top  = (curY + offset) + 'px';
          document.body.appendChild(h);
          setTimeout(() => h.remove(), 900);
        }, i * 80);
      });
    });

    // ── Mew speech bubble ──────────────────────────────────────────────────
    const mewBubble = document.createElement('div');
    mewBubble.className = 'mew-speech';
    figure.appendChild(mewBubble);

    const MEW_MESSAGES = ['Iris \u2661', 'Xiao Ling \u2661'];
    let _mewMsgIndex = 0;
    let mewBubbleTimer = null;

    const showMewBubble = () => {
      mewBubble.textContent = MEW_MESSAGES[_mewMsgIndex];
      _mewMsgIndex = (_mewMsgIndex + 1) % MEW_MESSAGES.length;
      mewBubble.classList.add('is-visible');
      setTimeout(() => mewBubble.classList.remove('is-visible'), 2000);
    };

    const scheduleMewBubble = () => {
      const delay = 2000 + Math.random() * 5000; // 2–7 s
      mewBubbleTimer = setTimeout(() => {
        if (!active) return;
        showMewBubble();
        scheduleMewBubble();
      }, delay);
    };
    // ─────────────────────────────────────────────────────────────────────────

    // mewReady: typewriter finished → start flying
    document.addEventListener('mewReady', () => {
      if (active) return;
      active = true;
      lastFlyTime = null;
      pickTarget();
      figure.classList.add('is-ready');
      rafId = requestAnimationFrame(flyTick);
      scheduleMewBubble();
    });

    // Scene enters → place Mew at start position
    // Scene leaves → stop flight, reset
    const letterScene = document.querySelector('.scene[data-scene="letter"]');
    if (letterScene) {
      const obs = new MutationObserver(() => {
        if (letterScene.classList.contains('is-active')) {
          requestAnimationFrame(setStartPosition);
        } else if (active) {
          active = false;
          mewBubble.classList.remove('is-visible');
          if (mewBubbleTimer) { clearTimeout(mewBubbleTimer); mewBubbleTimer = null; }
          figure.classList.remove('is-ready', 'facing-left');
          if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
          velX = 0; velY = 0;
          lastFlyTime = null;
        }
      });
      obs.observe(letterScene, { attributes: true, attributeFilter: ['class'] });
    }

    applyPos();
  };
  // ────────────────────────────────────────────────────────────────────────────

  // ── Letter book pagination ────────────────────────────────────────────────────
  const initLetterPagination = () => {
    const pages   = Array.from(document.querySelectorAll('.letter-page'));
    const nav     = document.querySelector('.letter-page-nav');
    const dots    = Array.from(document.querySelectorAll('.letter-page-dot'));
    const prevBtn = document.querySelector('.letter-nav-prev');
    const nextBtn = document.querySelector('.letter-nav-next');
    if (!pages.length || !nav) return;

    const esc = ch => ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch;
    const pageTexts = pages.map(page =>
      Array.from(page.querySelectorAll('p')).map(p => p.dataset.text || p.textContent.trim())
    );

    let currentPage = 0;
    const renderedPages = new Set(); // pages whose typing has fully completed this visit

    const restorePage = (n) => {
      pages[n].querySelectorAll('p').forEach((p, i) => {
        const raw = pageTexts[n][i] || '';
        p.innerHTML = raw.split('\n').map(line => line.split('').map(esc).join('')).join('<br>');
      });
    };

    // Type paragraphs on a page char-by-char; gen ties into letterTypewriterGen
    // so navigating away mid-type cancels cleanly.
    const typewritePage = (n, gen) => {
      const ps = Array.from(pages[n].querySelectorAll('p'));
      if (!ps.length) return;
      ps.forEach(p => { p.innerHTML = ''; });
      let paraIdx = 0, charIdx = 0, displayed = '', timerId = null, done = false;
      const isLast = n === pages.length - 1;

      const dispatchComplete = () => {
        renderedPages.add(n);
        if (isLast && gen === letterTypewriterGen)
          document.dispatchEvent(new CustomEvent('letterComplete'));
        // Unlock next button now this page is done (unless it's the last)
        if (nextBtn && !isLast) nextBtn.disabled = false;
      };

      const finish = (cancelled = false) => {
        if (done) return;
        done = true;
        clearTimeout(timerId);
        lc.removeEventListener('click', finish);
        ps.forEach((p, i) => {
          const raw = pageTexts[n][i] || '';
          p.innerHTML = raw.split('\n').map(line => line.split('').map(esc).join('')).join('<br>');
        });
        if (!cancelled) dispatchComplete();
      };

      const tick = () => {
        if (done) return;
        if (gen !== letterTypewriterGen) { finish(true); return; } // cancelled — no event
        if (paraIdx >= ps.length) { done = true; dispatchComplete(); return; }
        const text = pageTexts[n][paraIdx];
        if (charIdx < text.length) {
          const ch = text[charIdx];
          displayed += ch === '\n' ? '<br>' : esc(ch);
          ps[paraIdx].innerHTML = displayed;
          charIdx++;
          if (ch !== ' ' && ch !== '\n') SoundManager.playTypingBleep();
          timerId = setTimeout(tick, 12);
        } else {
          paraIdx++;
          charIdx = 0;
          displayed = '';
          timerId = setTimeout(tick, 250);
        }
      };
      timerId = setTimeout(tick, 500);
    };

    const goToPage = (n) => {
      if (n < 0 || n >= pages.length || n === currentPage) return;
      const pageGen = ++letterTypewriterGen; // cancel any in-progress typing
      _playSelectSFX();
      pages[currentPage].classList.remove('is-active');
      dots[currentPage]?.classList.remove('is-active');
      currentPage = n;
      pages[currentPage].classList.add('is-active');
      dots[currentPage]?.classList.add('is-active');
      if (prevBtn) prevBtn.disabled = n === 0;
      if (n === 0 || renderedPages.has(n)) {
        // Already rendered — restore instantly and unlock next
        if (n > 0) restorePage(n);
        if (nextBtn) nextBtn.disabled = n === pages.length - 1;
      } else {
        // Not yet rendered — lock next until typing completes
        if (nextBtn) nextBtn.disabled = true;
        typewritePage(n, pageGen);
      }
    };

    if (prevBtn) prevBtn.addEventListener('click', () => goToPage(currentPage - 1));
    if (nextBtn) nextBtn.addEventListener('click', () => goToPage(currentPage + 1));

    // Enable nav after initial page-0 typewriter finishes
    document.addEventListener('mewReady', () => {
      renderedPages.add(0);
      nav.style.opacity = '1';
      nav.style.pointerEvents = 'auto';
      if (prevBtn) prevBtn.disabled = currentPage === 0;
      if (nextBtn) nextBtn.disabled = currentPage === pages.length - 1;
    });

    // Reset fully on each fresh visit to the letter scene
    const letterScene = document.querySelector('.scene[data-scene="letter"]');
    if (letterScene) {
      new MutationObserver(() => {
        if (!letterScene.classList.contains('is-active')) return;
        pages[currentPage].classList.remove('is-active');
        dots[currentPage]?.classList.remove('is-active');
        currentPage = 0;
        renderedPages.clear();
        pages[0].classList.add('is-active');
        dots[0]?.classList.add('is-active');
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        nav.style.opacity = '0';
        nav.style.pointerEvents = 'none';
      }).observe(letterScene, { attributes: true, attributeFilter: ['class'] });
    }
  };
  // ────────────────────────────────────────────────────────────────────────────

  // ── Gengar cursor follower ───────────────────────────────────────────────────
  const initGengarFollower = () => {
    const card     = document.querySelector('.intro-card');
    const follower = document.getElementById('gengar-follower');
    if (!card || !follower) return;

    const inner       = follower.querySelector('.gengar-inner');
    const btn         = document.getElementById('entry-button');
    const SPRITE_SIZE = 80;
    const ARRIVE_PX   = 22;   // px from rush-target before firing tap

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    const computeFixedY = () => {
      if (!btn) return Math.max(0, card.offsetHeight - SPRITE_SIZE - 20);
      const cr = card.getBoundingClientRect();
      const br = btn.getBoundingClientRect();
      return clamp(br.bottom - cr.top + 8, 0, card.offsetHeight - SPRITE_SIZE);
    };

    let fixedY  = computeFixedY();
    let targetX = 0;
    let curX    = 0;
    let prevX   = 0;
    let facing  = -1;      // 1 = right, -1 = left
    let rafId   = null;
    let active  = false;
    let idleTimer = null;
    let lastTickTime = null;
    let lerpSpeed = 0.007; // trail lag — lower = more delay
    let prevCursorX = 0; // track cursor direction for facing
    let walkCallback = null; // set when Gengar should walk to a target and tap on arrival
    let buttonClicked = false; // true from click until scene transition

    let gengarLocked = true; // locked until first intro message finishes typing
    let gengarFirstBootDone = false; // flips to true once the first message ever finishes

    document.addEventListener('introFirstMessageReady', () => {
      gengarLocked = false;
      gengarFirstBootDone = true;
      if (btn) {
        btn.disabled = false;
        if (!prefersReducedMotion) btn.style.transition = 'opacity 0.45s ease, transform 180ms ease, box-shadow 180ms ease';
        btn.style.opacity = '1';
        btn.style.transform = '';
      }
    });

    // States: 'idle' | 'following' | 'tapping'
    let state = 'idle';

    // Switch between idle float, walking bob, or none (tapping)
    const setMotionClass = (cls) => {
      if (!inner) return;
      inner.classList.remove('gengar-idle', 'gengar-walking');
      if (cls) inner.classList.add(cls);
    };

    const applyTransform = () => {
      follower.style.transform = `translate(${curX}px, ${fixedY}px) scaleX(${facing})`;
      // Counter-flip the speech bubble so it always reads left-to-right
      speechBubble.style.transform = facing === -1 ? 'scaleX(-1)' : '';
    };

    const tick = (timestamp) => {
      rafId = null;
      if (!active || state === 'tapping') return;

      // Normalise to 60 fps so high-refresh-rate screens don't accelerate Gengar
      const delta = (lastTickTime !== null) ? Math.min((timestamp - lastTickTime) / 16.667, 3) : 1;
      lastTickTime = timestamp;

      curX += (targetX - curX) * lerpSpeed * delta;

      // Walk vs idle detection
      const spd = Math.abs(curX - prevX);
      if (spd > 0.4) {
        setMotionClass('gengar-walking');
        clearTimeout(idleTimer); idleTimer = null;
      } else if (!idleTimer) {
        idleTimer = setTimeout(() => { setMotionClass('gengar-idle'); idleTimer = null; }, 180);
      }

      // Arrival check — tap when Gengar reaches the walk target
      if (walkCallback && Math.abs(curX - targetX) < 20) {
        const cb = walkCallback;
        walkCallback = null;
        state = 'tapping';
        setMotionClass(null);
        clearTimeout(idleTimer); idleTimer = null;
        prevX = curX;
        applyTransform();
        cb();
        return;
      }

      prevX = curX;
      applyTransform();
      rafId = requestAnimationFrame(tick);
    };

    const startTick = () => {
      if (!rafId && active && state !== 'tapping') rafId = requestAnimationFrame(tick);
    };

    // Cursor/touch: only follow X, ignore Y
    const followCursorX = (clientX) => {
      if (gengarLocked || state === 'tapping' || walkCallback !== null || buttonClicked) return;
      const rect = card.getBoundingClientRect();
      const newTargetX = clamp(clientX - rect.left - SPRITE_SIZE / 2, 0, rect.width - SPRITE_SIZE);
      // Only flip direction when the cursor crosses Gengar's center
      const cursorCardX   = clientX - rect.left;
      const gengarCenterX = curX + SPRITE_SIZE / 2;
      if      (cursorCardX > gengarCenterX + 1) facing = -1; // cursor passed to Gengar's right
      else if (cursorCardX < gengarCenterX - 1) facing =  1; // cursor passed to Gengar's left
      targetX = newTargetX;
      state   = 'following';
      startTick();
    };

    card.addEventListener('mousemove', (e) => followCursorX(e.clientX));
    card.addEventListener('touchmove', (e) => followCursorX(e.touches[0].clientX),
      { passive: true });

    // ── Gengar speech bubble ───────────────────────────────────────────────
    const speechBubble = document.createElement('div');
    speechBubble.className = 'gengar-speech';
    speechBubble.setAttribute('aria-hidden', 'true');
    speechBubble.setAttribute('dir', 'ltr');
    follower.appendChild(speechBubble);

    const showGengarSpeech = (text, onDone) => {
      const LTR = '\u202D'; // LEFT-TO-RIGHT OVERRIDE — prevents bidi inversion
      speechBubble.textContent = LTR + text; // pre-size at full width
      speechBubble.style.minWidth = speechBubble.offsetWidth + 'px';
      speechBubble.textContent = LTR;
      speechBubble.classList.add('is-visible');
      SoundManager.playGengarVoice();
      let i = 0;
      const typeTick = () => {
        if (i < text.length) {
          const ch = text[i];
          speechBubble.textContent = LTR + text.slice(0, ++i);
          if (ch !== ' ') SoundManager.playTypingBleep();
          setTimeout(typeTick, 55);
        } else {
          onDone(); // bubble stays visible — hidden on arrival
        }
      };
      typeTick();
    };

    // ── Button click: intercept in capture phase so we control when scene advances ──
    if (btn) {
      btn.addEventListener('click', (e) => {
        // Skip animation for reduced-motion or if Gengar isn't active or is still locked
        if (!active || prefersReducedMotion || gengarLocked) return;

        _playSelectSFX();

        e.stopImmediatePropagation(); // prevent advanceScene firing now
        btn.disabled = true;
        buttonClicked = true;

        const doTapAndAdvance = () => {
          // Hide bubble now that Gengar has arrived
          speechBubble.classList.remove('is-visible');
          speechBubble.style.minWidth = '';
          // Play select SFX again exactly when Gengar taps the button (fresh clone avoids shared-element state issues)
          if (_selectSFX) { try { const tap = _selectSFX.cloneNode(); tap.volume = 1.0; tap.play().catch(() => {}); } catch(_) {} }
          // Play tap animation, THEN advance scene
          if (inner) {
            inner.classList.remove('gengar-tapping');
            void inner.offsetWidth;
            inner.classList.add('gengar-tapping');
          }
          const finish = () => {
            inner && inner.classList.remove('gengar-tapping');
            active = false;
            advanceScene();
          };
          if (inner) {
            const fallback = setTimeout(finish, 550);
            inner.addEventListener('animationend', () => {
              clearTimeout(fallback);
              finish();
            }, { once: true });
          } else {
            setTimeout(finish, 100);
          }
        };

        const gengarCry  = "GENGAAA";
        const gengarFace = "(\u25e3\ud83d\udc45\u25e2)";
        showGengarSpeech(gengarCry + gengarFace, () => {
          // Walk Gengar to the button, then tap on arrival
          const btnRect  = btn.getBoundingClientRect();
          const cardRect = card.getBoundingClientRect();
          targetX = clamp(
            btnRect.left + btnRect.width / 2 - cardRect.left - SPRITE_SIZE / 2,
            0, card.offsetWidth - SPRITE_SIZE
          );
          facing = targetX > curX ? -1 : 1; // face the button
          walkCallback = doTapAndAdvance;
          state = 'following';
          startTick();
        });
      }, { capture: true });
    }

    // Recompute Y on resize
    window.addEventListener('resize', () => {
      fixedY  = computeFixedY();
      targetX = clamp(targetX, 0, card.offsetWidth - SPRITE_SIZE);
      curX    = clamp(curX,    0, card.offsetWidth - SPRITE_SIZE);
      applyTransform();
    });

    // Start/stop with intro scene
    const introSection = document.getElementById('intro');
    if (introSection) {
      const obs = new MutationObserver(() => {
        const nowActive = introSection.classList.contains('is-active');
        if (nowActive && !active) {
          gengarLocked  = true; // re-lock until first message finishes (on every visit)
          active        = true;
          buttonClicked = false;
          walkCallback  = null;
          state         = 'idle';
          lerpSpeed     = 0.007;
          // Re-hide button until first message plays (same pattern as first boot)
          if (btn) {
            btn.disabled = true;
            btn.style.transition = 'none';
            btn.style.opacity    = '0';
            btn.style.transform  = 'translateY(10px)';
          }
          curX      = 0;
          targetX   = 0;
          prevX     = 0;
          prevCursorX = 0;
          facing    = -1;
          fixedY    = computeFixedY();
          lastTickTime = null;
          speechBubble.classList.remove('is-visible');
          setMotionClass('gengar-idle');
          startTick();
        } else if (!nowActive && active) {
          active = false;
          buttonClicked = false;
          walkCallback  = null;
          state         = 'idle';
          speechBubble.classList.remove('is-visible');
          lerpSpeed = 0.007;
          lastTickTime = null;
          if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        }
      });
      obs.observe(introSection, { attributes: true, attributeFilter: ['class'] });
      active = introSection.classList.contains('is-active');
    } else {
      active = true;
    }

    applyTransform();
    if (active) {
      setMotionClass('gengar-idle');
      startTick();
      if (btn) {
        btn.disabled = true;
        btn.style.opacity = '0';
        btn.style.transform = 'translateY(10px)';
        btn.style.transition = 'none';
      }
    }
  };
  // ────────────────────────────────────────────────────────────────────────────

  // ── Physical-PPI → CSS-px utility (shared by all ghost instances) ────────────
  // Derives true display PPI by matching hardware resolution (screen × DPR)
  // against a lookup table, then exposes accurate CM and IN → CSS-px ratios.
  const _physPX = (() => {
    const DPR  = window.devicePixelRatio || 1;
    const natW = Math.round(screen.width  * DPR);
    const natH = Math.round(screen.height * DPR);
    const MAP = {
      // Apple MacBook Pro
      '3456x2234': 254, '3024x1964': 254, '2880x1800': 220,
      // Apple MacBook Air
      '2880x1864': 224, '2560x1664': 224, '2560x1600': 227, '2304x1440': 226,
      // Apple external / iMac
      '6016x3384': 218, '5120x2880': 218, '4480x2520': 218,
      // Microsoft Surface
      '3200x2000': 235, '2736x1824': 267, '2256x1504': 201,
      // Common external monitors
      '5120x1440': 109, '3840x2160': 163, '3440x1440': 110,
      '2560x1440': 109, '2560x1080':  82,
      '1920x1200':  94, '1920x1080':  92, '1680x1050':  90,
      '1440x900':   96, '1366x768':   96,
    };
    let ppi = MAP[`${natW}x${natH}`];
    if (!ppi) {
      if      (natW >= 5120) ppi = 218;
      else if (natW >= 4480) ppi = 218;
      else if (natW >= 3840) ppi = DPR >= 2 ? 185 : 163;
      else if (natW >= 3456) ppi = 254;
      else if (natW >= 3024) ppi = 254;
      else if (natW >= 2880) ppi = DPR >= 2 ? 224 : 110;
      else if (natW >= 2560) ppi = DPR >= 2 ? 226 : 109;
      else if (natW >= 2304) ppi = 226;
      else if (natW >= 1920) ppi = DPR >= 2 ? 110 :  92;
      else                   ppi = DPR * 96;
    }
    return { CM: ppi / (DPR * 2.54), IN: ppi / DPR };
  })();
  // ────────────────────────────────────────────────────────────────────────────

  // ── Beat-sync throb driver ─────────────────────────────────────────────────────
  // Reads live bass energy via Web Audio AnalyserNode and drives the ghost
  // sticker's transform + filter so the pulse exactly follows the audio beat.
  const createThrobSync = () => {
    let _audio = null, _ctx = null, _source = null, _analyser = null, _rafId = null, _imgEl = null;

    const start = (imgEl) => {
      stop();
      _imgEl = imgEl;
      // Reuse SoundManager's already-unlocked AudioContext — creating a new one
      // from a mousemove chain will be suspended and unresumable in most browsers.
      _ctx = SoundManager.getCtx();
      _audio = new Audio('assets/throb.mp3');
      _audio.loop   = true;
      _audio.volume = 0.75;
      try {
        _source   = _ctx.createMediaElementSource(_audio);
        _analyser = _ctx.createAnalyser();
        _analyser.fftSize = 256;
        _analyser.smoothingTimeConstant = 0.55;
        _source.connect(_analyser);
        _analyser.connect(_ctx.destination);
        const freqData = new Uint8Array(_analyser.frequencyBinCount);

        const loop = () => {
          _analyser.getByteFrequencyData(freqData);
          let bass = 0;
          for (let i = 0; i < 4; i++) bass += freqData[i];
          bass /= 4;
          const norm = Math.min(1, bass / 190);
          const g1 = (16 + 14 * norm) | 0;
          const g2 = (28 + 14 * norm) | 0;
          const a2 = (0.60 + 0.20 * norm).toFixed(2);
          if (_imgEl) {
            _imgEl.style.filter = `drop-shadow(0 0 ${g1}px rgba(255,100,170,0.95)) drop-shadow(0 6px ${g2}px rgba(255,60,140,${a2}))`;
          }
          _rafId = requestAnimationFrame(loop);
        };

        _audio.play()
          .then(() => { _rafId = requestAnimationFrame(loop); })
          .catch(() => {
            // Beat-sync unavailable — plain audio still plays, CSS handles the pulse
          });
      } catch (e) {
        // createMediaElementSource failed (e.g. already captured) — play audio directly
        _audio.play().catch(() => {});
      }
    };

    const stop = () => {
      if (_rafId)   { cancelAnimationFrame(_rafId); _rafId = null; }
      if (_audio)   { _audio.pause(); _audio.currentTime = 0; _audio = null; }
      if (_source)  { try { _source.disconnect(); } catch (_) {} _source = null; }
      if (_analyser){ try { _analyser.disconnect(); } catch (_) {} _analyser = null; }
      // Do NOT close _ctx — it belongs to SoundManager
      _ctx = null;
      if (_imgEl)   { _imgEl.style.filter = ''; _imgEl.style.transform = ''; _imgEl = null; }
    };

    return { start, stop };
  };
  // ────────────────────────────────────────────────────────────────────────────

  // ── BL Secret Overlay ────────────────────────────────────────────────────────
  const initBLOverlay = () => {
    const overlay  = document.getElementById('bl-overlay');
    const closeBtn = document.getElementById('bl-close');
    if (!overlay) return () => {};

    const BL_COPY = {
      quote:        'My heart is not the only thing that throbs for you.',
      translations: [
        '为你悸动的，不只是我的心。♡',
        'あなたのために脈打つのは、心だけじゃない。♡',
        '당신을 위해 뛰는 건 마음만이 아니야。♡',
      ],
    };

    const quoteEl = overlay.querySelector('.bl-quote');
    const citeEl  = overlay.querySelector('.bl-cite');
    if (quoteEl && citeEl) {
      quoteEl.insertBefore(
        document.createTextNode('❝\u00A0' + BL_COPY.quote + '\u00A0❞'),
        citeEl
      );
      citeEl.innerHTML = BL_COPY.translations.map(t => `<span>${t}</span>`).join('');
    }

    const SHOWER = ['💗','💕','💖','💓','💝','💘','♡','❤','🌸','🌹','✦','✧','💫','✨','🌺','💞','🫧','🌷'];
    let showerInterval = null;

    const spawnBgParticle = () => {
      const char = SHOWER[Math.floor(Math.random() * SHOWER.length)];
      const size = 10 + Math.random() * 22;
      const dur  = 3.5 + Math.random() * 3;
      const rot  = (Math.random() - 0.5) * 65;
      const el   = document.createElement('span');
      el.className   = 'bl-bg-particle';
      el.textContent = char;
      el.style.cssText = `left:${Math.random() * 100}%;top:-24px;font-size:${size}px;--dur:${dur}s;--rot:${rot}deg;`;
      overlay.appendChild(el);
      el.addEventListener('animationend', () => el.remove(), { once: true });
    };

    // ── Ghost sticker rub interaction (mirrors letter-scene mechanic) ────────────
    const ghostImg  = overlay.querySelector('.bl-ghost-img');
    const ghostWrap = overlay.querySelector('.bl-ghost-center');
    const darkScrim  = overlay.querySelector('.bl-dark-scrim');
    const niPanelBg   = overlay.querySelector('.bl-ni-panel-bg');
    const blCard      = overlay.querySelector('.bl-card');

    const BL_CHARS  = ['💗','💕','💖','💓','💞','✨','💫','🌸','♡','~','⭐','🫧','💦','💝'];
    const BL_HEARTS = ['💗','💕','💖','💓','💝','💘','❤','♡','🌸','🌹','✨','✦','✧','💫','💞'];

    const BL_SFX = Array.from({ length: 10 }, (_, i) => {
      const a = new Audio(`assets/bl-sfx-${i + 1}.mp3`);
      a.preload = 'auto'; a.volume = 0.7; return a;
    });
    let lastSfxTime = 0, lastSfxIndex = -1;
    const SFX_COOLDOWN = 400;
    const playBLSfx = () => {
      const now = Date.now();
      if (now - lastSfxTime < SFX_COOLDOWN) return;
      lastSfxTime = now;
      let idx;
      do { idx = Math.floor(Math.random() * BL_SFX.length); } while (idx === lastSfxIndex && BL_SFX.length > 1);
      lastSfxIndex = idx;
      const clip = BL_SFX[idx]; clip.currentTime = 0; clip.play().catch(() => {});
    };
    const throbSync = createThrobSync();

    // Physical sizing: same spec as letter-scene ghost (10.6 cm start, 15.5–17 cm max),
    // clamped to 62% / 92% of window.innerHeight so it fits any window size.
    const VH = window.innerHeight;
    const _psH = 10.6 * _physPX.CM, _psW = 1.0 * _physPX.IN;
    const _ptH = (15.5 + Math.random() * 1.5) * _physPX.CM;
    const _ptW = ( 1.8 + Math.random() * 0.4) * _physPX.IN;
    const START_H  = Math.round(Math.min(_psH, VH * 0.62));
    const START_W  = Math.round(_psW * (START_H / _psH));
    const TARGET_H = Math.round(Math.min(_ptH, VH * 0.92));
    const TARGET_W = Math.round(_ptW * (TARGET_H / _ptH));
    const DIST_NEEDED = 3000;
    let curH = START_H, curW = START_W, rubDist = 0, grown = false;
    let returning = false, holdTimer = null, returnRaf = null;
    let gLastX = null, gLastY = null;
    let gShrinkTimer = null, gShrinkRaf = null, gLastParticleTime = 0;
    let heartShowerInterval = null;

    const applyGhostSize = () => {
      if (ghostImg) { ghostImg.style.height = curH + 'px'; ghostImg.style.width = curW + 'px'; }
      const tNorm = Math.max(0, Math.min(1, (curH - START_H) / (TARGET_H - START_H)));
      if (darkScrim)  darkScrim.style.opacity  = (tNorm * 0.55).toFixed(3);
      if (niPanelBg)  niPanelBg.style.opacity  = tNorm.toFixed(3);
      if (blCard)     blCard.style.setProperty('--cf', (1 - tNorm * 0.9).toFixed(3));
    };

    const spawnGhostEffect = () => {
      if (!ghostImg) return;
      const rect = ghostImg.getBoundingClientRect();
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height * 0.04; // tip
      for (let n = 0; n < 3; n++) {
        setTimeout(() => {
          const el = document.createElement('span');
          el.className = 'bl-particle';
          const ch = BL_CHARS[Math.floor(Math.random() * BL_CHARS.length)];
          const size = 14 + Math.random() * 16;
          const ox = (Math.random() - 0.5) * 28; // tight burst from tip
          const dur = 0.7 + Math.random() * 0.4;
          const rot = (Math.random() - 0.5) * 40;
          el.textContent = ch;
          el.style.cssText = `left:${cx + ox}px;top:${cy}px;font-size:${size}px;--dur:${dur}s;--rot:${rot}deg;`;
          document.body.appendChild(el);
          el.addEventListener('animationend', () => el.remove(), { once: true });
        }, n * 55);
      }
    };

    const spawnHeart = () => {
      if (!ghostImg) return;
      const rect = ghostImg.getBoundingClientRect();
      const el = document.createElement('span');
      el.className = 'bl-heart';
      const ch = BL_HEARTS[Math.floor(Math.random() * BL_HEARTS.length)];
      const size = 12 + Math.random() * 18;
      const x = rect.left + rect.width  * (0.35 + Math.random() * 0.3);
      const y = rect.top  + rect.height * (0.02 + Math.random() * 0.05); // tip
      const dur = 0.9 + Math.random() * 0.6;
      const rot = (Math.random() - 0.5) * 44;
      const sx = Math.random() < 0.5 ? 1 : -1;
      el.textContent = ch;
      el.style.cssText = `left:${x}px;top:${y}px;font-size:${size}px;--dur:${dur}s;--rot:${rot}deg;--sx:${sx};`;
      document.body.appendChild(el);
      el.addEventListener('animationend', () => el.remove(), { once: true });
    };

    const startHeartShower = () => {
      if (heartShowerInterval) return;
      heartShowerInterval = setInterval(() => {
        spawnHeart(); setTimeout(spawnHeart, 60); setTimeout(spawnHeart, 130);
      }, 200);
    };
    const stopHeartShower = () => { clearInterval(heartShowerInterval); heartShowerInterval = null; };

    const stopGhostShrink = () => {
      clearTimeout(gShrinkTimer); gShrinkTimer = null;
      if (gShrinkRaf) { cancelAnimationFrame(gShrinkRaf); gShrinkRaf = null; }
    };
    const startGhostShrink = () => {
      if (grown || rubDist <= 0) return;
      if (ghostWrap) ghostWrap.classList.replace('is-growing', 'is-shrinking') || ghostWrap.classList.add('is-shrinking');
      if (ghostWrap) ghostWrap.classList.remove('is-idle');
      const SHRINK_MS  = 6000;   // slow overall decrease
      const HUFF_DUR   = 380;    // ms per individual huff (76ms rise, 304ms fall)
      const GROUP_GAP  = 1200;   // 1.2s silence after every 2 huffs
      const GROUP_DUR  = HUFF_DUR * 2 + GROUP_GAP; // ~1960ms per group
      const RISE       = 0.2;
      const fromH = curH, fromW = curW, fromDist = rubDist;
      const t0 = performance.now();
      const tick = (now) => {
        const elapsed = now - t0;
        const p = Math.min(1, elapsed / SHRINK_MS);
        // Huff rhythm: huff → huff → 1.2s gap → repeat
        const posInGroup = elapsed % GROUP_DUR;
        let beatVal = 0;
        const huffP1 = posInGroup / HUFF_DUR;
        const huffP2 = (posInGroup - HUFF_DUR) / HUFF_DUR;
        if (posInGroup < HUFF_DUR) {
          beatVal = huffP1 < RISE
            ? Math.sin((huffP1 / RISE) * Math.PI * 0.5)
            : Math.cos(((huffP1 - RISE) / (1 - RISE)) * Math.PI * 0.5);
        } else if (posInGroup < HUFF_DUR * 2) {
          beatVal = huffP2 < RISE
            ? Math.sin((huffP2 / RISE) * Math.PI * 0.5)
            : Math.cos(((huffP2 - RISE) / (1 - RISE)) * Math.PI * 0.5);
        } // else: in gap, beatVal stays 0
        const base  = 1 - p;
        const beatAmp = (fromH - START_H) * 0.35 * (1 - p);
        const throb = beatAmp * beatVal;
        curH = START_H + (fromH - START_H) * base + throb;
        curW = START_W + (fromW - START_W) * base + (fromH > START_H ? throb * (fromW - START_W) / (fromH - START_H) : 0);
        rubDist = fromDist * base;
        applyGhostSize();
        if (p < 1) { gShrinkRaf = requestAnimationFrame(tick); return; }
        rubDist = 0; curH = START_H; curW = START_W; applyGhostSize(); gShrinkRaf = null;
        if (ghostWrap) ghostWrap.classList.remove('is-growing', 'is-shrinking', 'hint-gone');
        if (ghostWrap) ghostWrap.classList.add('is-idle');
      };
      gShrinkRaf = requestAnimationFrame(tick);
    };

    const resetGhost = () => {
      clearTimeout(holdTimer); holdTimer = null;
      if (returnRaf) { cancelAnimationFrame(returnRaf); returnRaf = null; }
      stopGhostShrink(); stopHeartShower(); throbSync.stop();
      grown = false; returning = false; rubDist = 0; curH = START_H; curW = START_W; gLastX = null; gLastY = null;
      applyGhostSize();
      overlay.classList.remove('is-ghost-full');
      if (ghostWrap) ghostWrap.classList.remove('is-growing', 'is-shrinking', 'is-full', 'hint-gone');
      if (ghostWrap) ghostWrap.classList.add('is-idle');
    };

    if (ghostImg) {
      ghostImg.style.cursor = 'crosshair';
      const onRub = (clientX, clientY) => {
        if (grown || returning) return;
        stopGhostShrink();
        if (gLastX !== null) {
          const dx = clientX - gLastX, dy = clientY - gLastY;
          rubDist += Math.sqrt(dx * dx + dy * dy);
          const t = Math.min(1, rubDist / DIST_NEEDED), ease = 1 - Math.pow(1 - t, 3);
          curH = START_H + (TARGET_H - START_H) * ease;
          curW = START_W + (TARGET_W - START_W) * ease;
          applyGhostSize();
          if (ghostWrap) {
            ghostWrap.classList.remove('is-idle', 'is-shrinking');
            ghostWrap.classList.add('is-growing');
            if (t >= 0.05 && !ghostWrap.classList.contains('hint-gone'))
              ghostWrap.classList.add('hint-gone');
          }
          const now = Date.now();
          if (now - gLastParticleTime >= 150) {
            gLastParticleTime = now;
            spawnGhostEffect();
            playBLSfx();
          }
          clearTimeout(gShrinkTimer);
          gShrinkTimer = setTimeout(startGhostShrink, 900);
          if (t >= 1) {
            grown = true; curH = TARGET_H; curW = TARGET_W; applyGhostSize(); stopGhostShrink();
            if (ghostWrap) { ghostWrap.classList.remove('is-growing'); ghostWrap.classList.add('is-full'); }
            overlay.classList.add('is-ghost-full');
            startHeartShower();
            throbSync.start(ghostImg);
            returning = true;
            holdTimer = setTimeout(() => {
              stopHeartShower();
              throbSync.stop();
              overlay.classList.remove('is-ghost-full');
              if (ghostWrap) { ghostWrap.classList.remove('is-full', 'is-growing', 'hint-gone'); ghostWrap.classList.add('is-shrinking'); }
              // Same huff rhythm as startGhostShrink
              const SHRINK_MS  = 6000;
              const HUFF_DUR   = 380;
              const GROUP_GAP  = 1200;
              const GROUP_DUR  = HUFF_DUR * 2 + GROUP_GAP;
              const RISE       = 0.2;
              const fromH = curH, fromW = curW;
              const t0r = performance.now();
              const returnTick = (now) => {
                const elapsed = now - t0r;
                const p = Math.min(1, elapsed / SHRINK_MS);
                const posInGroup = elapsed % GROUP_DUR;
                let beatVal = 0;
                const huffP1 = posInGroup / HUFF_DUR;
                const huffP2 = (posInGroup - HUFF_DUR) / HUFF_DUR;
                if (posInGroup < HUFF_DUR) {
                  beatVal = huffP1 < RISE
                    ? Math.sin((huffP1 / RISE) * Math.PI * 0.5)
                    : Math.cos(((huffP1 - RISE) / (1 - RISE)) * Math.PI * 0.5);
                } else if (posInGroup < HUFF_DUR * 2) {
                  beatVal = huffP2 < RISE
                    ? Math.sin((huffP2 / RISE) * Math.PI * 0.5)
                    : Math.cos(((huffP2 - RISE) / (1 - RISE)) * Math.PI * 0.5);
                }
                const base = 1 - p;
                const beatAmp = (fromH - START_H) * 0.35 * (1 - p);
                const throb = beatAmp * beatVal;
                curH = START_H + (fromH - START_H) * base + throb;
                curW = START_W + (fromW - START_W) * base + (fromH > START_H ? throb * (fromW - START_W) / (fromH - START_H) : 0);
                applyGhostSize();
                if (p < 1) { returnRaf = requestAnimationFrame(returnTick); return; }
                returnRaf = null; holdTimer = null;
                curH = START_H; curW = START_W; applyGhostSize();
                grown = false; returning = false; rubDist = 0; gLastX = null; gLastY = null;
                if (ghostWrap) { ghostWrap.classList.remove('is-shrinking', 'hint-gone'); ghostWrap.classList.add('is-idle'); }
              };
              returnRaf = requestAnimationFrame(returnTick);
            }, 7000);
          }
        }
        gLastX = clientX; gLastY = clientY;
      };
      const onLeave = () => {
        gLastX = null; gLastY = null;
        if (!grown) { clearTimeout(gShrinkTimer); gShrinkTimer = setTimeout(startGhostShrink, 900); }
      };
      ghostImg.addEventListener('mousemove',   (e) => onRub(e.clientX, e.clientY));
      ghostImg.addEventListener('mouseleave',  onLeave);
      ghostImg.addEventListener('touchmove',   (e) => { e.preventDefault(); const t = e.touches[0]; onRub(t.clientX, t.clientY); }, { passive: false });
      ghostImg.addEventListener('touchend',    onLeave);
      ghostImg.addEventListener('touchcancel', onLeave);
    }
    // ────────────────────────────────────────────────────────────────────────────

    const _blMusic = (() => { try { const a = new Audio('assets/bl-music.mp3'); a.loop = true; a.volume = 0.55; return a; } catch(_){return null;} })();

    const openBLOverlay = () => {
      resetGhost();
      overlay.removeAttribute('aria-hidden');
      overlay.classList.add('is-open');
      SoundManager.duckBGM(0, 400);  // fully silence all ambience
      SoundManager.pauseSnore();
      for (let i = 0; i < 15; i++) setTimeout(spawnBgParticle, i * 70);
      showerInterval = setInterval(spawnBgParticle, 130);
      if (_blMusic) { _blMusic.currentTime = 0; _blMusic.play().catch(() => {}); }
    };

    const closeBLOverlay = () => {
      overlay.setAttribute('aria-hidden', 'true');
      overlay.classList.remove('is-open');
      clearInterval(showerInterval);
      showerInterval = null;
      resetGhost();
      const scrim = document.getElementById('poke-scrim');
      if (scrim) scrim.classList.remove('is-active');
      SoundManager.unduckBGM(600);
      SoundManager.resumeSnore();
      if (_blMusic) { _blMusic.pause(); _blMusic.currentTime = 0; }
    };

    closeBtn && closeBtn.addEventListener('click', closeBLOverlay);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('is-open')) closeBLOverlay();
    });

    return openBLOverlay;
  };
  // ────────────────────────────────────────────────────────────────────────────

  // ── Pokémon item popup ────────────────────────────────────────────────────────
  const initPokePopup = (onBLOpen) => {
    const popup      = document.getElementById('poke-popup');
    const icon       = document.getElementById('poke-item-icon');
    const line1      = document.getElementById('poke-line1');
    const line2      = document.getElementById('poke-line2');
    const btnRow     = document.getElementById('poke-btn-row');
    const btnAccept  = document.getElementById('poke-btn-accept');
    const btnDecline = document.getElementById('poke-btn-decline');
    const scrim      = document.getElementById('poke-scrim');
    if (!popup || !icon || !line1 || !line2 || !btnRow) return;

    const ITEM = {
      icon:   '🔞',
      l1:     'You have received',
      l2:     'a MYSTERIOUS GIFT!',
      accept: "Don't hate me for this LOL",
    };

    // Preload the Pokémon item-received jingle
    const _jingle = (() => {
      try { const a = new Audio('assets/poke-item-received.mp3'); a.preload = 'auto'; a.volume = 0.8; return a; } catch (_) { return null; }
    })();
    const playJingle = () => {
      if (!_jingle) return;
      try { const s = _jingle.cloneNode(); s.volume = 0.8; s.play().catch(() => {}); } catch (_) {}
    };

    let typeTimer = null, dismissTimer = null, nextTimer = null;
    let isOpen = false;

    const typeText = (el, text, charDelay, onDone, onChar) => {
      el.textContent = '';
      let i = 0;
      const tick = () => {
        if (i < text.length) {
          el.textContent += text[i++];
          onChar && onChar();
          typeTimer = setTimeout(tick, charDelay);
        } else {
          onDone && onDone();
        }
      };
      typeTimer = setTimeout(tick, charDelay);
    };

    const scheduleNext = (delayMs) => {
      clearTimeout(nextTimer);
      nextTimer = setTimeout(openPopup, delayMs);
    };

    const closePopup = (nextDelay = 2 * 60 * 1000, restoreAudio = true, keepScrim = false, skipSchedule = false) => {
      if (!isOpen) return;
      isOpen = false;
      clearTimeout(typeTimer); clearTimeout(dismissTimer);
      typeTimer = null; dismissTimer = null;
      btnRow.setAttribute('aria-hidden', 'true');
      popup.setAttribute('aria-hidden', 'true');
      popup.classList.remove('is-open');
      if (!keepScrim) scrim && scrim.classList.remove('is-active');
      if (restoreAudio) SoundManager.unduckBGM();
      if (!skipSchedule) scheduleNext(nextDelay);
    };

    const openPopup = () => {
      if (isOpen) return;
      // Only show on the reveal (Snorlax) scene
      if (document.body.dataset.scene !== 'reveal') { scheduleNext(15 * 1000); return; }
      // Don't overlap with BL overlay if it's still showing
      const _bl = document.getElementById('bl-overlay');
      if (_bl && _bl.classList.contains('is-open')) { scheduleNext(2 * 60 * 1000); return; }
      isOpen = true;
      clearTimeout(nextTimer); nextTimer = null;
      const item = ITEM;
      icon.textContent  = item.icon;
      line1.textContent = '';
      line2.textContent = '';
      btnRow.setAttribute('aria-hidden', 'true');
      popup.removeAttribute('aria-hidden');
      popup.classList.add('is-open');
      scrim && scrim.classList.add('is-active');
      playJingle();
      SoundManager.duckBGM();

      // Type line 1 → pause → type line 2 → show choice buttons
      typeText(line1, item.l1, 55, () => {
        setTimeout(() => {
          typeText(line2, item.l2, 65, () => {
            btnRow.removeAttribute('aria-hidden');
            btnAccept && btnAccept.focus();
          });
        }, 160);
      });
    };

    // Accept → swap message to "Okayyy ;)" then close after 2 s → next in 2 min
    btnAccept && btnAccept.addEventListener('mouseenter', () => {
      const a = new Audio('assets/option-sfx-1.mp3'); a.volume = 0.7; a.play().catch(() => {});
    });
    btnAccept && btnAccept.addEventListener('click', () => {
      if (!isOpen) return;
      _playSelectSFX();
      clearTimeout(typeTimer); typeTimer = null;
      clearTimeout(dismissTimer); dismissTimer = null;
      btnRow.setAttribute('aria-hidden', 'true');
      icon.textContent = '❤️';
      line2.textContent = '';
      typeText(line1, ITEM.accept, 80, () => {
        dismissTimer = setTimeout(() => {
          closePopup(2 * 60 * 1000, false, true); // close popup; keep scrim + audio ducked — BL overlay takes over
          onBLOpen && onBLOpen();
        }, 2000);
      }, () => SoundManager.playTypingBleep());
    });

    // Not Now → close immediately → next in 1 min
    btnDecline && btnDecline.addEventListener('mouseenter', () => {
      const a = new Audio('assets/option-sfx-2.mp3'); a.volume = 0.7; a.play().catch(() => {});
    });
    btnDecline && btnDecline.addEventListener('click', () => {
      _playSelectSFX();
      closePopup(1 * 60 * 1000);
    });

    // Escape behaves like Not Now
    document.addEventListener('keydown', (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape') { e.preventDefault(); closePopup(1 * 60 * 1000); }
    });

    // First popup fires 10 s after the reveal (Snorlax) scene is first entered.
    // Subsequent timing is driven by closePopup's scheduleNext call.
    const sceneObserver = new MutationObserver(() => {
      if (document.body.dataset.scene === 'reveal') {
        // Entered reveal — (re)schedule the popup fresh every time
        clearTimeout(nextTimer);
        nextTimer = setTimeout(openPopup, 10 * 1000);
      } else {
        // Left reveal — cancel any pending popup timer and force-close if open
        clearTimeout(nextTimer);
        nextTimer = null;
        if (isOpen) closePopup(0, true, false, true);
      }
    });
    sceneObserver.observe(document.body, { attributes: true, attributeFilter: ['data-scene'] });
    if (document.body.dataset.scene === 'reveal') {
      nextTimer = setTimeout(openPopup, 10 * 1000);
    }
  };
  // ────────────────────────────────────────────────────────────────────────────

  const init = () => {
    updateScene(sceneNames[currentSceneIndex], 0);
    SoundManager.onSceneChange(sceneNames[currentSceneIndex]); // queue intro BGM
    SoundManager.unlock(); // attempt immediate autoplay — no click required
    updateButtons(sceneNames[currentSceneIndex]);
    announceScene(sceneNames[currentSceneIndex]);

    // Preloaded select-button SFX — reuses module-level element
    const playSelectSFX = _playSelectSFX;

    // Set up entry button click interaction (intro → reveal transition)
    const entryButton = document.getElementById("entry-button");
    if (entryButton) {
      entryButton.addEventListener("click", () => {
        playSelectSFX();
        advanceScene();
      });
    }

    document.querySelectorAll("[data-action='advance-scene']").forEach((button) => {
      button.addEventListener("click", () => handleButtonClick(button));
      button.addEventListener("keydown", handleKeydown);
    });

    document.querySelectorAll("[data-action='reveal-letter']").forEach((btn) => {
      let _clicked = false;
      btn.addEventListener('mouseenter', () => {
        _clicked = false;
        const a = new Audio('assets/option-sfx-1.mp3');
        a.volume = 0.7;
        a.play().catch(() => {});
        startHeartEffect();
      });
      btn.addEventListener('mouseleave', () => { if (!_clicked) startZzzEffect(); });
      btn.addEventListener("click", () => {
        playSelectSFX();
        stopSnorlaxEffect();
        SoundManager.playSnorlaxReveal();
        const figure = document.querySelector('.snorlax-figure');
        if (figure) {
          // Bounce
          figure.style.animation = 'snorlaxBounce 0.55s ease-in-out';
          figure.addEventListener('animationend', () => { figure.style.animation = 'none'; }, { once: true });

          // Floating hearts
          const rect = figure.getBoundingClientRect();
          [0, -24, 24, -12, 12].forEach((dx, i) => {
            setTimeout(() => {
              const h = document.createElement('span');
              h.className = 'snorlax-heart';
              h.textContent = i % 2 === 0 ? '♡' : '♥';
              h.style.left = (rect.left + rect.width / 2 + dx - 12) + 'px';
              h.style.top  = (rect.top  + rect.height * 0.2) + 'px';
              document.body.appendChild(h);
              setTimeout(() => h.remove(), 1100);
            }, i * 90);
          });
        }

        _clicked = true;
        playVerticalWipe(() => goToScene("letter"));
      });
    });

    document.querySelectorAll("[data-action='return-intro']").forEach((btn) => {
      let _clicked = false;
      btn.addEventListener('mouseenter', () => {
        _clicked = false;
        const a = new Audio('assets/option-sfx-2.mp3');
        a.volume = 0.7;
        a.play().catch(() => {});
        startMoyaEffect();
      });
      btn.addEventListener('mouseleave', () => { if (!_clicked) startZzzEffect(); });
      btn.addEventListener("click", () => {
        _clicked = true;
        playSelectSFX();
        stopSnorlaxEffect();
        spawnMoyaMoya();
        SoundManager.playSnorlaxReturn();
        playFadeToWhite(() => goToScene("intro"));
      });
    });

    // Love Pokéball button — play catch animation then advance scene
    const pokeballBtn = document.querySelector('.pokeball-btn');
    if (pokeballBtn) {
      // Disabled until the letter typewriter finishes
      pokeballBtn.disabled = true;

      // Enable only after the last page's typing finishes (or is skipped)
      document.addEventListener('letterComplete', () => {
        pokeballBtn.disabled = false;
        pokeballBtn.classList.add('is-ready');
      });

      // Disable pokeball on any letter scene class change:
      // entering resets it (typewriter will re-enable); leaving also disables it
      const letterScene = document.querySelector('.scene[data-scene="letter"]');
      if (letterScene) {
        new MutationObserver(() => {
          pokeballBtn.disabled = true;
          pokeballBtn.classList.remove('is-ready');
        }).observe(letterScene, { attributes: true, attributeFilter: ['class'] });
      }

      // Pokéball shake SFX — plays while cursor hovers, stops on leave
      const _shakeSFX = (() => { try { const a = new Audio('assets/pokeball-shake.mp3'); a.volume = 0.8; a.loop = true; return a; } catch(_){return null;} })();
      const _activateSFX = (() => { try { const a = new Audio('assets/PokeballActivate.mp3'); a.volume = 1.0; return a; } catch(_){return null;} })();
      pokeballBtn.addEventListener('mouseenter', () => { if (_shakeSFX && !pokeballBtn.disabled) { _shakeSFX.currentTime = 0; _shakeSFX.play().catch(() => {}); } });
      pokeballBtn.addEventListener('mouseleave', () => { if (_shakeSFX) { _shakeSFX.pause(); _shakeSFX.currentTime = 0; } });

      pokeballBtn.addEventListener('click', () => {
        if (isTransitioning || pokeballBtn.disabled) return;
        if (_shakeSFX) { _shakeSFX.pause(); _shakeSFX.currentTime = 0; }
        if (_activateSFX) { _activateSFX.currentTime = 0; _activateSFX.play().catch(() => {}); }
        pokeballBtn.disabled = true;
        pokeballBtn.classList.add('is-catching');

        // Screen flash at the moment the sprite success-flash fires (~72% of 2.5s)
        setTimeout(() => {
          if (prefersReducedMotion) return;
          const flash = document.createElement('div');
          flash.className = 'pokeball-screen-flash';
          document.body.appendChild(flash);
          flash.addEventListener('animationend', () => flash.remove(), { once: true });
        }, 1800);

        setTimeout(() => {
          advanceScene();
          setTimeout(() => {
            pokeballBtn.disabled = false;
            pokeballBtn.classList.remove('is-catching');
          }, 800);
        }, 2400);
      });
    }

    document.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        const activeButton = document.querySelector("[data-action='advance-scene']:focus");
        if (activeButton) {
          handleKeydown(event);
        }
      }
    });

    initLetterPagination();
    initGengarFollower();
    initMewFollower();
    const _openBLOverlay = initBLOverlay();
    initPokePopup(_openBLOverlay);

    // Fallback: unlock audio on first user interaction if autoplay was blocked
    const _audioUnlock = () => SoundManager.unlock();
    document.addEventListener('click',      _audioUnlock, { once: true });
    document.addEventListener('touchstart', _audioUnlock, { once: true, passive: true });
    document.addEventListener('keydown',    _audioUnlock, { once: true });

    // Start intro loop — delayed on first boot so components appear first
    const introBootDelay = document.body.classList.contains('booted') ? 0 : 1800;
    setTimeout(startIntroLoop, introBootDelay);
    setTimeout(() => document.body.classList.add('booted'), 2100);
    const introSectionLoop = document.getElementById('intro');
    if (introSectionLoop) {
      // Restart loop whenever intro scene becomes active again
      new MutationObserver(() => {
        if (introSectionLoop.classList.contains('is-active')) {
          if (document.body.classList.contains('is-transitioning')) {
            document.addEventListener('scene-transition-done', startIntroLoop, { once: true });
          } else {
            startIntroLoop();
          }
        } else {
          stopIntroLoop();
        }
      }).observe(introSectionLoop, { attributes: true, attributeFilter: ['class'] });
    }
  };

  // ── Custom ghost cursor ────────────────────────────────────────────────────
  (() => {
    const gc = document.getElementById('ghost-cursor');
    if (!gc) return;
    let cx = -200, cy = -200;
    let rafId = null;
    const move = (x, y) => {
      cx = x; cy = y;
      if (!rafId) rafId = requestAnimationFrame(() => {
        gc.style.left = cx + 'px';
        gc.style.top  = cy + 'px';
        rafId = null;
      });
    };
    document.addEventListener('mousemove', e => { gc.style.opacity = '1'; move(e.clientX, e.clientY); });
    document.addEventListener('mouseleave', () => { gc.style.opacity = '0'; });
    document.addEventListener('mouseenter', () => { gc.style.opacity = '1'; });
    gc.style.opacity = '0';
    gc.style.left = '-200px';
    gc.style.top  = '-200px';
  })();
  // ────────────────────────────────────────────────────────────────────────────

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
