/* Catálogo em imagem (admin › Produtos › "Catálogo PNG/PDF").
 * Gera o catálogo dos aparelhos escolhidos em PNG (stories 1080×1920 ou post 1080×1350) e em PDF (A4),
 * com fundo preto, logo da RB Tech, letras brancas e preços em amarelo, nas cores da skin escolhida
 * (Black Friday, Natal...). Tudo é desenhado no navegador (canvas): nada sai do aparelho do dono. */
(function (w) {
  'use strict';
  const RB = w.RB;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = RB.esc, money = RB.money;

  const TITULO = '"Inter Tight", "Manrope", system-ui, -apple-system, "Segoe UI", sans-serif';
  const TEXTO = '"Manrope", system-ui, -apple-system, "Segoe UI", sans-serif';
  const AMARELO = ['#ffe27a', '#f5c542'];
  // tamanhos de cada formato (px); topo = cabeçalho, rodape = rodapé, cols × linhas = aparelhos por página
  const FORMATOS = {
    stories: { nome: 'Stories', dica: '1080×1920', W: 1080, H: 1920, topo: 430, rodape: 200, cols: 2, linhas: 3, ext: 'png' },
    post: { nome: 'Post', dica: '1080×1350', W: 1080, H: 1350, topo: 300, rodape: 150, cols: 2, linhas: 2, ext: 'png' },
    pdf: { nome: 'PDF', dica: 'A4', W: 1240, H: 1754, topo: 360, rodape: 180, cols: 2, linhas: 3, ext: 'pdf' }
  };
  const ONDE = [['vitrine', '🏪 Vitrine', RB.naVitrine], ['topo', '⭐ Topo', RB.noTopo], ['catalogo', '📂 Catálogo', RB.noCatalogo], ['encomenda', '📦 Sob encomenda', RB.sobEncomenda]];
  const ORDENS = [['menor', 'Menor preço primeiro'], ['maior', 'Maior preço primeiro'], ['modelo', 'Modelo (A-Z)']];

  // ---------- cores da skin (as mesmas do site: lidas do CSS de cada tema) ----------
  function paleta(tema) {
    const d = RB.CAMPANHAS[tema];
    if (!d) return { c1: '#d9a514', c2: '#f5c542', c3: '#fff1b8', escuro: '#6b4f0a', tag: 'RB TECH', hero: ['CATÁLOGO', 'DE OFERTAS'], texto: 'iPhones novos e seminovos com garantia' };
    const p = document.createElement('div');
    p.className = 'bf tema-' + tema; p.style.display = 'none';
    document.body.appendChild(p);
    const cs = getComputedStyle(p), v = (k, pad) => cs.getPropertyValue(k).trim() || pad;
    const r = { c1: v('--fire1', '#ff3d00'), c2: v('--fire2', '#ff8a00'), c3: v('--fire3', '#ffd000'), escuro: v('--camp-escuro', '#c41e00') };
    p.remove();
    return Object.assign(r, { tag: d.tag, hero: d.hero, texto: String(d.texto || '').replace(/\*/g, '') });
  }
  function alfa(cor, a) {
    let h = String(cor).trim().replace('#', '');
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    if (!/^[0-9a-f]{6}$/i.test(h)) return cor;
    const n = parseInt(h, 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  // ---------- desenho ----------
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  // escreve e diminui a letra até caber em "max"; devolve a largura
  function escrever(ctx, t, x, y, o) {
    let tam = o.tam;
    const fonte = () => { ctx.font = (o.peso || 700) + ' ' + tam + 'px ' + (o.fonte || TEXTO); };
    fonte();
    if ('letterSpacing' in ctx) ctx.letterSpacing = o.espaco || '0px';
    while (o.max && tam > 10 && ctx.measureText(t).width > o.max) { tam -= 1; fonte(); }
    ctx.textAlign = o.alinha || 'left'; ctx.textBaseline = o.base || 'alphabetic';
    const larg = ctx.measureText(t).width;
    if (o.cores) { // degradê horizontal no texto
      const x0 = o.alinha === 'center' ? x - larg / 2 : o.alinha === 'right' ? x - larg : x;
      const g = ctx.createLinearGradient(x0, 0, x0 + larg, 0);
      o.cores.forEach((c, i) => g.addColorStop(o.cores.length > 1 ? i / (o.cores.length - 1) : 0, c));
      ctx.fillStyle = g;
    } else ctx.fillStyle = o.cor || '#fff';
    ctx.fillText(t, x, y);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    return larg;
  }
  const cacheImg = new Map();
  function carregar(src) {
    if (!src) return Promise.resolve(null);
    if (!cacheImg.has(src)) cacheImg.set(src, new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; }));
    return cacheImg.get(src);
  }
  // foto própria (inteira, recortando as bordas) ou foto do modelo recortada (fundo transparente, inteira)
  function fotoDe(p) {
    const f = p.fotos && p.fotos.filter(Boolean)[0];
    if (f) return { src: f, recorte: /^img\/xiaomi\//.test(f) };
    const m = RB.fotoModelo(p);
    return m ? { src: m, recorte: true } : null;
  }
  function celularGenerico(ctx, cx, cy, h, pal) {
    const w = h * 0.5;
    rr(ctx, cx - w / 2, cy - h / 2, w, h, w * 0.18); ctx.fillStyle = '#1c1c22'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = alfa(pal.c2, 0.8); ctx.stroke();
    rr(ctx, cx - w * 0.36, cy - h * 0.42, w * 0.3, w * 0.3, w * 0.08); ctx.fillStyle = '#2a2a33'; ctx.fill();
  }
  function fone(n) {
    const d = String(n || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
    const m = /^(\d{2})(\d{4,5})(\d{4})$/.exec(d);
    return m ? '(' + m[1] + ') ' + m[2] + '-' + m[3] : n || '';
  }

  async function cartao(ctx, p, x, y, w, h, pal, opc, cat, img) {
    const pad = 20, raio = 26;
    ctx.save();
    rr(ctx, x, y, w, h, raio); ctx.fillStyle = '#111114'; ctx.fill();
    ctx.save(); ctx.clip();
    // área da foto com brilho da skin
    const ih = Math.round(h * 0.54), fx = 34;
    const g = ctx.createRadialGradient(x + w / 2, y + ih * 0.5, 10, x + w / 2, y + ih * 0.5, w * 0.62);
    g.addColorStop(0, alfa(pal.c1, 0.38)); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = '#09090b'; ctx.fillRect(x, y, w, ih);
    ctx.fillStyle = g; ctx.fillRect(x, y, w, ih);
    const foto = fotoDe(p);
    if (img && foto && !foto.recorte) { // foto própria: preenche a área
      const s = Math.max(w / img.width, (ih - fx) / img.height), iw = img.width * s, ihh = img.height * s;
      ctx.drawImage(img, x + (w - iw) / 2, y + (ih - fx - ihh) / 2, iw, ihh);
    } else if (img) { // foto do modelo: inteira e centralizada
      const bw = w - pad * 2, bh = ih - fx - 16, s = Math.min(bw / img.width, bh / img.height);
      ctx.drawImage(img, x + (w - img.width * s) / 2, y + 8 + (bh - img.height * s) / 2, img.width * s, img.height * s);
    } else celularGenerico(ctx, x + w / 2, y + (ih - fx) / 2 + 4, (ih - fx) * 0.78, pal);
    // faixa da skin embaixo da foto
    const fg = ctx.createLinearGradient(x, 0, x + w, 0);
    fg.addColorStop(0, pal.escuro); fg.addColorStop(0.5, pal.c1); fg.addColorStop(1, pal.escuro);
    ctx.fillStyle = fg; ctx.fillRect(x, y + ih - fx, w, fx);
    escrever(ctx, pal.tag, x + w / 2, y + ih - fx / 2 + 1, { tam: 17, peso: 900, fonte: TITULO, alinha: 'center', base: 'middle', espaco: '4px', max: w - 20 });
    // selos: condição e encomenda
    let sx = x + 14;
    const selo = (t, fundo, cor) => {
      ctx.font = '800 17px ' + TEXTO;
      const tw = ctx.measureText(t).width + 22;
      rr(ctx, sx, y + 14, tw, 32, 16); ctx.fillStyle = fundo; ctx.fill();
      escrever(ctx, t, sx + 11, y + 31, { tam: 17, peso: 800, cor, base: 'middle' });
      sx += tw + 8;
    };
    if (p.condicao) selo(String(p.condicao).toUpperCase(), 'rgba(0,0,0,.66)', '#fff');
    if (RB.sobEncomenda(p)) selo('SOB ENCOMENDA', alfa(pal.c2, 0.92), '#111');
    ctx.restore();
    ctx.lineWidth = 2; ctx.strokeStyle = alfa(pal.c1, 0.55); rr(ctx, x, y, w, h, raio); ctx.stroke();

    // textos (de baixo para cima, para nunca passar do cartão)
    const max = w - pad * 2;
    let by = y + h - pad;
    if (opc.parcelado) {
      const ult = RB.parcelas(cat, p.preco).slice(-1)[0];
      if (ult && ult.n > 1) { escrever(ctx, 'ou ' + ult.n + 'x de ' + money(ult.parcela), x + pad, by, { tam: 22, peso: 600, cor: '#a9a9b4', max }); by -= 34; }
    }
    const preco = money(RB.valorPix(cat, p.preco));
    const pl = escrever(ctx, preco, x + pad, by, { tam: 46, peso: 900, fonte: TITULO, cores: AMARELO, max: max - 110 });
    escrever(ctx, 'à vista', x + pad + pl + 10, by, { tam: 20, peso: 700, cor: 'rgba(255,255,255,.7)' });
    by -= 52;
    if (opc.riscado && Number(p.precoAntigo) > Number(p.preco)) {
      const t = money(p.precoAntigo);
      const tl = escrever(ctx, t, x + pad, by, { tam: 22, peso: 600, cor: '#8d8d98' });
      ctx.strokeStyle = alfa(pal.c1, 0.9); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x + pad, by - 8); ctx.lineTo(x + pad + tl, by - 8); ctx.stroke();
      by -= 32;
    }
    const meta = [p.cor, RB.ehIphone(p) ? '' : p.specs || ''].concat(opc.bateria && RB.ehIphone(p) && RB.batTexto(p, cat) ? ['Bateria ' + RB.batTexto(p, cat)] : []).filter(Boolean).join(' · ');
    if (meta) { escrever(ctx, meta, x + pad, by, { tam: 22, peso: 600, cor: '#c3c3cc', max }); by -= 36; }
    const nome = RB.nomeProduto(p);
    escrever(ctx, nome, x + pad, Math.max(by, y + ih + 44), { tam: 34, peso: 800, fonte: TITULO, cor: '#fff', max });
    ctx.restore();
  }

  function cabecalho(ctx, F, pal, logo, opc, pag, total) {
    const W = F.W, T = F.topo, m = 54;
    // fundo preto com brilho da skin
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, F.H);
    const g1 = ctx.createRadialGradient(W * 0.85, T * 0.25, 10, W * 0.85, T * 0.25, W * 0.75);
    g1.addColorStop(0, alfa(pal.c1, 0.34)); g1.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g1; ctx.fillRect(0, 0, W, F.H);
    const g2 = ctx.createRadialGradient(0, F.H, 10, 0, F.H, W * 0.9);
    g2.addColorStop(0, alfa(pal.c2, 0.14)); g2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g2; ctx.fillRect(0, 0, W, F.H);
    // logo
    let lx = m;
    if (logo) {
      const lh = Math.min(T * 0.66, 270), lw = lh * logo.width / logo.height;
      ctx.drawImage(logo, m - 6, (T - lh) / 2 - 6, lw, lh);
      lx = m + lw + 30;
    }
    // título grande: 1ª linha branca, 2ª no degradê da skin
    const tw = W - lx - m, base = T * 0.42;
    const t1 = T > 380 ? 76 : 60;
    escrever(ctx, pal.hero[0], lx, base, { tam: t1, peso: 900, fonte: TITULO, cor: '#fff', max: tw });
    escrever(ctx, pal.hero[1], lx, base + t1 * 0.98, { tam: t1, peso: 900, fonte: TITULO, cores: [pal.c1, pal.c3, pal.c2], max: tw });
    const sub = String(opc.subtitulo || pal.texto || '').trim();
    if (sub) escrever(ctx, sub, lx, base + t1 * 0.98 + (T > 380 ? 56 : 44), { tam: T > 380 ? 28 : 24, peso: 700, cor: '#e9e6dc', max: tw });
    const hoje = new Date();
    escrever(ctx, 'Atualizado em ' + String(hoje.getDate()).padStart(2, '0') + '/' + String(hoje.getMonth() + 1).padStart(2, '0') + '/' + hoje.getFullYear(),
      lx, base + t1 * 0.98 + (T > 380 ? 96 : 76), { tam: 20, peso: 600, cor: '#8d8d98', max: tw });
    if (total > 1) escrever(ctx, pag + '/' + total, W - m, 46, { tam: 22, peso: 800, cor: alfa(pal.c3, 0.85), alinha: 'right' });
  }

  function rodape(ctx, F, pal, cat) {
    const W = F.W, y = F.H - F.rodape, m = 54;
    const lg = ctx.createLinearGradient(m, 0, W - m, 0);
    lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(0.2, pal.c1); lg.addColorStop(0.8, pal.c2); lg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lg; ctx.fillRect(m, y + 4, W - m * 2, 3);
    const loja = cat.loja || {};
    const R = F.rodape, grande = R > 170;
    escrever(ctx, 'CHAME NO WHATSAPP', m, y + R * 0.27, { tam: grande ? 20 : 17, peso: 800, cor: '#a9a9b4', espaco: '3px' });
    escrever(ctx, fone(loja.whatsapp), m, y + R * 0.27 + (grande ? 52 : 42), { tam: grande ? 44 : 36, peso: 900, fonte: TITULO, cor: '#fff' });
    if (loja.instagram) escrever(ctx, '@' + String(loja.instagram).replace(/^@/, ''), W - m, y + R * 0.27 + (grande ? 52 : 42), { tam: grande ? 30 : 26, peso: 800, cores: AMARELO, alinha: 'right' });
    escrever(ctx, 'Preço à vista no Pix · parcelamos no cartão · sujeito à disponibilidade', m, y + R - (grande ? 28 : 16),
      { tam: grande ? 19 : 17, peso: 600, cor: '#77777f', max: W - m * 2 });
  }

  // monta as páginas (canvas) do formato escolhido
  async function paginas(cat, lista, F, pal, opc, deveParar) {
    await Promise.all([
      document.fonts && document.fonts.load('900 60px "Inter Tight"'),
      document.fonts && document.fonts.load('800 24px "Manrope"')
    ].filter(Boolean)).catch(() => {});
    const logo = await carregar('img/marca/logo.webp');
    const fotos = await Promise.all(lista.map((p) => carregar((fotoDe(p) || {}).src)));
    const porPag = F.cols * F.linhas, total = Math.max(1, Math.ceil(lista.length / porPag)), out = [];
    const m = 48, gap = 24;
    const cw = (F.W - m * 2 - gap * (F.cols - 1)) / F.cols;
    const ch = (F.H - F.topo - F.rodape - gap * (F.linhas - 1) - 16) / F.linhas;
    for (let pg = 0; pg < total; pg++) {
      if (deveParar()) return null;
      const c = document.createElement('canvas');
      c.width = F.W; c.height = F.H;
      const ctx = c.getContext('2d');
      cabecalho(ctx, F, pal, logo, opc, pg + 1, total);
      const itens = lista.slice(pg * porPag, (pg + 1) * porPag);
      for (let k = 0; k < itens.length; k++) {
        const col = k % F.cols, lin = Math.floor(k / F.cols);
        await cartao(ctx, itens[k], m + col * (cw + gap), F.topo + lin * (ch + gap), cw, ch, pal, opc, cat, fotos[pg * porPag + k]);
      }
      rodape(ctx, F, pal, cat);
      out.push(c);
    }
    return out;
  }

  // ---------- PDF (uma imagem por página, com link do WhatsApp no rodapé) ----------
  async function montarPDF(canvases, linkRodape, fracRodape) {
    const enc = new TextEncoder(), partes = [], offs = [];
    let pos = 0;
    const add = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; partes.push(b); pos += b.length; };
    const obj = (n, corpo) => { offs[n] = pos; add(n + ' 0 obj\n'); corpo(); add('\nendobj\n'); };
    const jpgs = await Promise.all(canvases.map((c) => new Promise((ok) => c.toBlob((b) => b.arrayBuffer().then((a) => ok(new Uint8Array(a))), 'image/jpeg', 0.9))));
    const PW = 595.28, PH = 841.89, n = canvases.length, porPag = 4, ult = 2 + n * porPag;
    const uri = String(linkRodape || '').replace(/[\\()]/g, (c) => '\\' + c);
    add('%PDF-1.4\n'); add(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
    obj(1, () => add('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => add('<< /Type /Pages /Kids [' + canvases.map((_, i) => (3 + i * porPag) + ' 0 R').join(' ') + '] /Count ' + n + ' >>'));
    canvases.forEach((c, i) => {
      const pg = 3 + i * porPag, im = pg + 1, ct = pg + 2, an = pg + 3;
      obj(pg, () => add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] /Resources << /XObject << /Im0 ' + im + ' 0 R >> >> /Contents ' + ct + ' 0 R' + (uri ? ' /Annots [' + an + ' 0 R]' : '') + ' >>'));
      obj(im, () => { add('<< /Type /XObject /Subtype /Image /Width ' + c.width + ' /Height ' + c.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpgs[i].length + ' >>\nstream\n'); add(jpgs[i]); add('\nendstream'); });
      const s = 'q ' + PW + ' 0 0 ' + PH + ' 0 0 cm /Im0 Do Q';
      obj(ct, () => add('<< /Length ' + s.length + ' >>\nstream\n' + s + '\nendstream'));
      obj(an, () => add('<< /Type /Annot /Subtype /Link /Rect [0 0 ' + PW + ' ' + (PH * fracRodape).toFixed(2) + '] /Border [0 0 0] /A << /S /URI /URI (' + uri + ') >> >>'));
    });
    const xref = pos;
    add('xref\n0 ' + (ult + 1) + '\n0000000000 65535 f \n');
    for (let k = 1; k <= ult; k++) add(String(offs[k]).padStart(10, '0') + ' 00000 n \n');
    add('trailer\n<< /Size ' + (ult + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    return new Blob(partes, { type: 'application/pdf' });
  }

  const paraBlob = (c) => new Promise((ok) => c.toBlob(ok, 'image/png'));
  function baixar(blob, nome) {
    const u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 8000);
  }
  async function compartilhar(blob, nome) {
    const f = new File([blob], nome, { type: blob.type });
    if (!(navigator.canShare && navigator.canShare({ files: [f] }))) return false;
    try { await navigator.share({ files: [f], title: 'Catálogo RB Tech Celulares' }); } catch (e) { /* cancelou */ }
    return true;
  }

  // ---------- tela ----------
  function abrir(cat) {
    const camp = RB.configCampanha(cat);
    const est = {
      onde: new Set(['vitrine']), categoria: 'todas', tema: camp.ativo && RB.CAMPANHAS[camp.tema] ? camp.tema : 'blackfriday',
      formato: 'stories', ordem: 'menor', riscado: true, parcelado: true, bateria: true, subtitulo: '', fora: new Set(), versao: 0, paginas: []
    };
    const chip = (g, v, t, on) => '<button type="button" class="ci-chip' + (on ? ' on' : '') + '" data-g="' + g + '" data-v="' + esc(v) + '">' + t + '</button>';
    const el = document.createElement('div');
    el.className = 'ci';
    el.innerHTML =
      '<div class="ci-box" role="dialog" aria-modal="true" aria-label="Catálogo em imagem">' +
        '<div class="ci-topo"><b>🖼️ Catálogo em PNG e PDF</b><button type="button" class="ci-x" aria-label="Fechar">×</button></div>' +
        '<div class="ci-corpo">' +
          '<div class="ci-op">' +
            '<div class="ci-grupo"><span>Quais aparelhos entram</span><div class="ci-chips">' + ONDE.map(([v, t]) => chip('onde', v, t, est.onde.has(v))).join('') + '</div></div>' +
            '<div class="ci-grupo"><span>Categoria</span><div class="ci-chips">' + [['todas', 'Todos']].concat(RB.CATEGORIAS.map((c) => [c.id, c.nome])).map(([v, t]) => chip('categoria', v, t, est.categoria === v)).join('') + '</div></div>' +
            '<div class="ci-grupo"><span>Skin</span><div class="ci-chips">' + [['rbtech', '✨ RB Tech']].concat(Object.keys(RB.CAMPANHAS).map((id) => [id, RB.CAMPANHAS[id].emoji + ' ' + RB.CAMPANHAS[id].nome])).map(([v, t]) => chip('tema', v, t, est.tema === v)).join('') + '</div></div>' +
            '<div class="ci-grupo"><span>Formato</span><div class="ci-chips">' + Object.keys(FORMATOS).map((v) => chip('formato', v, (v === 'pdf' ? '📄 ' : '🖼️ ') + FORMATOS[v].nome + ' <small>' + FORMATOS[v].dica + '</small>', est.formato === v)).join('') + '</div></div>' +
            '<label class="ci-campo"><span>Frase do topo (opcional)</span><input type="text" data-subtitulo maxlength="70" placeholder="Em branco usa a frase da skin"></label>' +
            '<div class="ci-grupo"><span>Mostrar</span><div class="ci-checks">' +
              '<label><input type="checkbox" data-opc="riscado" checked> Preço "de" riscado</label>' +
              '<label><input type="checkbox" data-opc="parcelado" checked> Parcelado</label>' +
              '<label><input type="checkbox" data-opc="bateria" checked> Bateria</label>' +
              '<select data-ordem>' + ORDENS.map(([v, t]) => '<option value="' + v + '">' + t + '</option>').join('') + '</select>' +
            '</div></div>' +
            '<div class="ci-grupo"><span>Aparelhos no catálogo: <b data-n>0</b></span>' +
              '<div class="ci-chips"><button type="button" class="ci-chip" data-todos>Marcar todos</button><button type="button" class="ci-chip" data-nenhum>Desmarcar todos</button></div>' +
              '<ul class="ci-lista" data-lista></ul></div>' +
          '</div>' +
          '<div class="ci-prev"><div class="ci-acoes" data-acoes></div><div class="ci-paginas" data-paginas></div></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    document.body.classList.add('ci-aberto');
    const fechar = () => { est.versao++; el.remove(); document.body.classList.remove('ci-aberto'); document.removeEventListener('keydown', tecla); };
    const tecla = (e) => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('keydown', tecla);
    $('.ci-x', el).addEventListener('click', fechar);
    el.addEventListener('click', (e) => { if (e.target === el) fechar(); });

    const candidatos = () => {
      const filtros = ONDE.filter(([v]) => est.onde.has(v)).map((x) => x[2]);
      const l = cat.produtos.filter((p) => filtros.some((f) => f(p)) && (est.categoria === 'todas' || RB.categoria(p) === est.categoria));
      const preco = (p) => Number(p.preco) || 0;
      l.sort(est.ordem === 'maior' ? (a, b) => preco(b) - preco(a) : est.ordem === 'modelo' ? (a, b) => RB.nomeProduto(a).localeCompare(RB.nomeProduto(b), 'pt-BR', { numeric: true }) || preco(a) - preco(b) : (a, b) => preco(a) - preco(b));
      return l;
    };
    function desenharLista() {
      const l = candidatos();
      $('[data-lista]', el).innerHTML = l.length ? l.map((p) => '<li><label><input type="checkbox" data-id="' + esc(p.id) + '"' + (est.fora.has(p.id) ? '' : ' checked') + '>' +
        '<span><b>' + esc(RB.nomeProduto(p)) + '</b><small>' + esc([p.cor, p.condicao].filter(Boolean).join(' · ')) + ' · ' + money(RB.valorPix(cat, p.preco)) + '</small></span></label></li>').join('')
        : '<li class="ci-vazio">Nenhum aparelho com esses filtros.</li>';
      $('[data-n]', el).textContent = l.filter((p) => !est.fora.has(p.id)).length;
      agendar();
    }
    let timer = 0;
    const agendar = () => {
      clearTimeout(timer); est.versao++; // a versão anterior para de valer (os botões dela somem)
      const ac = $('[data-acoes]', el); if (ac) ac.innerHTML = '<span class="ci-gerando">Gerando…</span>';
      timer = setTimeout(gerar, 220);
    };
    async function gerar() {
      const v = ++est.versao, F = FORMATOS[est.formato];
      const lista = candidatos().filter((p) => !est.fora.has(p.id));
      const box = $('[data-paginas]', el), acoes = $('[data-acoes]', el);
      if (!lista.length) { box.innerHTML = '<p class="ci-vazio">Escolha pelo menos um aparelho.</p>'; acoes.innerHTML = ''; return; }
      acoes.innerHTML = '<span class="ci-gerando">Gerando…</span>';
      const pags = await paginas(cat, lista, F, paleta(est.tema), est, () => v !== est.versao);
      if (!pags || v !== est.versao) return;
      est.paginas = pags;
      const base = 'catalogo-rbtech-' + (est.tema === 'rbtech' ? 'ofertas' : est.tema) + '-' + est.formato;
      box.innerHTML = '';
      pags.forEach((c, i) => {
        const fig = document.createElement('figure');
        fig.className = 'ci-pag ci-' + est.formato;
        c.className = 'ci-canvas';
        fig.appendChild(c);
        if (F.ext === 'png') {
          const cap = document.createElement('figcaption');
          cap.innerHTML = '<span>Página ' + (i + 1) + ' de ' + pags.length + '</span><button type="button" class="ci-bt" data-baixar="' + i + '">⬇️ PNG</button>' +
            (navigator.canShare ? '<button type="button" class="ci-bt" data-compartilhar="' + i + '">📤 Enviar</button>' : '');
          fig.appendChild(cap);
        }
        box.appendChild(fig);
      });
      acoes.innerHTML = F.ext === 'pdf'
        ? '<button type="button" class="ci-bt ci-ouro" data-pdf>📄 Baixar PDF (' + pags.length + (pags.length > 1 ? ' páginas' : ' página') + ')</button>' + (navigator.canShare ? '<button type="button" class="ci-bt" data-pdf-enviar>📤 Enviar PDF</button>' : '')
        : '<button type="button" class="ci-bt ci-ouro" data-todas>⬇️ Baixar ' + (pags.length > 1 ? 'as ' + pags.length + ' imagens' : 'a imagem') + '</button>';
      acoes.dataset.base = base;
      acoes.insertAdjacentHTML('beforeend', '<small>' + lista.length + ' aparelho' + (lista.length > 1 ? 's' : '') + ' · ' + F.nome + ' ' + F.dica + '</small>');
    }
    const linkWhats = () => { const n = String((cat.loja || {}).whatsapp || '').replace(/\D/g, ''); return n ? 'https://wa.me/' + n + '?text=' + encodeURIComponent('Olá! Vi o catálogo da RB Tech e quero saber mais.') : ''; };
    async function pdfAtual() { return montarPDF(est.paginas, linkWhats(), FORMATOS.pdf.rodape / FORMATOS.pdf.H); }

    el.addEventListener('click', async (e) => {
      const c = e.target.closest('[data-g]');
      if (c) {
        const g = c.dataset.g, v = c.dataset.v;
        if (g === 'onde') { if (est.onde.has(v) && est.onde.size > 1) est.onde.delete(v); else est.onde.add(v); }
        else est[g] = v;
        $$('[data-g="' + g + '"]', el).forEach((b) => b.classList.toggle('on', g === 'onde' ? est.onde.has(b.dataset.v) : b.dataset.v === est[g]));
        return desenharLista();
      }
      if (e.target.closest('[data-todos]')) { est.fora.clear(); return desenharLista(); }
      if (e.target.closest('[data-nenhum]')) { candidatos().forEach((p) => est.fora.add(p.id)); return desenharLista(); }
      const base = $('[data-acoes]', el).dataset.base || 'catalogo-rbtech';
      const bx = e.target.closest('[data-baixar]'), cp = e.target.closest('[data-compartilhar]');
      if (bx) return baixar(await paraBlob(est.paginas[+bx.dataset.baixar]), base + '-' + (+bx.dataset.baixar + 1) + '.png');
      if (cp) { const i = +cp.dataset.compartilhar; const b = await paraBlob(est.paginas[i]); if (!(await compartilhar(b, base + '-' + (i + 1) + '.png'))) baixar(b, base + '-' + (i + 1) + '.png'); return; }
      if (e.target.closest('[data-todas]')) {
        for (let i = 0; i < est.paginas.length; i++) { baixar(await paraBlob(est.paginas[i]), base + '-' + (i + 1) + '.png'); await new Promise((ok) => setTimeout(ok, 450)); }
        return;
      }
      if (e.target.closest('[data-pdf]')) return baixar(await pdfAtual(), base.replace(/-pdf$/, '') + '.pdf');
      if (e.target.closest('[data-pdf-enviar]')) { const b = await pdfAtual(), nome = base.replace(/-pdf$/, '') + '.pdf'; if (!(await compartilhar(b, nome))) baixar(b, nome); }
    });
    el.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      if (id) { if (e.target.checked) est.fora.delete(id); else est.fora.add(id); $('[data-n]', el).textContent = candidatos().filter((p) => !est.fora.has(p.id)).length; return agendar(); }
      if (e.target.dataset.opc) { est[e.target.dataset.opc] = e.target.checked; return agendar(); }
      if (e.target.matches('[data-ordem]')) { est.ordem = e.target.value; return desenharLista(); }
    });
    $('[data-subtitulo]', el).addEventListener('input', (e) => { est.subtitulo = e.target.value; agendar(); });
    desenharLista();
  }

  w.RBCatalogoImg = { abrir, paleta, montarPDF, FORMATOS };
})(window);
