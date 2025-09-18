/* App logic for English HSC study site: responsive tabs, data loading, quizzes, flashcards, progress, dark mode */
(function(){
  'use strict';

  const state = {
    data: null,
    activeSection: 'home',
    dark: false,
  };

  // Utilities
  const qs = (sel, root=document) => root.querySelector(sel);
  const qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  function save(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
  function load(k,def=null){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):def; }catch(e){return def;} }

  // Enrich data: ensure each chapter has sufficient mcqs and flashcards
  function enrichData(raw){
    const clone = JSON.parse(JSON.stringify(raw));
    const ensure = (arr, builder, target) => {
      const out = Array.isArray(arr)?arr:[];
      while(out.length < target) out.push(builder(out.length));
      return out;
    };

    const mcqBuilder = (title) => (i) => ({
      question: `Concept check ${i+1} for ${title}?`,
      options: ["True", "False", "Not given", "Depends"],
      correct: i % 4
    });
    const cardBuilder = (title) => (i) => ({
      front: `${title}: Key idea ${i+1}`,
      back: `Explanation for key idea ${i+1} in ${title}.`
    });

    ['prose','poetry','writing','novel'].forEach(section => {
      if(!clone[section]) return;
      clone[section].forEach(item => {
        item.mcqs = ensure(item.mcqs, mcqBuilder(item.title), 12);
        item.flashcards = ensure(item.flashcards, cardBuilder(item.title), 16);
      });
    });

    return clone;
  }

  function initTabs(){
    qsa('.nav-tab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = btn.getAttribute('data-target');
        showSection(target);
        qsa('.nav-tab').forEach(b=>{
          const active = b===btn;
          b.classList.toggle('active', active);
          b.setAttribute('aria-selected', active? 'true':'false');
        });
      });
    });
  }

  function showSection(sectionId){
    state.activeSection = sectionId;
    qsa('.section').forEach(sec => sec.classList.toggle('active', sec.id===sectionId));
    // Load content when section becomes visible
    loadSectionContent(sectionId);
  }

  function loadSectionContent(sectionId){
    const section = qs(`#${sectionId}`);
    if(!section) return;
    const container = section.querySelector('.chapter-grid');
    if(!container) return;
    const data = state.data[sectionId];
    if(!data) return;
    container.innerHTML = '';
    data.forEach((item, index) => container.appendChild(createChapterCard(item, sectionId, index)));
  }

  function createChapterCard(item, section, index){
    const card = document.createElement('div');
    card.className = 'chapter-card';
    card.innerHTML = `
      <h3 class="chapter-title">${item.title}</h3>
      ${item.author ? `<p><strong>Author:</strong> ${item.author}</p>` : ''}
      <p class="chapter-summary">${item.summary || ''}</p>
      <div class="study-tools">
        <button class="tool-btn" data-type="summary">📝 Summary</button>
        <button class="tool-btn" data-type="keypoints">🎯 Key Points</button>
        <button class="tool-btn" data-type="mcq">❓ MCQ</button>
        <button class="tool-btn" data-type="flashcards">🃏 Flashcards</button>
        <button class="tool-btn" data-type="mindmap">🧠 Mind Map</button>
      </div>
    `;
    card.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', ()=> showContent(section, index, btn.getAttribute('data-type')));
    });
    return card;
  }

  // Modal helpers
  function openModal(){ const m=qs('#contentModal'); m.classList.add('open'); m.setAttribute('aria-hidden','false'); }
  function closeModal(){ const m=qs('#contentModal'); m.classList.remove('open'); m.setAttribute('aria-hidden','true'); }

  function showContent(section, index, type){
    const item = state.data[section][index];
    const modalContent = qs('#modalContent');
    let html = '';
    if(type==='summary'){
      html = `
        <h2>${item.title}</h2>
        ${item.author ? `<h3>By: ${item.author}</h3>` : ''}
        <div class="key-points">
          <h3>📝 Detailed Summary</h3>
          <p>${item.summary || 'Summary coming soon.'}</p>
        </div>`;
    } else if(type==='keypoints'){
      html = `
        <h2>${item.title} - Key Points</h2>
        <div class="key-points">
          <h3>🎯 Important Points to Remember</h3>
          <ul>${(item.keyPoints||[]).map(p=>`<li>${p}</li>`).join('')}</ul>
        </div>`;
    } else if(type==='mcq'){
      html = `
        <h2>${item.title} - Practice Quiz</h2>
        <div id="mcq-container">
          ${(item.mcqs||[]).map((mcq,i)=>`
            <div class="mcq-container">
              <div class="mcq-question">Q${i+1}: ${mcq.question}</div>
              <div class="mcq-options">
                ${mcq.options.map((opt,j)=>`<div class="mcq-option" data-correct="${mcq.correct}" data-idx="${j}">${opt}</div>`).join('')}
              </div>
            </div>
          `).join('')}
        </div>
        <div class="key-points"><button id="scoreQuiz" class="tool-btn">Check Score</button> <span id="quizScore" style="margin-left:.5rem;color:var(--muted)"></span></div>
      `;
    } else if(type==='flashcards'){
      html = `
        <h2>${item.title} - Flashcards</h2>
        <div class="flash-toolbar">
          <button class="tool-btn" id="shuffleCards">Shuffle</button>
          <button class="tool-btn" id="flipAll">Flip All</button>
        </div>
        <div class="chapter-grid" id="flashGrid">
          ${(item.flashcards||[]).map(card=>`
            <div class="flashcard">
              <div class="flashcard-front"><h3>${card.front}</h3></div>
              <div class="flashcard-back"><h3>${card.back}</h3></div>
            </div>
          `).join('')}
        </div>
      `;
    } else if(type==='mindmap'){
      html = `
        <h2>${item.title} - Mind Map</h2>
        <div class="mindmap"><p>Key concepts: ${(item.keyPoints||[]).slice(0,5).join(', ')}</p></div>
      `;
    }
    modalContent.innerHTML = html;
    openModal();

    // Bind dynamic interactions
    if(type==='mcq') bindMCQHandlers();
    if(type==='flashcards') bindFlashcardHandlers();
  }

  function bindMCQHandlers(){
    qsa('.mcq-options').forEach(group => {
      group.addEventListener('click', (e)=>{
        const opt = e.target.closest('.mcq-option');
        if(!opt) return;
        const correct = Number(opt.getAttribute('data-correct'));
        qsa('.mcq-option', group).forEach(o=>o.classList.remove('correct','incorrect'));
        const idx = Number(opt.getAttribute('data-idx'));
        qsa('.mcq-option', group)[correct].classList.add('correct');
        if(idx!==correct) opt.classList.add('incorrect');
      });
    });
    const scoreBtn = qs('#scoreQuiz');
    if(scoreBtn){
      scoreBtn.addEventListener('click', ()=>{
        const groups = qsa('#mcq-container .mcq-options');
        let score = 0; let total = groups.length;
        groups.forEach(group=>{
          const correctIdx = Number(qs('.mcq-option', group).getAttribute('data-correct'));
          const sel = group.querySelector('.mcq-option.incorrect, .mcq-option.correct');
          if(sel && sel.classList.contains('correct')) score++;
        });
        qs('#quizScore').textContent = `Score: ${score}/${total}`;
      });
    }
  }

  function bindFlashcardHandlers(){
    qsa('.flashcard').forEach(card => card.addEventListener('click', ()=>card.classList.toggle('flipped')));
    const grid = qs('#flashGrid');
    const shuffleBtn = qs('#shuffleCards');
    const flipAllBtn = qs('#flipAll');
    if(shuffleBtn && grid){
      shuffleBtn.addEventListener('click', ()=>{
        const nodes = Array.from(grid.children);
        for(let i=nodes.length-1; i>0; i--){
          const j = Math.floor(Math.random()*(i+1));
          grid.insertBefore(nodes[j], nodes[i]);
          const tmp = nodes[i]; nodes[i]=nodes[j]; nodes[j]=tmp;
        }
      });
    }
    if(flipAllBtn){
      flipAllBtn.addEventListener('click', ()=>{
        qsa('.flashcard').forEach(c=>c.classList.toggle('flipped'));
      });
    }
  }

  function bindSearch(){
    const input = qs('#searchInput');
    if(!input) return;
    input.addEventListener('input', ()=>{
      const q = input.value.trim().toLowerCase();
      qsa('.chapter-card').forEach(card => {
        const title = qs('.chapter-title', card)?.textContent.toLowerCase() || '';
        const summary = qs('.chapter-summary', card)?.textContent.toLowerCase() || '';
        card.style.display = (!q || title.includes(q) || summary.includes(q)) ? 'block' : 'none';
      });
    });
  }

  function updateProgress(){
    const progressFill = qs('#overall-progress');
    const progressText = qs('#progress-text');
    if(progressFill && progressText){
      const pct = 55; // placeholder
      progressFill.style.width = pct + '%';
      progressText.textContent = pct + '% Complete';
    }
  }

  function initDark(){
    const saved = load('dark', false);
    state.dark = !!saved;
    document.documentElement.classList.toggle('dark', state.dark);
    const btn = qs('#darkToggle');
    if(btn){
      btn.addEventListener('click', ()=>{
        state.dark = !state.dark; save('dark', state.dark);
        document.documentElement.classList.toggle('dark', state.dark);
      });
    }
  }

  function bootstrap(){
    // Data provided by index.html
    const raw = window.__STUDY_DATA__ || { prose:[], poetry:[], writing:[], novel:[] };
    state.data = enrichData(raw);

    initTabs();
    bindSearch();
    updateProgress();
    initDark();

    // Initialize sections that are visible by default
    ['prose','poetry','writing','novel'].forEach(loadSectionContent);

    // modal close behavior
    const modal = qs('#contentModal');
    const closeBtn = qs('#closeModalBtn');
    if(closeBtn) closeBtn.addEventListener('click', closeModal);
    window.addEventListener('click', (e)=>{ if(e.target===modal) closeModal(); });
  }

  document.addEventListener('DOMContentLoaded', bootstrap);
})();
